# 4. Database Schema (Supabase / Postgres)

All tables use `uuid` primary keys unless a natural Polymarket id makes a
better key (kept as `text` since Polymarket ids are strings, not uuids).
Timestamps are `timestamptz`. RLS is enabled on every table; policies are
detailed in `07-security.md`.

## `categories`
Local, curated list of top-level categories shown in navigation (derived
from Polymarket tags but curated/ordered by us).

| column | type | notes |
|---|---|---|
| id | text PK | slug, e.g. `politics` |
| label | text | display name |
| icon | text | lucide icon name |
| sort_order | int | nav ordering |

## `events`
Polymarket "event" = a group of related markets (e.g. "2028 US Election").

| column | type | notes |
|---|---|---|
| id | text PK | Polymarket event id |
| slug | text unique | |
| title | text | |
| description | text | |
| image_url | text | |
| category_id | text FK -> categories.id | nullable |
| tags | text[] | raw Polymarket tag slugs |
| start_date | timestamptz | |
| end_date | timestamptz | |
| active | boolean | |
| closed | boolean | |
| volume_24hr | numeric | denormalized for sort/filter |
| liquidity | numeric | denormalized for sort/filter |
| raw | jsonb | full upstream payload for forward-compat |
| last_synced_at | timestamptz | |
| created_at | timestamptz default now() | |

## `markets`
Polymarket "market" = a single binary/categorical question within an event.

| column | type | notes |
|---|---|---|
| id | text PK | Polymarket condition/market id |
| event_id | text FK -> events.id | |
| slug | text unique | |
| question | text | |
| outcomes | jsonb | `[{name, tokenId, price}]` |
| clob_token_ids | text[] | asset ids used for CLOB price-history lookups |
| category_id | text FK -> categories.id | denormalized from event for query speed |
| volume | numeric | |
| volume_24hr | numeric | |
| liquidity | numeric | |
| best_bid | numeric | |
| best_ask | numeric | |
| last_price | numeric | current implied probability, 0–1 |
| price_change_24h | numeric | |
| active | boolean | |
| closed | boolean | |
| archived | boolean default false | set by the `archive-markets` job once a closed market ages past its grace period; archived markets are excluded from active sync/order-book refresh (Phase 1.5) |
| resolved_outcome | text | nullable |
| resolved_at | timestamptz | nullable; stamped once by the `sync-markets` job the first time `resolved_outcome` is observed — distinct from `closed` (trading halted) and `archived` (retired from sync) (Phase 1.5) |
| mid_price | numeric | `(best_bid + best_ask) / 2`, refreshed by `refresh-order-books` (Phase 1.5) |
| spread | numeric | `best_ask - best_bid`, refreshed by `refresh-order-books` (Phase 1.5) |
| end_date | timestamptz | |
| raw | jsonb | |
| last_synced_at | timestamptz | |
| created_at | timestamptz default now() | |

Indexes: `(active, closed)`, `(category_id)`, GIN on `to_tsvector(question)`
for full-text search (via `pg_trgm`), btree on `(volume_24hr desc)` and
`(end_date)`. Phase 1.5 adds: `(archived)`, `(last_synced_at)`,
`(resolved_at)`, and a partial index on `(volume_24hr desc) where active and
not closed and not archived` covering the hot path (list/category pages,
the order-book refresh batch) as the archived backlog grows.

## `price_snapshots`
Our own persisted history, since Polymarket's CLOB API only guarantees fine
granularity for a limited window on live markets.

| column | type | notes |
|---|---|---|
| id | bigint identity PK | |
| market_id | text FK -> markets.id | |
| token_id | text | which outcome token |
| price | numeric(6,4) | 0–1 |
| volume_24hr | numeric | snapshot-time volume, optional |
| captured_at | timestamptz | |

Index: `(market_id, token_id, captured_at desc)`, plus `(captured_at desc)`
(Phase 1.5) for the health dashboard's cross-market volatility scan.
Partition-by-time candidate in a later phase if volume warrants it; a plain
indexed table is sufficient for the current polling cadence.

Storage efficiency: rows are only written when a price actually moves (or
after a one-hour continuity gap) — see `insertSnapshotIfChanged` in
`05-api-integration.md` § Historical data — so duplicate snapshots for an
unchanged price are never written.

