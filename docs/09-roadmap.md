# 9. Development Roadmap

## Phase 1 — Foundation (this build)

Auth, landing page, dashboard shell, navigation, DB models, market
ingestion service, active market list, search, filters, category pages,
market detail page with historical price chart, responsive layout, Claude
API plumbing (single-market analysis). No trading, no portfolio.

## Phase 1.5 — Data Integrity & Intelligence (complete)

Hardened the market data pipeline before any AI-driven opportunity
detection is built on top of it: order-book refresh (best bid/ask/mid/
spread), market archival lifecycle, resolution timestamping, retry/backoff/
rate-limit/timeout handling for every outbound Polymarket call, per-item
partial failure recovery (one bad market/event never aborts a sync run),
duplicate-write-avoiding historical snapshots with range-based retrieval,
a `/admin/health` dashboard (cron status, database health, error history,
data-quality warnings, market metrics), an eight-check data validation
service, and a reusable, independently-testable service layer
(`lib/services/*`) underneath both the API routes and the dashboard. See
`10-data-pipeline.md` for the full job-by-job reference. No AI analysis
logic was touched in this phase.

## Next — AI Opportunity Engine (requires approval to start)

The phase referred to elsewhere in this roadmap as "Phase 2" — expanding
past the single-market Claude signal (Phase 1) into genuine opportunity
detection, now that Phase 1.5 has made the underlying data trustworthy
enough to reason over:

- Watchlists (UI on top of the `watchlist_items` table already modeled).
- News ingestion (headline/article aggregation per market topic) feeding
  richer AI context.
- Expanded AI reasoning: multi-factor "signal" scoring, confidence
  calibration, historical accuracy tracking of past signals.
- Data API integration: holder concentration, whale activity, smart-money
  flags.
- Saved searches / alerts (price move, new AI signal) via email or push.
- Public API rate limiting per user; Anthropic usage budgets.

## Phase 3 — Platform maturity

- OAuth login providers, account settings, notification preferences.
- Market comparison views, correlation analysis across related markets.
- Backtesting: "if you'd followed this signal type historically..."
- Realtime updates via Supabase Realtime or the CLOB WebSocket feed for
  live price ticks on the detail page (replacing polling).
- ~~Admin/observability dashboard for ingestion health~~ — delivered early
  in Phase 1.5 (`/admin/health`); remaining here: API cost tracking
  (Anthropic spend) and a real admin/role system (the dashboard is
  currently gated only by "signed in", see `07-security.md`).

## Phase 4 — Scale & polish

- Subgraph integration for deep historical/on-chain queries beyond what
  Gamma/CLOB retain.
- Performance: edge caching for market list/detail, ISR tuning, DB
  partitioning for `price_snapshots` if volume warrants it.
- Full accessibility and internationalization pass.
- Public API for MarketSignal's own derived data (rate-limited, keyed).

**No phase in this roadmap includes order placement, wallet custody, or
automated trading — that is out of scope for the product, not merely
deferred.**
