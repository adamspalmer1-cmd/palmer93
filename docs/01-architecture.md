# 1. Overall Application Architecture

## System context

```
                     ┌───────────────────────────┐
                     │        Browser (User)      │
                     └──────────────┬─────────────┘
                                    │ HTTPS
                     ┌──────────────▼─────────────┐
                     │   Next.js App (Vercel)      │
                     │  - App Router RSC + client   │
                     │  - API routes / route handlers│
                     │  - Edge middleware (auth)     │
                     └───┬───────────────┬─────────┘
                         │               │
             Supabase JS │               │ Server-side only
                 client  │               │
        ┌────────────────▼───┐   ┌───────▼─────────────┐
        │      Supabase        │   │  External APIs       │
        │ - Postgres            │   │ - Polymarket Gamma    │
        │ - Auth                │   │ - Polymarket CLOB     │
        │ - Row Level Security  │   │ - Polymarket Data API │
        │ - Realtime (optional) │   │ - Anthropic Claude API│
        └───────────┬───────────┘   └───────────┬──────────┘
                    │                            │
        ┌───────────▼────────────────────────────▼──────────┐
        │        Ingestion Service (scheduled job)            │
        │  Vercel Cron -> Route Handler -> fetch Polymarket    │
        │  Gamma/CLOB -> upsert into Supabase Postgres         │
        └───────────────────────────────────────────────────┘
```

## Layers

1. **Presentation (Next.js App Router, RSC-first).** Server components fetch
   data directly from Supabase/Postgres for fast, cache-friendly reads.
   Client components are reserved for interactivity (search-as-you-type,
   filter chips, charts, auth forms).
2. **Application/API layer (Route Handlers).** `app/api/*` handlers own all
   calls to Polymarket and Anthropic — API keys and service-role Supabase
   credentials never reach the browser. This layer also exposes the
   ingestion webhook consumed by Vercel Cron.
3. **Data layer (Supabase Postgres).** System of record for normalized
   market/event data, ingestion metadata, price snapshots, user accounts
   (via Supabase Auth), watchlists, and AI analysis cache. Row Level
   Security (RLS) enforces per-user data isolation.
4. **Background jobs (Phase 1.5).** Three scheduled, idempotent jobs —
   `sync-markets`, `refresh-order-books`, `archive-markets` — pull from
   Polymarket's Gamma/CLOB APIs and upsert into Postgres, each with its own
   run record, retry/backoff, and per-item partial failure recovery. See
   `docs/10-data-pipeline.md`. Decoupled from user request/response cycles
   so the dashboard is never blocked on an upstream API call.
5. **Service layer (Phase 1.5).** `lib/services/*` is where every layer
   above actually touches data — markets/events/categories, price history,
   order books, sync orchestration, data quality, market stats. Each
   service takes its Supabase client as a parameter instead of constructing
   one, so it's independently unit-testable without a live database or
   request context (see `docs/05-api-integration.md` § 5.7). Route handlers
   and Server Components are thin callers of this layer, not where business
   logic lives.
6. **AI reasoning layer.** Server-side calls to the Claude API, given
   normalized market + price + (future) news context, producing structured,
   cached "signal" output. Phase 1 shipped the plumbing (a single
   market-analysis endpoint); Phase 1.5 deliberately left this layer
   untouched to focus on data-pipeline reliability first.

## Why RSC + a separate ingestion job (not client-side polling Polymarket)

- Keeps third-party API keys server-side only.
- Avoids CORS/rate-limit issues hitting Polymarket directly from the browser.
- Lets the dashboard render instantly from Postgres (which is co-located,
  indexed, and fast) instead of waiting on an upstream HTTP call per page view.
- Gives us a durable, queryable history of prices/markets independent of
  Polymarket's own retention/granularity limits.

## Request flow examples

**Dashboard market list load:** Browser → Next.js server component → Supabase
Postgres (`markets` + `events` tables, indexed, paginated) → HTML streamed to
client. No Polymarket call in the hot path.

**Ingestion cycle (every N minutes via Vercel Cron):** Cron → `POST
/api/ingest/markets` (protected by a secret header) → Gamma API `/events`
paginated fetch → normalize → upsert `events`/`markets` → for tracked
markets, fetch CLOB `/prices-history` → insert into `price_snapshots`.

**AI analysis (on-demand, user-triggered):** Browser → `POST
/api/markets/[id]/analyze` → server loads market + recent price snapshots
from Supabase → calls Claude API with a structured prompt → stores result in
`ai_analyses` (cached, keyed by market + content hash) → returns to client.

**Pipeline health check (Phase 1.5, on-demand, signed-in user):** Browser →
`/admin/health` Server Component → in parallel, `lib/services/cron-status`,
`database-health`, `data-quality`, `sync-runs`, and `market-stats` each query
Supabase directly (no Polymarket calls in this path) → rendered as cron
status, data-quality warnings, error history, and market metrics.