## `ingestion_runs`
Observability for every background job (Phase 1.5 generalizes this from a
single "ingestion" job to any named job).

| column | type | notes |
|---|---|---|
| id | bigint identity PK | |
| job_name | text default `'sync-markets'` | `sync-markets` \| `refresh-order-books` \| `archive-markets` (Phase 1.5) |
| started_at | timestamptz | |
| finished_at | timestamptz | |
| duration_ms | int | nullable; `finished_at - started_at` in ms (Phase 1.5) |
| status | text | `running` \| `success` \| `partial` \| `failed` |
| events_upserted | int | |
| markets_upserted | int | |
| snapshots_inserted | int | |
| markets_archived | int default 0 | (Phase 1.5) |
| order_books_refreshed | int default 0 | (Phase 1.5) |
| markets_failed | int default 0 | count of per-item failures this run recorded to `sync_failures` (Phase 1.5) |
| error | text | nullable; job-level failure (e.g. the Gamma API was unreachable) |

Index (Phase 1.5): `(job_name, started_at desc)` — the health dashboard's
per-job "last run" and "cron status" queries hit this directly.

## `sync_failures` (Phase 1.5)
Per-item failures within a run, so one bad market or event never aborts the
batch (see `05-api-integration.md` § Partial failure recovery) and operators
can see exactly what failed and why.

| column | type | notes |
|---|---|---|
| id | bigint identity PK | |
| run_id | bigint FK -> ingestion_runs.id, on delete cascade | nullable |
| job_name | text | which job recorded this failure |
| market_id | text FK -> markets.id, on delete set null | nullable |
| event_id | text FK -> events.id, on delete set null | nullable |
| stage | text | e.g. `upsert_event`, `order_book` |
| error | text | |
| occurred_at | timestamptz default now() | |

Indexes: `(occurred_at desc)`, `(run_id)`.

## `profiles`
Extends `auth.users` (Supabase Auth) with app-specific fields.

| column | type | notes |
|---|---|---|
| id | uuid PK, FK -> auth.users.id | |
| display_name | text | |
| created_at | timestamptz default now() | |

Created automatically via a `handle_new_user` trigger on `auth.users` insert.

## `watchlist_items` (foundation only, UI deferred)

| column | type | notes |
|---|---|---|
| id | bigint identity PK | |
| user_id | uuid FK -> profiles.id | |
| market_id | text FK -> markets.id | |
| created_at | timestamptz default now() | |

Unique `(user_id, market_id)`.

## `ai_analyses`
Cached Claude output per market, keyed by a content hash so we don't
re-call the API for unchanged inputs.

| column | type | notes |
|---|---|---|
| id | bigint identity PK | |
| market_id | text FK -> markets.id | |
| input_hash | text | hash of (question + recent prices + prompt version) |
| summary | text | |
| signal | text | e.g. `undervalued` \| `overvalued` \| `neutral` |
| confidence | numeric | 0–1, model-reported |
| reasoning | text | |
| raw_response | jsonb | |
| model | text | e.g. `claude-sonnet-5` |
| created_at | timestamptz default now() | |

Unique `(market_id, input_hash)` so repeated requests are cache hits.

## Entity relationship summary

```
categories 1──* events 1──* markets 1──* price_snapshots
                    │             │
                    │             ├──* ai_analyses
                    │             ├──* watchlist_items *──1 profiles ──1 auth.users
                    │             └──* sync_failures (market_id, nullable)
                    └──* sync_failures (event_id, nullable)

ingestion_runs 1──* sync_failures (run_id, on delete cascade)
```

## Scaling note on Phase 1.5 metrics

`lib/services/market-stats.service.ts` and
`lib/services/data-quality.service.ts` compute aggregates (averages,
standard deviation, duplicate detection) in application code over a bounded
row scan (a few hundred to ~2,000 rows), rather than via SQL `GROUP BY`/
`STDDEV`/views — Supabase-JS's PostgREST client doesn't expose arbitrary
aggregate expressions without an RPC function. This is intentionally simple
for Phase 1.5's data volume (hundreds to a couple thousand active markets).
If/when the active-market count grows well beyond that, the follow-up is to
move these into Postgres views or `SECURITY DEFINER` RPC functions instead
of widening the JS scan limits.
