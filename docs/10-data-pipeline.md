# 10. Data Pipeline Reference (Phase 1.5)

This is the authoritative reference for every background job and
synchronization process in MarketSignal. Each job is a thin Next.js route
handler over a function in `lib/services/sync.service.ts`; the route only
adds authorization and HTTP plumbing, so the behavior described here is
exercised directly (no HTTP) by `tests/unit/sync-service.test.ts`.

All jobs share:

- **Authorization:** `lib/sync/cron-auth.ts` — a `CRON_SECRET`-gated check
  accepting either `Authorization: Bearer <CRON_SECRET>` (how Vercel Cron
  invokes a route) or an `x-ingest-secret` header (manual/local triggering).
- **Run tracking:** every invocation writes an `ingestion_runs` row up front
  (`status = 'running'`) and updates it on completion with `status`
  (`success`/`partial`/`failed`), `duration_ms`, and per-job counters —
  see `lib/services/sync-runs.service.ts`.
- **Database access:** the service-role Supabase client
  (`lib/supabase/admin.ts`, bypasses RLS), since these are trusted
  server-to-server jobs, not user requests.
- **Idempotency:** every write keys off Polymarket's own ids
  (`onConflict: 'id'` for upserts, `archived`/`resolved_at` transitions are
  one-directional), so re-running any job — on schedule or manually — is
  always safe.

---

## `sync-markets`

- **Route:** `POST /api/cron/sync-markets` (also `GET`, for Vercel Cron)
- **Schedule:** every 5 minutes (`vercel.json`)
- **Service function:** `syncMarkets(db)` in `lib/services/sync.service.ts`
- **Purpose:** pulls every active, non-closed event (with nested markets)
  from Polymarket's Gamma API and upserts them.

**Steps:**

1. `fetchActiveEvents({ limit: 100, maxPages: 10 })` — paginates Gamma's
   `/events?active=true&closed=false&order=volume24hr` until a page returns
   fewer than `limit` results or the page cap is hit (safety valve against
   an unbounded/misbehaving upstream).
2. For **each event** (not as one bulk batch — see Partial Failure Recovery
   below):
   a. Normalize and upsert the event row (`events` table).
   b. Normalize and upsert its markets (`markets` table).
   c. On any error in (a) or (b), catch it, count every market in that
      event as failed, record a `sync_failures` row
      (`stage: 'upsert_event'`), and move on to the next event.
3. `markResolvedMarkets(db)` — stamps `resolved_at = now()` on any market
   whose `resolved_outcome` is newly non-null and whose `resolved_at` is
   still unset. Idempotent: a market that was already resolved on a prior
   run is never touched again, so `resolved_at` reflects when the
   resolution was first observed, not the most recent sync time.
4. Finish the run: `status = 'partial'` if any event failed, else
   `'success'`.

**What it does *not* do:** call any authenticated/order-placement Polymarket
endpoint, or touch order books/liquidity (that's `refresh-order-books`).

**Failure modes:**

- A single event's upsert fails (e.g. an unexpected constraint violation) →
  isolated per event, run finishes `'partial'`, other events are unaffected.
- The Gamma API is unreachable even after retries (`fetchJsonWithRetry`
  already retried transient failures) → the whole run throws, is marked
  `'failed'` with the error message, and the route returns HTTP 500 so
  Vercel Cron surfaces the failure. No partial event data is lost — whatever
  was upserted before the failure stays committed.

---

## `refresh-order-books`

- **Route:** `POST /api/cron/refresh-order-books` (also `GET`)
- **Schedule:** every 5 minutes (`vercel.json`)
- **Service function:** `refreshOrderBooks(db, batchSize = 25)`
- **Purpose:** keeps `best_bid`/`best_ask`/`mid_price`/`spread` current for
  the markets people are actually looking at, and grows `price_snapshots`.

**Steps:**

1. `getMarketsForOrderBookRefresh(db, batchSize)` — the top `batchSize`
   (default 25) active, non-archived markets by `volume_24hr`, excluding any
   with no CLOB token id. This batch size bounds CLOB request volume per
   run; it does not attempt to refresh every market every cycle.
2. For **each market**:
   a. `fetchOrderBookSummary(tokenId)` — `GET /book?token_id=...`,
      reduced to best bid (max of bids)/best ask (min of asks), computed
      defensively rather than trusting the response's sort order.
   b. Update the market row's `best_bid`/`best_ask`/`mid_price`/`spread`/
      `last_synced_at`.
   c. `insertSnapshotIfChanged` — write a `price_snapshots` row from the
      new `mid_price`, but only if it represents new information (see
      `docs/05-api-integration.md` § 5.2.1 for the exact dedup rule).
   d. On any error in (a)–(c), catch it, record a `sync_failures` row
      (`stage: 'order_book'`), and continue to the next market.
3. Finish the run: `status = 'partial'` if any market failed, else
   `'success'`.

**Failure modes:** one market's CLOB request failing (timeout, 404 for a
delisted token, malformed book) never blocks the rest of the batch.

