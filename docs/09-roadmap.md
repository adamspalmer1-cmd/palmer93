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

## Phase 2 — AI Opportunity Engine (complete)

Expanded past the single-market Claude signal (Phase 1) into genuine
opportunity detection, now that Phase 1.5 made the underlying data
trustworthy enough to reason over: a structured, versioned, immutable
per-market analysis (fair-probability range, evidence with independent
duplicate/credibility handling, resolution-risk assessment, mandatory
self-critique); a deterministic, documented Opportunity Score formula
that a large edge can't buy past poor liquidity/spread/resolution-risk/
evidence quality; prompt-injection defenses layered through the system
prompt, the evidence pipeline, and output validation; cost controls with
a daily budget that safely stops the batch engine rather than overrunning
it; a sortable/filterable Opportunity Scanner; market-detail integration
with a fair-value chart overlay; and an admin ops dashboard for cost/
latency/reliability. See [`AI_ENGINE.md`](../AI_ENGINE.md) (and its linked
docs) for the full design. Still no order placement, no automatic trades,
no portfolio tracking — and no "Daily Top 10" report yet, that's Phase 3.

## Phase 3 — Daily Top 10 (requires approval to start)

A scheduled digest built entirely on top of the AI Opportunity Engine's
existing analyses — no new AI reasoning, just selection/ranking/
presentation of what's already there:

- Scheduled compilation of the current top-N opportunities from
  `analyses`/`latest_analyses`, by opportunity score with the same
  liquidity/spread/risk gating already in place.
- Delivery (email/push/in-app) on a fixed cadence.
- Historical archive of past digests, so "yesterday's top 10" stays
  inspectable even as new analyses supersede it.
- Watchlists (UI on top of the `watchlist_items` table already modeled) —
  a natural companion once a digest exists to feed alerts from.
- Saved searches / alerts (price move, new AI signal, digest inclusion)
  via email or push.

## Phase 4 — Platform maturity

- OAuth login providers, account settings, notification preferences.
- News ingestion (headline/article aggregation per market topic) as a
  dedicated data source feeding richer AI context, beyond the engine's
  own `web_search`/`web_fetch` tool calls.
- Data API integration: holder concentration, whale activity, smart-money
  flags.
- Market comparison views, correlation analysis across related markets.
- Backtesting: "if you'd followed this signal type historically..." —
  now genuinely possible since every analysis is an immutable historical
  record with a source-data timestamp.
- Realtime updates via Supabase Realtime or the CLOB WebSocket feed for
  live price ticks on the detail page (replacing polling).
- Public API rate limiting per user; a real admin/role system (both the
  data-pipeline and AI-engine admin dashboards are currently gated only
  by "signed in", see `07-security.md`).

## Phase 5 — Scale & polish

- Subgraph integration for deep historical/on-chain queries beyond what
  Gamma/CLOB retain.
- Performance: edge caching for market list/detail, ISR tuning, DB
  partitioning for `price_snapshots` if volume warrants it.
- Full accessibility and internationalization pass.
- Public API for MarketSignal's own derived data (rate-limited, keyed).

**No phase in this roadmap includes order placement, wallet custody, or
automated trading — that is out of scope for the product, not merely
deferred.**
