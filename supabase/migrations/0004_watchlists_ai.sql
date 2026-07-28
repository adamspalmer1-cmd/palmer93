create table if not exists public.watchlist_items (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  market_id text not null references public.markets (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, market_id)
);

alter table public.watchlist_items enable row level security;

create policy "Watchlist items are managed by owner"
  on public.watchlist_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.ai_analyses (
  id bigint generated always as identity primary key,
  market_id text not null references public.markets (id) on delete cascade,
  input_hash text not null,
  summary text not null,
  signal text not null check (signal in ('undervalued', 'overvalued', 'neutral')),
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  reasoning text not null,
  raw_response jsonb,
  model text not null,
  created_at timestamptz not null default now(),
  unique (market_id, input_hash)
);

create index if not exists ai_analyses_market_idx on public.ai_analyses (market_id, created_at desc);

alter table public.ai_analyses enable row level security;

create policy "AI analyses are publicly readable"
  on public.ai_analyses for select using (true);
