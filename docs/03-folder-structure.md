# 3. Folder Structure

```
marketsignal/
├── docs/                          # This planning documentation
├── public/                        # Static assets (logo, favicon, og-image)
├── src/
│   ├── app/
│   │   ├── (marketing)/
│   │   │   └── page.tsx           # Landing page ("/")
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   ├── sign-up/page.tsx
│   │   │   └── layout.tsx         # Centered auth-card layout
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx         # Dashboard shell (sidebar + topbar)
│   │   │   ├── dashboard/page.tsx # Overview / active markets
│   │   │   ├── markets/
│   │   │   │   ├── page.tsx       # Market list + search + filters
│   │   │   │   └── [slug]/page.tsx# Market detail page
│   │   │   ├── categories/
│   │   │   │   └── [tag]/page.tsx # Category page
│   │   │   └── watchlist/page.tsx # (stub for Phase 2)
│   │   ├── api/
│   │   │   ├── ingest/
│   │   │   │   └── markets/route.ts   # Cron-triggered ingestion endpoint
│   │   │   ├── markets/
│   │   │   │   ├── route.ts           # GET list (search/filter passthrough)
│   │   │   │   └── [id]/
│   │   │   │       ├── price-history/route.ts
│   │   │   │       └── analyze/route.ts   # Claude AI analysis
│   │   │   └── auth/callback/route.ts # Supabase auth code exchange
│   │   ├── layout.tsx              # Root layout (fonts, providers)
│   │   ├── globals.css
│   │   └── not-found.tsx
│   ├── components/
│   │   ├── ui/                     # Design-system primitives (button, card, badge, input...)
│   │   ├── layout/                 # Navbar, Sidebar, Footer, DashboardShell
│   │   ├── markets/                # MarketCard, MarketTable, PriceChart, FilterBar, SearchBox
│   │   └── auth/                   # AuthForm, UserMenu
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts           # browser client
│   │   │   ├── server.ts           # RSC/route-handler client (cookies)
│   │   │   ├── middleware.ts       # session refresh helper
│   │   │   └── admin.ts            # service-role client (server-only, ingestion)
│   │   ├── polymarket/
│   │   │   ├── gamma.ts            # Gamma API client (events/markets/tags)
│   │   │   ├── clob.ts             # CLOB client (prices-history, midpoint)
│   │   │   ├── types.ts            # zod schemas + inferred types for API payloads
│   │   │   └── normalize.ts        # Polymarket payload -> DB row mapping
│   │   ├── ai/
│   │   │   └── claude.ts           # Anthropic client + prompt templates
│   │   ├── validation/              # shared zod schemas (filters, search params)
│   │   └── utils.ts                 # formatting, cn(), misc helpers
│   ├── types/
│   │   └── database.types.ts        # generated Supabase types
│   ├── hooks/                       # useMarkets, useMarketSearch, usePriceHistory
│   ├── config/
│   │   ├── site.ts                  # nav items, site metadata
│   │   └── categories.ts            # category/tag display config
│   └── middleware.ts                 # Next.js middleware: Supabase session refresh, route protection
├── supabase/
│   ├── config.toml
│   └── migrations/
│       ├── 0001_init.sql
│       ├── 0002_markets_events.sql
│       ├── 0003_price_snapshots.sql
│       ├── 0004_watchlists_ai.sql
│       └── 0005_rls_policies.sql
├── tests/
│   ├── unit/
│   ├── components/
│   └── e2e/
├── .env.example
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── vitest.config.ts
├── playwright.config.ts
└── package.json
```

Rationale: route groups `(marketing)`, `(auth)`, `(dashboard)` separate
layouts without affecting URL paths. `lib/polymarket` and `lib/ai` isolate
all third-party integration behind small, typed clients so route handlers
and the ingestion job stay thin. `components/ui` is the local design-system
layer (Radix-based) that gives the Terminal/Linear look consistently across
every screen.
