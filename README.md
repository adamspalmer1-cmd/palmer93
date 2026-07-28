# MarketSignal

An AI-powered research platform for Polymarket prediction markets. MarketSignal
surfaces potentially mispriced markets through data analysis, news analysis,
and AI reasoning. **It is not a trading bot** — there is no order placement,
no wallet custody, and no portfolio management, by design.

- **Phase 1** delivered the foundation: authentication, landing page,
  dashboard shell, database models, a Polymarket ingestion service, an
  active market list with search/filters/categories, a market detail page
  with a historical price chart, and a first Claude-powered research signal.
- **Phase 1.5** hardened the data pipeline before any AI opportunity-detection
  work: order-book refresh (best bid/ask/mid/spread), market archival,
  retry/backoff/rate-limit/timeout handling, per-item partial failure
  recovery, deduplicated historical snapshots with range-based retrieval, a
  `/admin/health` dashboard, an eight-check data-quality validation service,
  and a reusable, independently-testable service layer.

See [`docs/`](./docs) for the full architecture, tech stack, database schema,
API integration plan, security model, wireframes, roadmap, and (Phase 1.5)
the per-job data pipeline reference.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Postgres +
Auth) · Polymarket Gamma/CLOB APIs · Anthropic Claude API · Vercel.

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill in real values:

```bash
cp .env.example .env.local
```

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project settings → API (keep secret) |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `CRON_SECRET` | Any random string — protects every ingestion/cron endpoint |

### 3. Set up the database

With the [Supabase CLI](https://supabase.com/docs/guides/cli) linked to your
project (`supabase link`), apply the migrations in `supabase/migrations`:

```bash
supabase db push
```

This creates all tables, indexes, and Row Level Security policies, and seeds
the `categories` table.

### 4. Run the app

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000). The landing page,
market list, and category pages render immediately; they'll show empty
states until a sync job has populated the database.

### 5. Populate market data

Three background jobs keep the database in sync with Polymarket — see
[`docs/10-data-pipeline.md`](./docs/10-data-pipeline.md) for the full
reference. Trigger them manually while developing:

```bash
# Fetch active events/markets from Gamma and upsert them
curl -X POST http://localhost:3000/api/cron/sync-markets \
  -H "x-ingest-secret: <your CRON_SECRET>"

# Refresh best bid/ask/mid/spread + a price snapshot for top markets
curl -X POST http://localhost:3000/api/cron/refresh-order-books \
  -H "x-ingest-secret: <your CRON_SECRET>"

# Archive markets that have been closed for 3+ days
curl -X POST http://localhost:3000/api/cron/archive-markets \
  -H "x-ingest-secret: <your CRON_SECRET>"

# Or run all three in sequence in one call:
curl -X POST http://localhost:3000/api/ingest/markets \
  -H "x-ingest-secret: <your CRON_SECRET>"
```

In production, `vercel.json` configures Vercel Cron to call `sync-markets`
and `refresh-order-books` every 5 minutes and `archive-markets` hourly.

### 6. Check pipeline health

Sign in and visit `/admin/health` for cron status, database health,
data-quality warnings, error history, and market metrics. Any signed-in
user can view it — Phase 1 intentionally has no admin/role system yet (see
`docs/07-security.md`).

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Run the Vitest unit/component test suite |

## Project structure

See [`docs/03-folder-structure.md`](./docs/03-folder-structure.md) for the
full layout and rationale. Highlights:

- `src/app/(marketing)` — public landing page
- `src/app/(auth)` — sign in / sign up
- `src/app/(dashboard)` — dashboard shell, markets, categories, market
  detail, watchlist, admin health dashboard (markets/categories are
  publicly browsable; the dashboard overview, watchlist, and health
  dashboard require sign-in)
- `src/app/api/cron/*` — the three background jobs (Phase 1.5); `src/app/api/ingest/markets` runs all three in sequence
- `src/app/api/markets/[id]` — price history and Claude analysis routes
- `src/lib/services` — reusable, independently-testable data services
  (markets, events, categories, price history, order books, charts, sync
  orchestration, data quality, market stats) — see `docs/05-api-integration.md` § 5.7
- `src/lib/sync` — retry/backoff (`retry.ts`) and cron authorization
- `src/lib/polymarket` — Gamma/CLOB API clients and normalization
- `src/lib/supabase` — browser/server/admin Supabase clients
- `src/lib/ai` — Claude API integration
- `supabase/migrations` — versioned SQL schema + RLS policies
- `tests/helpers/fake-supabase.ts` — in-memory Supabase query-builder stand-in used to unit test the service layer

## Status

Phase 1.5 (this repository) is feature-complete: tests, lint, typecheck, and
production build all pass. Per the project brief, work stops here pending
approval before starting the AI Opportunity Engine (see
[`docs/09-roadmap.md`](./docs/09-roadmap.md)).
