# 9. Development Roadmap

## Phase 1 — Foundation (this build)

Auth, landing page, dashboard shell, navigation, DB models, market
ingestion service, active market list, search, filters, category pages,
market detail page with historical price chart, responsive layout, Claude
API plumbing (single-market analysis). No trading, no portfolio.

## Phase 2 — Research depth (requires approval to start)

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
- Admin/observability dashboard for ingestion health, API cost tracking.

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
