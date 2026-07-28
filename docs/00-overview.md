# MarketSignal — Architecture & Planning Docs

MarketSignal is an AI-powered research platform for Polymarket prediction
markets. It surfaces potentially mispriced markets through data analysis,
news analysis, and AI reasoning. **It is explicitly not a trading bot** — no
order placement, no wallet custody, no portfolio/position management.

This directory contains the architecture and planning documents produced
before writing any Phase 1 code, as requested:

1. [Architecture](./01-architecture.md)
2. [Technology Stack](./02-tech-stack.md)
3. [Folder Structure](./03-folder-structure.md)
4. [Database Schema](./04-database-schema.md)
5. [API Integration Plan](./05-api-integration.md)
6. [Authentication Strategy](./06-authentication.md)
7. [Security Considerations](./07-security.md)
8. [UI Wireframes](./08-wireframes.md)
9. [Development Roadmap](./09-roadmap.md)

## Polymarket API research summary (current, as of July 2026)

Polymarket's public surface is split across independent services, all
reachable without authentication for read-only market data:

| Service | Base URL | Auth | Purpose |
|---|---|---|---|
| Gamma API | `https://gamma-api.polymarket.com` | none | Market/event discovery, metadata, tags, series, sports |
| CLOB REST API | `https://clob.polymarket.com` | none for reads; L1/L2 for trading | Order book, midpoint/spread, **`/prices-history`** timeseries |
| Data API | `https://data-api.polymarket.com` | none | Trades, positions, holders, on-chain activity |
| CLOB WebSocket (market) | `wss://ws-subscriptions-clob.polymarket.com/ws/market` | none | Live order book / trade / price-change feed |
| CLOB WebSocket (user) | `wss://ws-subscriptions-clob.polymarket.com/ws/user` | L2 (API key) | Account-specific fills (not used in Phase 1 — no trading) |
| Subgraph | (The Graph, Polygon) | none | Deep historical on-chain queries (future phase) |

Trading endpoints require two-tier auth (L1 EIP-712 wallet signature to
derive API credentials, L2 HMAC-SHA256 request signing). **MarketSignal never
calls these** since Phase 1 (and the product overall) has no trading
functionality — only the public, unauthenticated read endpoints are used.

Key endpoint used for charts: `GET https://clob.polymarket.com/prices-history`
with `market` (CLOB token/asset id), `interval` (`1h`/`6h`/`1d`/`1w`/`1m`/`max`/`all`),
`fidelity` (bucket size in minutes), and optional `startTs`/`endTs`. Note:
resolved/closed markets only retain ~12h+ granularity server-side, so
MarketSignal persists its own price snapshots (see ingestion service) to
build finer-grained history over time for markets it tracks.

Sources consulted: Polymarket's `agent-skills` reference repository
(`github.com/Polymarket/agent-skills` — `SKILL.md`, `authentication.md`,
`market-data.md`, `websocket.md`), `docs.polymarket.com` API reference pages,
and independent 2026 developer guides (Chainstack, apidog, rekko.ai).
