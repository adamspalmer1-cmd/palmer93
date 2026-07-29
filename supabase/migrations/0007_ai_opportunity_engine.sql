-- Phase 2: AI Opportunity Engine.
--
-- Adds the market description column Gamma provides but Phase 1 didn't
-- persist (resolution criteria are conventionally embedded in Polymarket's
-- market description text), plus the full analysis schema. Every analysis
-- is an immutable, insert-only historical record — there is no UPDATE path
-- for `analyses` or its child tables anywhere in this migration or the
-- application code that reads it.

alter table public.markets
  add column if not exists description text;

-- ---------------------------------------------------------------------
-- Registries: which model/prompt version produced a given analysis.
-- ---------------------------------------------------------------------

create table if not exists public.model_versions (
  id text primary key,                 -- e.g. 'claude-opus-5'
  display_name text,
  first_used_at timestamptz not null default now(),
  notes text
);

create table if not exists public.prompt_versions (
  id text primary key,                 -- e.g. 'opportunity-analysis-v1'
  description text,
  template text not null,              -- the actual versioned system+task prompt template, for audit/reproducibility
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Batch run + failure tracking (mirrors ingestion_runs/sync_failures from
-- Phase 1.5, scoped to the AI analysis pipeline instead of market sync).
-- ---------------------------------------------------------------------

create table if not exists public.analysis_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'success', 'partial', 'failed', 'budget_stopped')),
  filters jsonb not null default '{}',
  markets_selected int not null default 0,
  markets_analyzed int not null default 0,
  markets_insufficient_data int not null default 0,
  markets_skipped int not null default 0,
  markets_failed int not null default 0,
  skip_summary jsonb not null default '{}',
  total_input_tokens bigint not null default 0,
  total_output_tokens bigint not null default 0,
  estimated_cost_usd numeric(10, 4) not null default 0,
  duration_ms int,
  budget_stopped boolean not null default false,
  resumed_from_run_id bigint references public.analysis_runs (id) on delete set null,
  error text
);

create index if not exists analysis_runs_started_idx on public.analysis_runs (started_at desc);

create table if not exists public.analysis_failures (
  id bigint generated always as identity primary key,
  run_id bigint references public.analysis_runs (id) on delete cascade,
  market_id text references public.markets (id) on delete set null,
  stage text not null,                 -- e.g. 'data_gather', 'claude_call', 'schema_validation', 'business_validation', 'persistence'
  error text not null,
  retryable boolean not null default false,
  occurred_at timestamptz not null default now()
);

create index if not exists analysis_failures_occurred_idx on public.analysis_failures (occurred_at desc);
create index if not exists analysis_failures_run_idx on public.analysis_failures (run_id);
create index if not exists analysis_failures_market_idx on public.analysis_failures (market_id);

-- ---------------------------------------------------------------------
-- The analysis itself. One row per analysis; NEVER updated after insert.
-- ---------------------------------------------------------------------

