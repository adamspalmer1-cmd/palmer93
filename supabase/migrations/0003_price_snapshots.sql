create table if not exists public.price_snapshots (
  id bigint generated always as identity primary key,
  market_id text not null references public.markets (id) on delete cascade,
  token_id text not null,
  price numeric(6, 4) not null,
  volume_24hr numeric,
  captured_at timestamptz not null default now()
);

create index if not exists price_snapshots_market_token_time_idx
  on public.price_snapshots (market_id, token_id, captured_at desc);

alter table public.price_snapshots enable row level security;

create policy "Price snapshots are publicly readable"
  on public.price_snapshots for select using (true);

-- Ingestion run observability
create table if not exists public.ingestion_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  events_upserted int not null default 0,
  markets_upserted int not null default 0,
  snapshots_inserted int not null default 0,
  error text
);

alter table public.ingestion_runs enable row level security;

create policy "Ingestion runs are publicly readable"
  on public.ingestion_runs for select using (true);
