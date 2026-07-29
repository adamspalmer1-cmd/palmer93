import type { Db } from "./types";
import type { AnalysisRun, Json } from "@/types/database.types";

export interface CreateAnalysisRunInput {
  filters: Record<string, unknown>;
  resumedFromRunId?: number | null;
  startedAt?: Date;
}

export async function createAnalysisRun(db: Db, input: CreateAnalysisRunInput): Promise<AnalysisRun> {
  const { data, error } = await db
    .from("analysis_runs")
    .insert({
      status: "running",
      filters: input.filters as unknown as Json,
      resumed_from_run_id: input.resumedFromRunId ?? null,
      started_at: (input.startedAt ?? new Date()).toISOString(),
    })
    .select()
    .single();
  if (error || !data) throw new Error(`Failed to create analysis run: ${error?.message}`);
  return data;
}

export interface FinishAnalysisRunInput {
  status: "success" | "partial" | "failed" | "budget_stopped";
  marketsSelected: number;
  marketsAnalyzed: number;
  marketsInsufficientData: number;
  marketsSkipped: number;
  marketsFailed: number;
  skipSummary: Record<string, number>;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUsd: number;
  durationMs: number;
  budgetStopped: boolean;
  error?: string | null;
  finishedAt?: Date;
}

/** `analysis_runs` is an ops/telemetry table, not one of the immutable analysis-history tables — updating it in place as a run progresses/finishes is intentional. */
export async function finishAnalysisRun(db: Db, runId: number, input: FinishAnalysisRunInput): Promise<void> {
  const { error } = await db
    .from("analysis_runs")
    .update({
      status: input.status,
      finished_at: (input.finishedAt ?? new Date()).toISOString(),
      markets_selected: input.marketsSelected,
      markets_analyzed: input.marketsAnalyzed,
      markets_insufficient_data: input.marketsInsufficientData,
      markets_skipped: input.marketsSkipped,
      markets_failed: input.marketsFailed,
      skip_summary: input.skipSummary as unknown as Json,
      total_input_tokens: input.totalInputTokens,
      total_output_tokens: input.totalOutputTokens,
      estimated_cost_usd: input.estimatedCostUsd,
      duration_ms: input.durationMs,
      budget_stopped: input.budgetStopped,
      error: input.error ?? null,
    })
    .eq("id", runId);
  if (error) throw new Error(`Failed to finish analysis run ${runId}: ${error.message}`);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Sums `estimated_cost_usd` across every run started today (UTC) — the daily budget cap applies across all of today's runs, not just the currently executing one. */
export async function getTodaysSpendUsd(db: Db, now: Date = new Date()): Promise<number> {
  const start = startOfUtcDay(now);
  const { data, error } = await db
    .from("analysis_runs")
    .select("estimated_cost_usd")
    .gte("started_at", start.toISOString());
  if (error) throw new Error(`Failed to compute today's AI spend: ${error.message}`);
  return (data ?? []).reduce((sum, row) => sum + (row.estimated_cost_usd ?? 0), 0);
}

/** Distinct market ids that failed (any stage) during a prior run — used to scope a resumed run to just the markets that need retrying. */
export async function getFailedMarketIds(db: Db, runId: number): Promise<Set<string>> {
  const { data, error } = await db.from("analysis_failures").select("market_id").eq("run_id", runId);
  if (error) throw new Error(`Failed to load failed market ids for run ${runId}: ${error.message}`);
  return new Set((data ?? []).map((row) => row.market_id).filter((id): id is string => id !== null));
}
