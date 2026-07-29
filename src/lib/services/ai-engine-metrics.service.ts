import type { Db } from "./types";
import type { AnalysisFailure, AnalysisRun } from "@/types/database.types";
import { checkDailyBudget, DEFAULT_COST_CONTROLS, type CostControlsConfig, type BudgetStatus } from "@/lib/ai/cost-controls";
import { getTodaysSpendUsd } from "./analysis-runs.service";

const RECENT_RUNS_LIMIT = 20;
const RECENT_FAILURES_LIMIT = 30;

export interface AiEngineMetrics {
  recentRuns: AnalysisRun[];
  recentFailures: AnalysisFailure[];
  totalAnalysesAllTime: number;
  /** Aggregated over `recentRuns`. */
  marketsAnalyzed: number;
  marketsInsufficientData: number;
  marketsSkipped: number;
  marketsFailed: number;
  skipSummary: Record<string, number>;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  avgCostPerAnalysis: number | null;
  avgRunDurationMs: number | null;
  avgDurationPerMarketMs: number | null;
  structuredOutputFailureRate: number | null;
  todaysSpendUsd: number;
  budget: BudgetStatus;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Aggregates AI Opportunity Engine operational metrics for the admin panel
 * (task #36): cost/latency/failure-rate/skip-reason visibility into
 * whether the batch engine is healthy and staying within budget. Reads
 * only — never mutates run or failure records.
 */
export async function getAiEngineMetrics(db: Db, config: CostControlsConfig = DEFAULT_COST_CONTROLS): Promise<AiEngineMetrics> {
  const [runsResult, failuresResult, totalAnalysesResult, validationFailuresResult, todaysSpendUsd] = await Promise.all([
    db.from("analysis_runs").select("*").order("started_at", { ascending: false }).limit(RECENT_RUNS_LIMIT),
    db.from("analysis_failures").select("*").order("occurred_at", { ascending: false }).limit(RECENT_FAILURES_LIMIT),
    db.from("analyses").select("id", { count: "exact", head: true }),
    db.from("analysis_failures").select("id", { count: "exact", head: true }).eq("stage", "validation"),
    getTodaysSpendUsd(db),
  ]);

  if (runsResult.error) throw new Error(`Failed to load analysis runs: ${runsResult.error.message}`);
  if (failuresResult.error) throw new Error(`Failed to load analysis failures: ${failuresResult.error.message}`);
  if (totalAnalysesResult.error) throw new Error(`Failed to count analyses: ${totalAnalysesResult.error.message}`);
  if (validationFailuresResult.error) {
    throw new Error(`Failed to count validation failures: ${validationFailuresResult.error.message}`);
  }

  const recentRuns = runsResult.data ?? [];
  const recentFailures = failuresResult.data ?? [];
  const totalAnalysesAllTime = totalAnalysesResult.count ?? 0;
  const validationFailureCount = validationFailuresResult.count ?? 0;

  const marketsAnalyzed = recentRuns.reduce((sum, r) => sum + r.markets_analyzed, 0);
  const marketsInsufficientData = recentRuns.reduce((sum, r) => sum + r.markets_insufficient_data, 0);
  const marketsSkipped = recentRuns.reduce((sum, r) => sum + r.markets_skipped, 0);
  const marketsFailed = recentRuns.reduce((sum, r) => sum + r.markets_failed, 0);
  const totalInputTokens = recentRuns.reduce((sum, r) => sum + r.total_input_tokens, 0);
  const totalOutputTokens = recentRuns.reduce((sum, r) => sum + r.total_output_tokens, 0);
  const totalCostUsd = recentRuns.reduce((sum, r) => sum + r.estimated_cost_usd, 0);

  const skipSummary: Record<string, number> = {};
  for (const run of recentRuns) {
    const runSkips = (run.skip_summary ?? {}) as Record<string, number>;
    for (const [reason, count] of Object.entries(runSkips)) {
      skipSummary[reason] = (skipSummary[reason] ?? 0) + count;
    }
  }

  const finishedRuns = recentRuns.filter((r) => r.duration_ms !== null);
  const avgRunDurationMs = mean(finishedRuns.map((r) => r.duration_ms as number));
  const avgDurationPerMarketMs = mean(
    finishedRuns.filter((r) => r.markets_selected > 0).map((r) => (r.duration_ms as number) / r.markets_selected),
  );

  const structuredOutputDenominator = totalAnalysesAllTime + validationFailureCount;
  const structuredOutputFailureRate =
    structuredOutputDenominator > 0 ? validationFailureCount / structuredOutputDenominator : null;

  return {
    recentRuns,
    recentFailures,
    totalAnalysesAllTime,
    marketsAnalyzed,
    marketsInsufficientData,
    marketsSkipped,
    marketsFailed,
    skipSummary,
    totalInputTokens,
    totalOutputTokens,
    totalCostUsd,
    avgCostPerAnalysis: marketsAnalyzed > 0 ? totalCostUsd / marketsAnalyzed : null,
    avgRunDurationMs,
    avgDurationPerMarketMs,
    structuredOutputFailureRate,
    todaysSpendUsd,
    budget: checkDailyBudget(todaysSpendUsd, config),
  };
}
