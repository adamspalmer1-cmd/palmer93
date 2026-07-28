-- Categories: curated top-level nav categories
create table if not exists public.categories (
  id text primary key,
  label text not null,
  icon text,
  sort_order int not null default 0
);

-- Events: Polymarket "event" groups related markets
create table if not exists public.events (
  id text primary key,
  slug text unique not null,
  title text not null,
  description text,
  image_url text,
  category_id text references public.categories (id) on delete set null,
  tags text[] not null default '{}',
  start_date timestamptz,
  end_date timestamptz,
  active boolean not null default true,
  closed boolean not null default false,
  volume_24hr numeric not null default 0,
  liquidity numeric not null default 0,
  raw jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists events_category_idx on public.events (category_id);
create index if not exists events_active_closed_idx on public.events (active, closed);

-- Markets: a single binary/categorical question within an event
create table if not exists public.markets (
  id text primary key,
  event_id text references public.events (id) on delete cascade,
  slug text unique not null,
  question text not null,
  outcomes jsonb not null default '[]',
  clob_token_ids text[] not null default '{}',
  category_id text references public.categories (id) on delete set null,
  volume numeric not null default 0,
  volume_24hr numeric not null default 0,
  liquidity numeric not null default 0,
  best_bid numeric,
  best_ask numeric,
  last_price numeric,
  price_change_24h numeric,
  active boolean not null default true,
  closed boolean not null default false,
  resolved_outcome text,
  end_date timestamptz,
  raw jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists markets_event_idx on public.markets (event_id);
create index if not exists markets_category_idx on public.markets (category_id);
create index if not exists markets_active_closed_idx on public.markets (active, closed);
create index if not exists markets_volume_24hr_idx on public.markets (volume_24hr desc);
create index if not exists markets_end_date_idx on public.markets (end_date);
create index if not exists markets_question_trgm_idx on public.markets using gin (question gin_trgm_ops);

-- RLS: public read, writes only via service role (bypasses RLS)
alter table public.categories enable row level security;
alter table public.events enable row level security;
alter table public.markets enable row level security;

create policy "Categories are publicly readable"
  on public.categories for select using (true);

create policy "Events are publicly readable"
  on public.events for select using (true);

create policy "Markets are publicly readable"
  on public.markets for select using (true);
