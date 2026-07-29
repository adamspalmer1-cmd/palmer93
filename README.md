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
- **Phase 2 — AI Opportunity Engine** analyzes active markets with Claude,
  producing an immutable, versioned research record per analysis: a
  fair-probability range, a deterministic Opportunity Score (never
  self-graded by the model), evidence with independent duplicate/
  credibility handling, resolution-risk assessment, and a mandatory
  self-critique. Surfaced via a sortable/filterable Opportunity Scanner, a
  market-detail analysis panel with a fair-value chart overlay, and an
  admin cost/latency/reliability dashboard. Still not a trading bot: no
  orders, no automatic trades, no "Daily Top 10" report yet (Phase 3,
  pending approval). See [`AI_ENGINE.md`](./AI_ENGINE.md) for the full
  design.

See [`docs/`](./docs) for the full architecture, tech stack, database schema,
API integration plan, security model, wireframes, roadmap, and (Phase 1.5)
the per-job data pipeline reference. See [`AI_ENGINE.md`](./AI_ENGINE.md)
and its linked documents for the Phase 2 AI Opportunity Engine specifically.

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

The AI Opportunity Engine's cost/eligibility limits (max markets per run,
daily spend cap, liquidity/spread thresholds, reanalysis cooldown, model
token pricing) are also environment-configurable, with sane defaults —
see [`COST_CONTROLS.md`](./COST_CONTROLS.md) for the full list.

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
and `refresh-order-books` every 5 minutes, `archive-markets` hourly, and
`analyze-markets` (below) hourly.

### 6. Check pipeline health

Sign in and visit `/admin/health` for cron status, database health,
data-quality warnings, error history, and market metrics. Any signed-in
user can view it — Phase 1 intentionally has no admin/role system yet (see
`docs/07-security.md`).

### 7. Run the AI Opportunity Engine

Requires `ANTHROPIC_API_KEY`. Trigger a batch analysis run manually:

```bash
curl -X POST http://localhost:3000/api/cron/analyze-markets \
  -H "x-ingest-secret: <your CRON_SECRET>"

# Retry just the markets that failed in a prior run:
curl -X POST "http://localhost:3000/api/cron/analyze-markets?resumeFromRunId=<id>" \
  -H "x-ingest-secret: <your CRON_SECRET>"
```

Or trigger a single market on demand (signed-in user, from the app or
directly):

```bash
curl -X POST http://localhost:3000/api/markets/<market-id>/analysis \
  -H "Cookie: <your session cookie>"
```

Then sign in and visit `/scanner` (ranked, filterable analyses) or a
market's detail page (full analysis + fair-value chart overlay), and
`/admin/ai-engine` for cost/latency/reliability metrics. See
[`AI_ENGINE.md`](./AI_ENGINE.md) for the full pipeline and
[`COST_CONTROLS.md`](./COST_CONTROLS.md) for the budget limits that keep
this from running away.

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
  detail (now with the AI analysis panel + fair-value chart overlay),
  watchlist, opportunity scanner, admin health + AI engine ops dashboards
  (markets/categories are publicly browsable; the dashboard overview,
  watchlist, scanner, and admin pages require sign-in)
- `src/app/api/cron/*` — the four background jobs (sync-markets,
  refresh-order-books, archive-markets from Phase 1.5; analyze-markets
  from Phase 2); `src/app/api/ingest/markets` runs the first three in sequence
- `src/app/api/markets/[id]/analysis` — on-demand AI Opportunity Engine
  trigger (Phase 2); `src/app/api/markets/[id]/analyze` is the earlier,
  still-present Phase 1 single-signal route
- `src/lib/services` — reusable, independently-testable data services
  (markets, events, categories, price history, order books, charts, sync
  orchestration, data quality, market stats from Phase 1.5; analysis
  eligibility/context/persistence/runs, reanalysis, opportunity scanner,
  analysis detail, and AI engine metrics from Phase 2) — see
  `docs/05-api-integration.md` § 5.7
- `src/lib/sync` — retry/backoff (`retry.ts`) and cron authorization
- `src/lib/polymarket` — Gamma/CLOB API clients and normalization
- `src/lib/supabase` — browser/server/admin Supabase clients
- `src/lib/ai` — the AI Opportunity Engine: structured-output schema +
  validation, deterministic opportunity scoring, evidence pipeline, cost
  controls, the Claude call itself, and the single-market/batch
  orchestrators — see [`AI_ENGINE.md`](./AI_ENGINE.md)
- `supabase/migrations` — versioned SQL schema + RLS policies
- `tests/helpers/fake-supabase.ts` — in-memory Supabase query-builder stand-in used to unit test the service layer

## Status

Phase 2 (this repository) is feature-complete: tests, lint, typecheck, and
production build all pass. Per the project brief, work stops here pending
approval before starting the Daily Top 10 report (Phase 3, see
[`docs/09-roadmap.md`](./docs/09-roadmap.md)).
