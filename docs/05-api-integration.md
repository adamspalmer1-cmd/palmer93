# 5. API Integration Plan

## 5.1 Polymarket — Gamma API (`https://gamma-api.polymarket.com`)

Public, no auth. Used by the ingestion service only (not called from the
browser).

- `GET /events?active=true&closed=false&limit=100&offset=0&order=volume_24hr&ascending=false`
  — paginated event+market discovery. Response includes `has_more` for
  pagination; loop with `offset += limit` until exhausted or a safety cap.
- `GET /markets?slug=...` — fetch a single market by slug (used for
  on-demand refresh of a detail page if data is stale).
- `GET /tags` — category/tag list, used to seed/refresh `categories`.

Normalization (`lib/polymarket/normalize.ts`) maps Gamma's payload shape
into our `events`/`markets` rows, storing the untouched payload in `raw`
jsonb for forward compatibility with fields we don't model explicitly yet.

## 5.2 Polymarket — CLOB API (`https://clob.polymarket.com`)

Public reads, no auth, used only for:

- `GET /prices-history?market={tokenId}&interval=1d&fidelity=60` — chart
  data. The chart falls back to this live endpoint only when we don't yet
  have enough stored `price_snapshots` for a market (see § Historical data
  below) — otherwise it serves from our own database, which isn't subject
  to Polymarket's fidelity degradation for closed markets.
