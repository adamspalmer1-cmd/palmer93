# MarketSignal — Phase 1

An AI-powered research platform for Polymarket prediction markets. MarketSignal
surfaces potentially mispriced markets through data analysis, news analysis,
and AI reasoning. **It is not a trading bot** — there is no order placement,
no wallet custody, and no portfolio management, by design.

Phase 1 delivers the foundation: authentication, landing page, dashboard
shell, database models, a Polymarket ingestion service, an active market list
with search/filters/categories, a market detail page with a historical price
chart, and a first Claude-powered research signal.

See [`docs/`](./docs) for the full architecture, tech stack, database schema,
API integration plan, security model, wireframes, and roadmap produced before
this code was written.

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
| `CRON_SECRET` | Any random string — protects the ingestion endpoint |

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
states until the ingestion job has populated the database.

### 5. Populate market data

The ingestion job pulls active markets from Polymarket's public Gamma API and
recent price history from the CLOB API. Trigger it manually while developing:

```bash
curl -X POST http://localhost:3000/api/ingest/markets \
  -H "x-ingest-secret: <your CRON_SECRET>"
```

In production, `vercel.json` configures a Vercel Cron job to call this
endpoint every 5 minutes automatically.

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
  detail, watchlist (markets/categories are publicly browsable; the
  dashboard overview and watchlist require sign-in)
- `src/app/api` — ingestion job, price history, and Claude analysis routes
- `src/lib/polymarket` — Gamma/CLOB API clients and normalization
- `src/lib/supabase` — browser/server/admin Supabase clients
- `src/lib/ai` — Claude API integration
- `supabase/migrations` — versioned SQL schema + RLS policies

## Status

Phase 1 (this repository) is feature-complete: tests, lint, typecheck, and
production build all pass. Per the project brief, work stops here pending
approval before starting Phase 2 (see
[`docs/09-roadmap.md`](./docs/09-roadmap.md)).
