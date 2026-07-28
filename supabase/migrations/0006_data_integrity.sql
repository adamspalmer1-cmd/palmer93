-- Phase 1.5: data integrity columns, failure tracking, and job observability.

-- Markets: archival lifecycle, computed order-book fields, resolution timestamp.
alter table public.markets
  add column if not exists archived boolean not null default false,
  add column if not exists mid_price numeric,
  add column if not exists spread numeric,
  add column if not exists resolved_at timestamptz;

comment on column public.markets.archived is
  'True once a closed/resolved market has been retired from active sync (see archive-markets job).';
comment on column public.markets.mid_price is
  '(best_bid + best_ask) / 2, refreshed by the refresh-order-books job.';
comment on column public.markets.spread is
  'best_ask - best_bid, refreshed by the refresh-order-books job.';
comment on column public.markets.resolved_at is
  'Set when resolved_outcome is first observed; distinct from closed (trading halted) and archived (retired from sync).';

-- Ingestion runs: which job produced this run, and how long it took.
alter table public.ingestion_runs
  add column if not exists job_name text not null default 'sync-markets',
  add column if not exists duration_ms integer,
  add column if not exists markets_archived int not null default 0,
  add column if not exists order_books_refreshed int not null default 0,
  add column if not exists markets_failed int not null default 0;

create index if not exists ingestion_runs_job_name_started_idx
  on public.ingestion_runs (job_name, started_at desc);

-- Per-item failures within a run, so one bad market never aborts the batch
-- and operators can see exactly what failed and why.
create table if not exists public.sync_failures (
  id bigint generated always as identity primary key,
  run_id bigint references public.ingestion_runs (id) on delete cascade,
  job_name text not null,
  market_id text references public.markets (id) on delete set null,
  event_id text references public.events (id) on delete set null,
  stage text not null,
  error text not null,
  occurred_at timestamptz not null default now()
);

create index if not exists sync_failures_occurred_idx on public.sync_failures (occurred_at desc);
create index if not exists sync_failures_run_idx on public.sync_failures (run_id);

alter table public.sync_failures enable row level security;

create policy "Sync failures are readable by signed-in users"
  on public.sync_failures for select using (auth.uid() is not null);

-- RLS review: operational sync data (run metadata, per-item failures) is not
-- research data like markets/events/prices — restrict reads to signed-in
-- users. This is a stricter follow-up on ingestion_runs, which Phase 1
-- initially left publicly readable.
drop policy if exists "Ingestion runs are publicly readable" on public.ingestion_runs;
create policy "Ingestion runs are readable by signed-in users"
  on public.ingestion_runs for select using (auth.uid() is not null);

-- Query performance: staleness checks and archival filters run on every
-- health-dashboard load and every sync job.
create index if not exists markets_archived_idx on public.markets (archived);
create index if not exists markets_last_synced_idx on public.markets (last_synced_at);
create index if not exists markets_resolved_at_idx on public.markets (resolved_at);

-- Active, non-archived markets are the hot path for every list/category
-- query; a partial index keeps it small as the archived backlog grows.
create index if not exists markets_active_not_archived_idx
  on public.markets (volume_24hr desc)
  where active = true and closed = false and archived = false;

create index if not exists price_snapshots_captured_at_idx
  on public.price_snapshots (captured_at desc);
