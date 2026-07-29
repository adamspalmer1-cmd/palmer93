# Cost Controls

`lib/ai/cost-controls.ts` is the single place every budget/eligibility
threshold lives, `DEFAULT_COST_CONTROLS` plus environment-variable
overrides via `loadCostControlsConfig()`.

## Configurable limits

| Config field | Env var | Default | Meaning |
|---|---|---|---|
| `maxMarketsPerRun` | `AI_MAX_MARKETS_PER_RUN` | 50 | Hard cap on markets analyzed in one batch run |
| `maxDailySpendUsd` | `AI_MAX_DAILY_SPEND_USD` | $25 | Cap on total estimated spend per UTC day, across every run that day |
| `maxTokensPerAnalysis` | `AI_MAX_TOKENS_PER_ANALYSIS` | 100,000 | A single analysis whose input+output tokens exceed this is treated as runaway |
| `minLiquidityUsd` | `AI_MIN_LIQUIDITY_USD` | $1,000 | Markets below this liquidity are skipped before any Claude call |
| `maxSpreadDecimal` | `AI_MAX_SPREAD_DECIMAL` | 0.20 | Markets at/above this spread (or with no order-book data) are skipped |
| `reanalysisCooldownHours` | `AI_REANALYSIS_COOLDOWN_HOURS` | 12 | A market analyzed within this window isn't re-run... |
| `reanalysisPriceMoveOverride` | `AI_REANALYSIS_PRICE_MOVE_OVERRIDE` | 0.05 | ...unless its price has moved at least this much since the last analysis |
| `modelPricing.{input,output}PerMillionTokensUsd` | `ANTHROPIC_INPUT_COST_PER_MTOK` / `ANTHROPIC_OUTPUT_COST_PER_MTOK` | placeholder — see below | Used to estimate spend |
| `categoryOverrides` | — (code only) | `{}` | Per-category overrides merged over the base config, e.g. a stricter `minLiquidityUsd` for a noisy category |

`loadCostControlsConfig(overrides)` layers: defaults → environment
variables → an explicit `overrides` object (highest precedence), read at
call time so tests can set `process.env` per case.

**Model pricing is a placeholder.** `DEFAULT_MODEL_PRICING` in
`lib/ai/cost-controls.ts` needs to be updated (or overridden via env) to
match whatever `ANALYSIS_MODEL`'s actual billed rate is before spend
figures are trusted for real budgeting — an under/over-estimate never
blocks an analysis from running, it only skews the cost dashboard and the
daily-budget check.

## How the gates are applied

`checkCostEligibility()` — liquidity/spread only, plus category overrides
— gates both `selectEligibleMarkets` (batch) and
`runSingleMarketAnalysis`'s own pre-check (on-demand), so the same
thresholds apply regardless of trigger path. `checkReanalysisEligibility`
(`lib/services/reanalysis.service.ts`) is the separate cooldown gate.
Both can be bypassed with `forceReanalysis: true` — the on-demand route
exposes this as `?force=true`, for an explicit user/admin override.

## Daily budget enforcement

`lib/ai/batch-engine.ts::runBatchAnalysis`:

1. Reads `getTodaysSpendUsd()` (`lib/services/analysis-runs.service.ts`) —
   the sum of `estimated_cost_usd` across every `analysis_runs` row
   started today (UTC), not just the current run.
2. Before starting each new market, calls `checkDailyBudget(spentSoFar,
   config)`. If exhausted, the run stops **scheduling new work** but lets
   any already-in-flight analyses finish — a safe stop, not a hard abort
   mid-call. Every market that would have run instead is counted as
   skipped with reason `"run stopped: daily budget exhausted"`.
3. The run finishes with `status: "budget_stopped"` and
   `budget_stopped: true`, both visible on `/admin/ai-engine`.

`tests/unit/batch-engine.test.ts` asserts this end to end: given a
pre-exhausted budget, zero markets are analyzed and every candidate is
recorded as skipped for that reason.

## Token/cost/duration recording

Every `SingleAnalysisOutcome` that reached the model (`ok`, `refused`,
`invalid_output`) carries `usage: { inputTokens, outputTokens }`, even on
failure — so cost is attributed to attempts regardless of whether they
ultimately succeeded. The batch engine sums these per run and calls
`estimateCostUsd()` to convert to a dollar figure; `finishAnalysisRun`
persists the totals plus `duration_ms` to `analysis_runs`.

## Resuming a partial/budget-stopped run

`runBatchAnalysis({ resumeFromRunId })` scopes the new run to only the
markets that failed in the referenced run
(`getFailedMarketIds` in `lib/services/analysis-runs.service.ts`), and
records the lineage on `analysis_runs.resumed_from_run_id`. Markets that
were simply never reached (skipped for budget, not failed) are eligible
again naturally on the next unscoped run, since no `analyses` row exists
for them and the reanalysis cooldown doesn't apply to a market that's
never been analyzed.

## Admin visibility

`/admin/ai-engine` (`ai-engine-metrics.service.ts`) surfaces today's
spend vs. the cap (with an explicit banner when exhausted), average cost
per analysis, token usage, average run/per-market latency, the
structured-output failure rate, and a skip-reason breakdown merged across
recent runs — see the page itself for the full metric list.
