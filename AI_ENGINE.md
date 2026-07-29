# AI Opportunity Engine

Phase 2 of MarketSignal. Analyzes active Polymarket markets with Claude,
estimates a fair-probability range, scores research quality and
opportunity, and stores the result as an immutable historical record. It
is the analysis/scoring layer the future "Daily Top 10" report (Phase 3,
not yet approved) will read from — this phase does not build that report,
and it does not place trades, generate orders, or touch any wallet.

See also: [`OPPORTUNITY_SCORING.md`](./OPPORTUNITY_SCORING.md),
[`ANALYSIS_SCHEMA.md`](./ANALYSIS_SCHEMA.md),
[`EVIDENCE_PIPELINE.md`](./EVIDENCE_PIPELINE.md),
[`PROMPT_SECURITY.md`](./PROMPT_SECURITY.md),
[`COST_CONTROLS.md`](./COST_CONTROLS.md),
[`MODEL_VERSIONING.md`](./MODEL_VERSIONING.md), [`TESTING.md`](./TESTING.md).

## Pipeline, end to end

```
selectEligibleMarkets            lib/services/analysis-eligibility.service.ts
        │  (active, unresolved, passes cost-control liquidity/spread thresholds)
        ▼
checkReanalysisEligibility       lib/services/reanalysis.service.ts
        │  (never analyzed, or cooldown elapsed, or price moved enough to override it)
        ▼
buildAnalysisModelInput          lib/services/analysis-context.service.ts
        │  (market + pricing + price history + related markets + prior analyses
        │   + explicit data-freshness warnings — never a bare title)
        ▼
runAnalysisModelCall             lib/ai/analysis-model.ts
        │  (system+user prompt, web_search/web_fetch tools, pause_turn resume,
        │   refusal detection, bounded retry on invalid structured output)
        ▼
runEvidencePipeline              lib/ai/evidence-pipeline.ts
        │  (independent duplicate corroboration, injection-pattern scanning)
        ▼
computeOpportunityScore          lib/ai/opportunity-scoring.ts
        │  (deterministic scores + edges, from market data + Claude's qualitative fields)
        ▼
persistAnalysis                  lib/services/analysis-persistence.service.ts
        │  (insert-only; analyses + 5 child tables; DB trigger forbids UPDATE/DELETE)
        ▼
   analyses row (immutable)
```

`lib/ai/analyze-market.ts::runSingleMarketAnalysis` runs this whole
sequence for one market, and is the single call site both the on-demand
route and the batch engine use — neither reimplements the pipeline.

`lib/ai/batch-engine.ts::runBatchAnalysis` runs it across many markets
with bounded concurrency, a daily budget check before every new market,
and a run summary (`analysis_runs`) an admin can inspect or resume from.

## Where things live

| Concern | File |
|---|---|
| Structured output schema + validation rules | `lib/ai/analysis-schema.ts` |
| Opportunity Score formula | `lib/ai/opportunity-scoring.ts` |
| Duplicate/credibility/injection handling for evidence | `lib/ai/evidence-pipeline.ts` |
| Budget/eligibility thresholds | `lib/ai/cost-controls.ts` |
| The Claude call itself | `lib/ai/analysis-model.ts` |
| Single-market orchestration | `lib/ai/analyze-market.ts` |
| Batch orchestration | `lib/ai/batch-engine.ts` |
| Market eligibility scan | `lib/services/analysis-eligibility.service.ts` |
| Reanalysis-cooldown logic | `lib/services/reanalysis.service.ts` |
| Per-market context assembly | `lib/services/analysis-context.service.ts` |
| Writing an analysis + child rows | `lib/services/analysis-persistence.service.ts` |
| Reading one analysis + child rows back | `lib/services/analysis-detail.service.ts` |
| Batch run bookkeeping (create/finish/spend/resume) | `lib/services/analysis-runs.service.ts` |
| Scanner list/filter/sort | `lib/services/opportunity-scanner.service.ts` |
| Admin cost/latency/failure metrics | `lib/services/ai-engine-metrics.service.ts` |
| Schema | `supabase/migrations/0007_ai_opportunity_engine.sql` |
| On-demand + batch trigger routes | `app/api/markets/[id]/analysis`, `app/api/cron/analyze-markets` |
| Scanner UI | `app/(dashboard)/scanner` |
| Market-detail analysis panel + fair-value chart overlay | `components/markets/analysis-panel.tsx`, `components/markets/price-chart.tsx` |
| Admin ops dashboard | `app/(dashboard)/admin/ai-engine` |

## Explicit non-goals (this phase)

- No "Daily Top 10" report or digest — the scanner surfaces the same
  ranked data ad hoc, but nothing is compiled, scheduled, or sent.
- No real-money trading, no order placement, no wallet integration.
- No portfolio or position tracking.

## Triggering an analysis

- **On demand** (signed-in user, from the market detail page or directly):
  `POST /api/markets/[id]/analysis` (optionally `?force=true` to bypass the
  cost/cooldown checks).
- **Batch** (cron, `CRON_SECRET`-gated, same auth model as the Phase 1.5
  ingestion jobs): `POST /api/cron/analyze-markets`, optional `category` and
  `resumeFromRunId` query params. Registered hourly in `vercel.json`.

## Immutability

Every `analyses` row — and its evidence/score/catalyst/assumption/unknown
child rows — is insert-only. A Postgres trigger
(`reject_analysis_mutation`, migration 0007) raises on any UPDATE or
DELETE against these tables, including from the service-role client the
app itself uses. Correcting a bad analysis means analyzing again, not
editing history; `run_id`, `resumed_from_run_id`, and the model/prompt/
scoring version columns keep the provenance of every record intact.