- `GET /book?token_id={tokenId}` (Phase 1.5) — the live order book for one
  outcome token. The `refresh-order-books` job (§ 5.4) reduces this to
  `best_bid`/`best_ask` (max of bids, min of asks — computed defensively
  rather than trusting the response's sort order) and derives `mid_price`/
  `spread` from them (`lib/polymarket/order-book-math.ts`, kept dependency-
  free and unit-tested independent of the fetch layer).

We intentionally never call CLOB's authenticated (L1/L2) or order-placement
endpoints — MarketSignal has no trading feature by design.

## 5.2.1 Historical data (Phase 1.5)

`price_snapshots` is our own persisted price history, retrievable by preset
range via `lib/services/price-history.service.ts`:

| Range | Window |
|---|---|
| `1h` | last hour |
| `6h` | last 6 hours |
| `24h` | last 24 hours |
| `7d` | last 7 days |
| `30d` | last 30 days |
| `all` | full history (no lower bound) |

**Duplicate-write avoidance:** `insertSnapshotIfChanged` reads the latest
stored snapshot for the market/token before writing. A new observation is
only persisted if the price moved beyond a small epsilon (`0.00005`) *or*
more than an hour has passed since the last snapshot (`maxGapMs`, default
1h) — which keeps at least one point per hour for chart continuity even on
a perfectly flat market, while never writing a duplicate row for an
unchanged price polled every few minutes. Both the epsilon and the max gap
are parameters, not hard-coded into the write path, so a caller can tune
them (e.g. a tighter epsilon for a high-value market). The decision itself
(`shouldInsertSnapshot`) is a pure function, unit tested independent of the
database call.

`GET /api/markets/[id]/price-history?range=<range>` (see § 5.7) is the
public surface for this; `lib/services/charts.service.ts` is what backs it
and the market detail page's server-rendered initial chart data.

## 5.3 Polymarket — Data API (`https://data-api.polymarket.com`)

Reserved for a later phase (holder/activity data to enrich AI context).
Not called in Phase 1 beyond documenting the integration point.

## 5.4 Background jobs (Phase 1.5)

See `docs/10-data-pipeline.md` for the full per-job reference (schedule,
inputs/outputs, retry behavior, failure isolation). Summary:

| Job | Route | Schedule | Does |
|---|---|---|---|
| `sync-markets` | `/api/cron/sync-markets` | every 5 min | Fetch active events/markets from Gamma, upsert one event at a time, stamp `resolved_at` |
| `refresh-order-books` | `/api/cron/refresh-order-books` | every 5 min | Fetch the live CLOB order book for the top-25-by-volume active markets; update `best_bid`/`best_ask`/`mid_price`/`spread`; write a deduplicated price snapshot |
| `archive-markets` | `/api/cron/archive-markets` | hourly | Mark markets `archived` once they've been closed for ≥3 days |
| full sync | `/api/ingest/markets` | manual / backward-compat | Runs all three jobs above in sequence; kept for manual "sync everything now" triggers |

All four share the same `CRON_SECRET`-gated authorization
(`lib/sync/cron-auth.ts`) and are implemented as thin route handlers over
`lib/services/sync.service.ts`, which owns the actual orchestration logic
(and is what the Phase 1.5 test suite exercises directly, without HTTP).

- **Idempotency:** every upsert keys off Polymarket's own ids (`onConflict:
  'id'`), so re-running any job is always safe.
- **Partial failure recovery:** `sync-markets` processes one event at a time
  (not one giant bulk upsert) — a single malformed event's upsert failure is
  caught, logged to `sync_failures` with the event id and stage, and the
  loop continues to the next event. `refresh-order-books` does the same per
  market. A run whose failures are all isolated per-item finishes with
  `status = 'partial'` (not `'failed'`) and the successfully-processed items
  are kept.
- **Retry, backoff, rate-limit, and timeout handling** (`lib/sync/retry.ts`,
  `lib/polymarket/http.ts`): every outbound Polymarket call goes through
  `fetchJsonWithRetry`, which retries up to 3 times with "full jitter"
  exponential backoff (`computeBackoffDelay` — capped, randomized delay so
  parallel retries don't collide), classifies 429/5xx responses and network/
  timeout errors as retryable, honors an upstream `Retry-After` header
  verbatim when present (instead of computed backoff), and treats other 4xx
  responses as non-retryable (no point retrying a malformed request). Each
  request has a 10s timeout via `AbortController`.
- **Run/observability bookkeeping:** every job invocation writes an
  `ingestion_runs` row (`job_name`, `started_at`/`finished_at`/`duration_ms`,
  `status`, per-job counters) via `lib/services/sync-runs.service.ts`, and a
  job-level failure (e.g. the Gamma API is unreachable after retries) is
  caught at the top level, marks the run `'failed'` with the error message,
  and rethrows so the route returns HTTP 500 — no silent data loss.

## 5.5 Claude API (Anthropic)

- SDK: `@anthropic-ai/sdk`, server-only (`ANTHROPIC_API_KEY` never exposed
  to the client).
- Endpoint: `POST /api/markets/[id]/analyze`. Loads the market row + last
  ~30 `price_snapshots` from Supabase, builds a structured prompt asking
  Claude to reason about the market's current pricing given the question,
  price trend, volume/liquidity, and time to resolution, and to return a
  strict JSON object (`summary`, `signal`, `confidence`, `reasoning`) —
  enforced via Claude's tool-use/structured-output feature and validated
  with `zod` before it's trusted or persisted.
- Caching: result is hashed (`market_id` + inputs + prompt version) and
  stored in `ai_analyses`; identical requests are served from cache instead
  of re-billing the API.
- Explicitly out of scope for this endpoint: any trading recommendation
  framed as financial advice to execute — output is framed as research/
  analysis only, with a disclaimer surfaced in the UI.

## 5.6 Rate limiting & resilience

- All outbound Polymarket calls go through a small wrapper
  (`lib/polymarket/http.ts`'s `fetchJsonWithRetry`, used by both
  `gamma.ts` and `clob.ts`) with timeout + retry (exponential backoff with
  jitter, `Retry-After` honored, max 3 attempts) and typed error surfaces
  (`RetryableError`) — see § 5.4 for the full behavior.
- The background jobs are the only place we poll Polymarket in bulk, so
  per-user browser traffic never amplifies into upstream API load.
- Anthropic calls are user-triggered but capped by the cache above; a
  simple per-user rate limit (e.g. N analyses/hour) is a Phase 2 hardening
  item, tracked in the roadmap.

## 5.7 Service layer (Phase 1.5)

All data access for markets, events, categories, charts, historical prices,
order books, and market statistics goes through `lib/services/*.ts`, not
directly through ad hoc Supabase calls in pages/routes. Every service
function takes its Supabase client as a parameter (`type Db =
SupabaseClient<Database>`) instead of constructing one internally — that's
what makes each one independently unit-testable (see
`tests/helpers/fake-supabase.ts` and `tests/unit/*.test.ts`) without a live
database or Next.js request context.

| Service | File | Responsibility |
|---|---|---|
| Markets | `markets.service.ts` | List/get/count, upsert, resolve/archive lifecycle, order-book batch selection |
| Events | `events.service.ts` | Upsert, lookup, referenced-id verification |
| Categories | `categories.service.ts` | List/get |
| Price history | `price-history.service.ts` | Range-bounded retrieval, dedup insert |
| Order book | `order-book.service.ts` | Refresh one market's best bid/ask/mid/spread + snapshot |
| Charts | `charts.service.ts` | Stored-snapshot-first, live-CLOB-fallback series for the UI |
| Sync orchestration | `sync.service.ts` | The three background jobs (§ 5.4) |
| Sync runs | `sync-runs.service.ts` | `ingestion_runs`/`sync_failures` read/write |
| Cron status | `cron-status.service.ts` | Per-job last-run + staleness for the health dashboard |
| Database health | `database-health.service.ts` | Round-trip latency + row counts |
| Data quality | `data-quality.service.ts` | The eight validation checks (§ 5.8) |
| Market stats | `market-stats.service.ts` | The metrics in § 5.9 |

Request-scoped callers (Server Components, route handlers) get a thin
wrapper bound to a cookie-aware client — e.g. `lib/queries/markets.ts` calls
`createClient()` then delegates to `markets.service.ts` — so page code is
unaffected by the refactor.

## 5.8 Data validation (Phase 1.5)

`lib/services/data-quality.service.ts` runs eight checks and returns
warnings (never silently drops bad data): duplicate markets (same question
within the same event), missing prices, negative liquidity, invalid
probabilities (`last_price` outside `[0, 1]`), missing categories, broken
event links (defensive — the `event_id` foreign key already prevents this;
see `07-security.md`), markets without any stored history, and stale data
(no sync within a configurable threshold, default 30 minutes).
`runDataQualityChecks` aggregates all eight into a report (warnings list +
counts by type), rendered on `/admin/health`.

## 5.9 Metrics (Phase 1.5)

`lib/services/market-stats.service.ts` computes: daily new markets (7-day,
bucketed by UTC day), daily resolved markets, average/min/max spread,
highest-liquidity market, highest-24h-volume market, largest movers (ranked
by `|price_change_24h|`, scanning the top gainers/losers rather than the
full table), most-volatile markets (standard deviation of stored snapshots
over the last 24h, scanned over the top-100-by-volume active markets), and
average sync latency per job (from `ingestion_runs.duration_ms`). All are
surfaced on `/admin/health`; see the scaling note in
`04-database-schema.md` for why these are computed in JS over a bounded
scan rather than as SQL aggregates.