---

## `archive-markets`

- **Route:** `POST /api/cron/archive-markets` (also `GET`)
- **Schedule:** hourly (`vercel.json`)
- **Service function:** `archiveMarkets(db, graceDays = 3)`
- **Purpose:** retires long-closed markets from the active sync/order-book
  set so those jobs' working sets don't grow unbounded over the platform's
  lifetime.

**Steps:**

1. Load every closed, non-archived market's `id`/`resolved_at`/`end_date`.
2. In application code (not a PostgREST `.or()` expression — see the
   testability note in `markets.service.ts`), select the ids where
   `resolved_at` (or `end_date`, if never resolved) is older than
   `graceDays` (default 3) — `isPastArchiveGrace`, a pure, unit-tested rule.
3. `UPDATE markets SET archived = true WHERE id IN (...)`.

**Why a grace period:** a market that just closed may still see corrections
or late resolution; archiving immediately would remove it from
`refresh-order-books`' batch selection before its final price settles.

**One-way transition:** `archived` never flips back to `false` by any job.
If a market needs to be un-archived, that's a manual operation.

---

## Full sync (`/api/ingest/markets`)

Runs `syncMarkets` → `refreshOrderBooks` → `archiveMarkets` in sequence,
each with its own run record and failure isolation (a failure in one step
doesn't prevent the next from running). Kept for backward compatibility
with Phase 1 and as a manual "sync everything right now" trigger — not on
the Vercel Cron schedule itself, since the three granular jobs above cover
the recurring case without duplicating Gamma/CLOB requests.

```bash
curl -X POST https://<your-deployment>/api/ingest/markets \
  -H "x-ingest-secret: <CRON_SECRET>"
```

---

## Retry, backoff, rate-limit, and timeout handling

Implemented once in `lib/sync/retry.ts` (generic, dependency-free) and
`lib/polymarket/http.ts` (`fetchJsonWithRetry`, used by every Gamma/CLOB
call):

- **Timeout:** every request is wrapped in an `AbortController` with a 10s
  timeout.
- **Retryable classification:** HTTP 429 and 5xx responses, plus network/
  timeout errors, are retryable; other 4xx responses are not (retrying a
  malformed request wastes the attempt budget without changing the
  outcome).
- **Backoff:** "full jitter" exponential backoff — each retry waits a
  random duration between 0 and `min(maxDelayMs, baseDelayMs * 2^attempt)`,
  so many concurrent retriers don't all collide on the same instant.
- **Rate limits:** a 429's `Retry-After` header (seconds or an HTTP date) is
  parsed and honored verbatim in place of the computed backoff delay.
- **Max attempts:** 3 by default (2 for the chart's live-fallback price
  history call, since that path already has a stored-snapshot-first
  strategy and a slow live fallback is worse than a fast empty result).

## Partial failure recovery

Both `sync-markets` and `refresh-order-books` process their work item by
item (one event, one market) rather than as a single bulk operation. A
failure on one item:

1. Is caught locally (not left to bubble up and abort the loop).
2. Is recorded to `sync_failures` with enough context to debug (`run_id`,
   `job_name`, `market_id`/`event_id`, `stage`, the error message).
3. Increments that run's failure counter, which downgrades the run's final
   `status` from `'success'` to `'partial'` — visible on `/admin/health`
   without needing to read logs.
4. Does not prevent the remaining items in the batch from being processed.

A job-level failure (the upstream API itself is unreachable, not a
per-item problem) is different: it aborts the whole run, marks it
`'failed'`, and rethrows so the HTTP layer returns 500 and the scheduler's
own failure tracking (Vercel Cron logs) also sees it.
