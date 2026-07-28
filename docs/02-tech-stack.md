# 2. Recommended Technology Stack

## Core (mandated by Phase 1 brief)

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js 14+ (App Router) | RSC, route handlers, middleware, built-in Vercel Cron support |
| Language | TypeScript (strict) | End-to-end type safety, including generated Supabase types |
| Styling | Tailwind CSS | Utility-first; paired with a small design-token layer for the Bloomberg/Linear look |
| Backend/DB | Supabase (Postgres + Auth + RLS) | Managed Postgres, built-in auth, generated types, storage for future use |
| Hosting | Vercel | First-class Next.js support, Cron Jobs, Edge Middleware |
| Market data | Polymarket Gamma / CLOB / Data APIs | Public, unauthenticated read endpoints only |
| AI | Anthropic Claude API (`@anthropic-ai/sdk`) | Server-side only, structured JSON output via tool use |

## Supporting libraries

- **UI primitives:** Radix UI (unstyled, accessible) + `shadcn/ui`-style
  local components — matches the "clean, modern, Terminal-meets-Linear" brief
  without pulling in a heavy component framework.
- **Charts:** `lightweight-charts` (TradingView's open-source charting lib) —
  built for financial time series, handles large datasets performantly,
  looks native to a terminal-style UI. (Recharts as a lighter fallback for
  any non-price charts.)
- **Data fetching/caching (client):** TanStack Query — for client-side
  interactive bits (search, filters, chart range switching) layered on top
  of RSC-rendered initial data.
- **Forms/validation:** `react-hook-form` + `zod` (also used to validate
  Polymarket API responses and Claude tool-call output at the boundary).
  Reuse the same `zod` schemas for API request validation on the way in.
- **Icons:** `lucide-react`.
- **Testing:** Vitest + React Testing Library (unit/component), Playwright
  (smoke/E2E for auth + dashboard flows).
- **Linting/formatting:** ESLint (`next/core-web-vitals` + `typescript-eslint`),
  Prettier, `prettier-plugin-tailwindcss`.
- **Date/number formatting:** `date-fns`, `Intl.NumberFormat` wrappers for
  currency/probability formatting (no heavy moment.js).
- **Supabase tooling:** Supabase CLI for local dev + migrations, `supabase
  gen types typescript` for generated DB types consumed across the app.

## Why not X

- **Prisma instead of Supabase-generated types:** Supabase already owns the
  schema and RLS; adding Prisma would mean two sources of truth for the DB
  and fighting RLS/connection pooling. Raw SQL migrations + generated types
  is simpler and idiomatic for Supabase.
- **A dedicated backend (Express/Nest) service:** Unnecessary — Next.js
  route handlers on Vercel cover ingestion (via Cron) and the AI endpoint
  without standing up/operating a second deployable.
- **Redux/Zustand for global state:** Server components + TanStack Query
  cover Phase 1's needs; no client global store required yet.