create table if not exists public.analyses (
  id bigint generated always as identity primary key,
  market_id text not null references public.markets (id) on delete cascade,
  run_id bigint references public.analysis_runs (id) on delete set null,

  analyzed_outcome text not null,
  market_probability numeric(6, 4) not null check (market_probability >= 0 and market_probability <= 1),

  fair_probability_low numeric(6, 4) not null check (fair_probability_low >= 0 and fair_probability_low <= 1),
  fair_probability_base numeric(6, 4) not null check (fair_probability_base >= 0 and fair_probability_base <= 1),
  fair_probability_high numeric(6, 4) not null check (fair_probability_high >= 0 and fair_probability_high <= 1),
  check (fair_probability_low <= fair_probability_base),
  check (fair_probability_base <= fair_probability_high),

  estimated_edge_low numeric(7, 4) not null,
  estimated_edge_base numeric(7, 4) not null,
  estimated_edge_high numeric(7, 4) not null,

  confidence_score numeric(5, 2) not null check (confidence_score >= 0 and confidence_score <= 100),
  evidence_quality_score numeric(5, 2) not null check (evidence_quality_score >= 0 and evidence_quality_score <= 100),
  liquidity_score numeric(5, 2) not null check (liquidity_score >= 0 and liquidity_score <= 100),
  spread_score numeric(5, 2) not null check (spread_score >= 0 and spread_score <= 100),
  resolution_risk_score numeric(5, 2) not null check (resolution_risk_score >= 0 and resolution_risk_score <= 100),
  resolution_risk_level text not null check (resolution_risk_level in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  catalyst_score numeric(5, 2) not null check (catalyst_score >= 0 and catalyst_score <= 100),
  opportunity_score numeric(5, 2) not null check (opportunity_score >= 0 and opportunity_score <= 100),

  market_summary text not null,
  bull_case jsonb not null default '[]',
  bear_case jsonb not null default '[]',
  key_evidence jsonb not null default '[]',
  contrary_evidence jsonb not null default '[]',
  invalidation_conditions jsonb not null default '[]',

  liquidity_assessment text,
  spread_assessment text,
  resolution_assessment text,
  evidence_assessment text,
  self_critique text not null,

  recommendation_status text not null
    check (recommendation_status in ('PASS', 'WATCH', 'RESEARCH', 'POSSIBLE EDGE', 'INSUFFICIENT DATA')),

  prompt_injection_flags jsonb not null default '[]',

  -- Immutable snapshot of the market data this analysis was based on, so
  -- the record stays interpretable even after the live market row changes.
  market_snapshot jsonb not null,

  scoring_version text not null,
  model_version text not null references public.model_versions (id),
  prompt_version text not null references public.prompt_versions (id),

  analyzed_at timestamptz not null default now(),
  source_data_as_of timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists analyses_market_idx on public.analyses (market_id, analyzed_at desc);
create index if not exists analyses_opportunity_score_idx on public.analyses (opportunity_score desc);
create index if not exists analyses_analyzed_at_idx on public.analyses (analyzed_at desc);
create index if not exists analyses_recommendation_idx on public.analyses (recommendation_status);
create index if not exists analyses_run_idx on public.analyses (run_id);

-- A read-optimized view of only the most recent analysis per market.
-- `security_invoker` makes it respect `analyses`' own RLS policies rather
-- than the view owner's — required so anon/authenticated reads are scoped
-- exactly like querying the table directly.
create or replace view public.latest_analyses
  with (security_invoker = true) as
  select distinct on (market_id) *
  from public.analyses
  order by market_id, analyzed_at desc;

-- ---------------------------------------------------------------------
-- Structured citations. Every factual claim materially affecting the
-- forecast must trace back to a row here.
-- ---------------------------------------------------------------------

create table if not exists public.analysis_evidence (
  id bigint generated always as identity primary key,
  analysis_id bigint not null references public.analyses (id) on delete cascade,
  title text not null,
  publisher text,
  url text,
  published_at timestamptz,
  event_date timestamptz,
  retrieved_at timestamptz not null default now(),
  source_type text,                    -- e.g. 'primary' | 'government' | 'company' | 'agency' | 'reporting' | 'secondary'
  credibility_tier int not null check (credibility_tier between 1 and 6), -- 1 = official primary source, 6 = secondary commentary
  excerpt text,
  supports_thesis boolean,
  duplicate_of_id bigint references public.analysis_evidence (id) on delete set null,
  flagged_injection boolean not null default false,
  injection_notes text
);

create index if not exists analysis_evidence_analysis_idx on public.analysis_evidence (analysis_id);
create index if not exists analysis_evidence_duplicate_idx on public.analysis_evidence (duplicate_of_id);

-- ---------------------------------------------------------------------
-- Transparent score breakdown: one row per factor that fed into
-- opportunity_score, so the formula is auditable per-analysis, not just
-- documented in prose. See docs/OPPORTUNITY_SCORING.md.
-- ---------------------------------------------------------------------

create table if not exists public.analysis_scores (
  id bigint generated always as identity primary key,
  analysis_id bigint not null references public.analyses (id) on delete cascade,
  factor text not null,
  raw_value numeric not null,
  weight numeric not null,
  contribution numeric not null,
  scoring_version text not null
);

create index if not exists analysis_scores_analysis_idx on public.analysis_scores (analysis_id);

-- ---------------------------------------------------------------------
-- Catalysts and important dates. `kind` distinguishes the two output
-- arrays (`upcomingCatalysts` vs `importantDates`) from one table.
-- ---------------------------------------------------------------------

create table if not exists public.analysis_catalysts (
  id bigint generated always as identity primary key,
  analysis_id bigint not null references public.analyses (id) on delete cascade,
  kind text not null check (kind in ('catalyst', 'important_date')),
  description text not null,
  event_date timestamptz,
  importance text check (importance in ('low', 'medium', 'high')),
  sort_order int not null default 0
);

create index if not exists analysis_catalysts_analysis_idx on public.analysis_catalysts (analysis_id);
create index if not exists analysis_catalysts_event_date_idx on public.analysis_catalysts (event_date);

create table if not exists public.analysis_assumptions (
  id bigint generated always as identity primary key,
  analysis_id bigint not null references public.analyses (id) on delete cascade,
  assumption text not null,
  sort_order int not null default 0
);

create index if not exists analysis_assumptions_analysis_idx on public.analysis_assumptions (analysis_id);

create table if not exists public.analysis_unknowns (
  id bigint generated always as identity primary key,
  analysis_id bigint not null references public.analyses (id) on delete cascade,
  description text not null,
  sort_order int not null default 0
);

create index if not exists analysis_unknowns_analysis_idx on public.analysis_unknowns (analysis_id);

-- ---------------------------------------------------------------------
-- RLS. Research output (analyses and every child table) is public-read,
-- matching `ai_analyses` from Phase 1. Operational data (runs, failures)
-- is signed-in-only read, matching the Phase 1.5 tightening applied to
-- `ingestion_runs`/`sync_failures`. All writes are service-role only.
-- ---------------------------------------------------------------------

alter table public.model_versions enable row level security;
alter table public.prompt_versions enable row level security;
alter table public.analyses enable row level security;
alter table public.analysis_evidence enable row level security;
alter table public.analysis_scores enable row level security;
alter table public.analysis_catalysts enable row level security;
alter table public.analysis_assumptions enable row level security;
alter table public.analysis_unknowns enable row level security;
alter table public.analysis_runs enable row level security;
alter table public.analysis_failures enable row level security;

create policy "Model versions are publicly readable" on public.model_versions for select using (true);
create policy "Prompt versions are publicly readable" on public.prompt_versions for select using (true);
create policy "Analyses are publicly readable" on public.analyses for select using (true);
create policy "Analysis evidence is publicly readable" on public.analysis_evidence for select using (true);
create policy "Analysis scores are publicly readable" on public.analysis_scores for select using (true);
create policy "Analysis catalysts are publicly readable" on public.analysis_catalysts for select using (true);
create policy "Analysis assumptions are publicly readable" on public.analysis_assumptions for select using (true);
create policy "Analysis unknowns are publicly readable" on public.analysis_unknowns for select using (true);

create policy "Analysis runs are readable by signed-in users"
  on public.analysis_runs for select using (auth.uid() is not null);
create policy "Analysis failures are readable by signed-in users"
  on public.analysis_failures for select using (auth.uid() is not null);

-- ---------------------------------------------------------------------
-- Immutability, enforced at the database level (not just "our code never
-- calls .update()"). This trigger rejects UPDATE and DELETE on `analyses`
-- and every child table outright — even the service-role client, which
-- bypasses RLS, cannot mutate a historical analysis, because triggers
-- fire regardless of RLS. The only way to remove one is a manual,
-- deliberate `SET session_replication_role = replica` (or superuser DDL)
-- operation outside the application's normal write path.
-- ---------------------------------------------------------------------

create or replace function public.reject_analysis_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Analyses are immutable historical records: % on % is not permitted (id=%)',
    tg_op, tg_table_name, coalesce(old.id, null);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'analyses',
    'analysis_evidence',
    'analysis_scores',
    'analysis_catalysts',
    'analysis_assumptions',
    'analysis_unknowns'
  ]
  loop
    execute format(
      'drop trigger if exists reject_mutation on public.%I;
       create trigger reject_mutation
         before update or delete on public.%I
         for each row execute function public.reject_analysis_mutation();',
      t, t
    );
  end loop;
end $$;
