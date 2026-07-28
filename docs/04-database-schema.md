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
| resolved_outcome | text | nullable |
| end_date | timestamptz | |
| raw | jsonb | |
| last_synced_at | timestamptz | |
| created_at | timestamptz default now() | |

Indexes: `(active, closed)`, `(category_id)`, GIN on `to_tsvector(question)`
for full-text search, btree on `(volume_24hr desc)` and `(end_date)`.

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

Index: `(market_id, token_id, captured_at)`. Partition-by-time candidate in
a later phase if volume warrants it; a plain indexed table is sufficient for
Phase 1's polling cadence.

## `ingestion_runs`
Observability for the sync job.

| column | type | notes |
|---|---|---|
| id | bigint identity PK | |
| started_at | timestamptz | |
| finished_at | timestamptz | |
| status | text | `success` \| `partial` \| `failed` |
| events_upserted | int | |
| markets_upserted | int | |
| snapshots_inserted | int | |
| error | text | nullable |

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
                                  │
                                  ├──* ai_analyses
                                  └──* watchlist_items *──1 profiles ──1 auth.users
```
