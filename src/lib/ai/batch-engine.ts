import "server-only";
import type { Db } from "@/lib/services/types";
import type { EligibilityFilters } from "@/lib/services/analysis-eligibility.service";
import { selectEligibleMarkets } from "@/lib/services/analysis-eligibility.service";
import {
  createAnalysisRun,
  finishAnalysisRun,
  getFailedMarketIds,
  getTodaysSpendUsd,
} from "@/lib/services/analysis-runs.service";
import { checkDailyBudget, DEFAULT_COST_CONTROLS, estimateCostUsd, type CostControlsConfig } from "@/lib/ai/cost-controls";
import { runSingleMarketAnalysis } from "@/lib/ai/analyze-market";

/**
 * Runs a bounded batch of market analyses: selects eligible markets (task
 * #30), processes them with limited concurrency, stops safely once the
 * daily budget is exhausted (finishing in-flight work rather than aborting
 * mid-call), and records a full `analysis_runs` summary — including a
 * skip-reason breakdown the admin panel (task #36) reads directly.
 */

const DEFAULT_CONCURRENCY = 3;
const BUDGET_STOP_REASON = "run stopped: daily budget exhausted";

export interface BatchRunOptions {
  config?: CostControlsConfig;
  filters?: EligibilityFilters;
  concurrency?: number;
  /** Scopes this run to only the markets that failed in a prior run, and records the lineage on `analysis_runs.resumed_from_run_id`. */
  resumeFromRunId?: number;
  now?: Date;
}

export interface BatchRunSummary {
  runId: number;
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
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let nextIndex = 0;
  async function runner(): Promise<void> {
    while (nextIndex < items.length) {
      const current = items[nextIndex];
      nextIndex += 1;
      await worker(current);
    }
  }
  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => runner()));
}

export async function runBatchAnalysis(db: Db, options: BatchRunOptions = {}): Promise<BatchRunSummary> {
  const config = options.config ?? DEFAULT_COST_CONTROLS;
  const now = options.now ?? new Date();
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const startedAtMs = now.getTime();

  const run = await createAnalysisRun(db, {
    filters: { ...options.filters },
    resumedFromRunId: options.resumeFromRunId ?? null,
    startedAt: now,
  });

  const skipSummary: Record<string, number> = {};
  const recordSkip = (reason: string, count = 1) => {
    skipSummary[reason] = (skipSummary[reason] ?? 0) + count;
  };

  let selection;
  try {
    selection = await selectEligibleMarkets(db, config, { ...options.filters, now });
  } catch (error) {
    const durationMs = Date.now() - startedAtMs;
    await finishAnalysisRun(db, run.id, {
      status: "failed",
      marketsSelected: 0,
      marketsAnalyzed: 0,
      marketsInsufficientData: 0,
      marketsSkipped: 0,
      marketsFailed: 0,
      skipSummary: {},
      totalInputTokens: 0,
      totalOutputTokens: 0,
      estimatedCostUsd: 0,
      durationMs,
      budgetStopped: false,
      error: (error as Error).message,
      finishedAt: now,
    });
    throw error;
  }

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let estimatedCostUsd = 0;
  let marketsAnalyzed = 0;
  let marketsInsufficientData = 0;
  let marketsSkipped = 0;
  let marketsFailed = 0;
  let budgetStopped = false;

  for (const skipped of selection.skipped) {
    marketsSkipped += 1;
    for (const reason of skipped.reasons) recordSkip(reason);
  }

  let candidates = selection.eligible;
  if (options.resumeFromRunId !== undefined) {
    const failedIds = await getFailedMarketIds(db, options.resumeFromRunId);
    candidates = candidates.filter((m) => failedIds.has(m.id));
  }
  candidates = candidates.slice(0, config.maxMarketsPerRun);

  const spentTodayBeforeRun = await getTodaysSpendUsd(db, now);

  await runWithConcurrency(candidates, concurrency, async (market) => {
    if (budgetStopped) {
      marketsSkipped += 1;
      recordSkip(BUDGET_STOP_REASON);
      return;
    }

    const budget = checkDailyBudget(spentTodayBeforeRun + estimatedCostUsd, config);
    if (budget.exhausted) {
      budgetStopped = true;
      marketsSkipped += 1;
      recordSkip(BUDGET_STOP_REASON);
      return;
    }

    const outcome = await runSingleMarketAnalysis(db, market, { runId: run.id, config, now });

    if ("usage" in outcome && outcome.usage) {
      totalInputTokens += outcome.usage.inputTokens;
      totalOutputTokens += outcome.usage.outputTokens;
      estimatedCostUsd += estimateCostUsd(outcome.usage.inputTokens, outcome.usage.outputTokens, config.modelPricing);
    }

    switch (outcome.status) {
      case "ok":
        marketsAnalyzed += 1;
        if (outcome.analysis.recommendation_status === "INSUFFICIENT DATA") marketsInsufficientData += 1;
        break;
      case "skipped":
        marketsSkipped += 1;
        recordSkip(outcome.reason);
        break;
      case "refused":
      case "invalid_output":
      case "error":
        marketsFailed += 1;
        break;
    }
  });

  const durationMs = Date.now() - startedAtMs;
  const status: BatchRunSummary["status"] = budgetStopped
    ? "budget_stopped"
    : marketsFailed > 0
      ? "partial"
      : "success";

  await finishAnalysisRun(db, run.id, {
    status,
    marketsSelected: candidates.length,
    marketsAnalyzed,
    marketsInsufficientData,
    marketsSkipped,
    marketsFailed,
    skipSummary,
    totalInputTokens,
    totalOutputTokens,
    estimatedCostUsd,
    durationMs,
    budgetStopped,
    finishedAt: new Date(startedAtMs + durationMs),
  });

  return {
    runId: run.id,
    status,
    marketsSelected: candidates.length,
    marketsAnalyzed,
    marketsInsufficientData,
    marketsSkipped,
    marketsFailed,
    skipSummary,
    totalInputTokens,
    totalOutputTokens,
    estimatedCostUsd,
    durationMs,
    budgetStopped,
  };
}
