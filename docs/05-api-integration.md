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
  data. Phase 1 fetches this on-demand when a user opens a market detail
  page (short server-side cache, ~60s) and also periodically via the
  ingestion job to backfill `price_snapshots` for tracked/high-volume
  markets, since upstream fidelity degrades for closed markets over time.

We intentionally never call CLOB's authenticated (L1/L2) or order-placement
endpoints — MarketSignal has no trading feature by design.

## 5.3 Polymarket — Data API (`https://data-api.polymarket.com`)

Reserved for a later phase (holder/activity data to enrich AI context).
Not called in Phase 1 beyond documenting the integration point.

## 5.4 Ingestion service design

- Trigger: Vercel Cron (`vercel.json` → `crons`) hitting `POST
  /api/ingest/markets` every 5 minutes.
- Auth: the route checks a shared secret header
  (`x-ingest-secret` == `process.env.CRON_SECRET`) so it can't be triggered
  by arbitrary requests; Vercel Cron sends this header automatically when
  configured via `Authorization: Bearer` per Vercel's cron docs, or we
  enforce it ourselves.
- Behavior: fetch active events/markets from Gamma (paginated), upsert into
  `events`/`markets` using the Supabase **service-role** client
  (`lib/supabase/admin.ts`, server-only, never imported into client code),
  record an `ingestion_runs` row, and on success fetch fresh
  `/prices-history` for the top-N markets by volume, inserting into
  `price_snapshots`.
- Idempotency: all upserts key off Polymarket's own ids (`onConflict:
  'id'`), so re-running the job is always safe.
- Failure handling: wrap the whole run in try/catch; on error, still write
  an `ingestion_runs` row with `status='failed'` and the error message, and
  return HTTP 500 so Vercel Cron logs the failure — no silent data loss.

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
  (`lib/polymarket/gamma.ts` / `clob.ts`) with timeout + retry (exponential
  backoff, max 3 attempts) and typed error surfaces.
- The ingestion job is the only place we poll Polymarket in bulk, so
  per-user browser traffic never amplifies into upstream API load.
- Anthropic calls are user-triggered but capped by the cache above; a
  simple per-user rate limit (e.g. N analyses/hour) is a Phase 2 hardening
  item, tracked in the roadmap.
