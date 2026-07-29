import { describe, expect, it } from "vitest";
import { getAiEngineMetrics } from "@/lib/services/ai-engine-metrics.service";
import { DEFAULT_COST_CONTROLS } from "@/lib/ai/cost-controls";
import { createFakeDb } from "../helpers/fake-supabase";

function run(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    started_at: "2026-07-29T00:00:00Z",
    finished_at: "2026-07-29T00:01:00Z",
    status: "success",
    markets_selected: 10,
    markets_analyzed: 8,
    markets_insufficient_data: 1,
    markets_skipped: 1,
    markets_failed: 1,
    skip_summary: { "low liquidity": 1 },
    total_input_tokens: 1000,
    total_output_tokens: 500,
    estimated_cost_usd: 2,
    duration_ms: 60_000,
    budget_stopped: false,
    ...overrides,
  };
}

describe("getAiEngineMetrics", () => {
  it("aggregates counts, tokens, and cost across recent runs", async () => {
    const db = createFakeDb({
      analysis_runs: [run({ id: 1 }), run({ id: 2, markets_analyzed: 4, estimated_cost_usd: 1 })],
      analysis_failures: [],
      analyses: [{ id: 1 }, { id: 2 }],
    });
    const metrics = await getAiEngineMetrics(db, DEFAULT_COST_CONTROLS);

    expect(metrics.marketsAnalyzed).toBe(12);
    expect(metrics.totalCostUsd).toBe(3);
    expect(metrics.avgCostPerAnalysis).toBeCloseTo(3 / 12);
    expect(metrics.totalInputTokens).toBe(2000);
  });

  it("merges skip_summary across runs", async () => {
    const db = createFakeDb({
      analysis_runs: [
        run({ id: 1, skip_summary: { "low liquidity": 2, "wide spread": 1 } }),
        run({ id: 2, skip_summary: { "low liquidity": 3 } }),
      ],
      analysis_failures: [],
      analyses: [],
    });
    const metrics = await getAiEngineMetrics(db, DEFAULT_COST_CONTROLS);
    expect(metrics.skipSummary).toEqual({ "low liquidity": 5, "wide spread": 1 });
  });

  it("computes average run duration and average duration per market", async () => {
    const db = createFakeDb({
      analysis_runs: [
        run({ id: 1, duration_ms: 60_000, markets_selected: 10 }),
        run({ id: 2, duration_ms: 30_000, markets_selected: 5 }),
      ],
      analysis_failures: [],
      analyses: [],
    });
    const metrics = await getAiEngineMetrics(db, DEFAULT_COST_CONTROLS);
    expect(metrics.avgRunDurationMs).toBe(45_000);
    expect(metrics.avgDurationPerMarketMs).toBe(6_000);
  });

  it("computes structured-output failure rate from validation failures vs. successful analyses", async () => {
    const db = createFakeDb({
      analysis_runs: [],
      analysis_failures: [
        { id: 1, stage: "validation", occurred_at: "2026-07-29T00:00:00Z" },
        { id: 2, stage: "validation", occurred_at: "2026-07-29T00:01:00Z" },
        { id: 3, stage: "model_call", occurred_at: "2026-07-29T00:02:00Z" },
      ],
      analyses: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }, { id: 7 }, { id: 8 }],
    });
    const metrics = await getAiEngineMetrics(db, DEFAULT_COST_CONTROLS);
    // 2 validation failures / (8 successful analyses + 2 validation failures) = 0.2
    expect(metrics.structuredOutputFailureRate).toBeCloseTo(0.2);
  });

  it("returns null rates/averages when there is no data yet", async () => {
    const db = createFakeDb({ analysis_runs: [], analysis_failures: [], analyses: [] });
    const metrics = await getAiEngineMetrics(db, DEFAULT_COST_CONTROLS);
    expect(metrics.avgCostPerAnalysis).toBeNull();
    expect(metrics.avgRunDurationMs).toBeNull();
    expect(metrics.structuredOutputFailureRate).toBeNull();
  });

  it("reports today's spend and whether the daily budget is exhausted", async () => {
    const db = createFakeDb({
      analysis_runs: [{ ...run({ id: 1 }), started_at: new Date().toISOString(), estimated_cost_usd: DEFAULT_COST_CONTROLS.maxDailySpendUsd }],
      analysis_failures: [],
      analyses: [],
    });
    const metrics = await getAiEngineMetrics(db, DEFAULT_COST_CONTROLS);
    expect(metrics.todaysSpendUsd).toBe(DEFAULT_COST_CONTROLS.maxDailySpendUsd);
    expect(metrics.budget.exhausted).toBe(true);
  });

  it("returns the recent runs and failures lists for display", async () => {
    const db = createFakeDb({
      analysis_runs: [run({ id: 1 })],
      analysis_failures: [{ id: 1, stage: "model_call", error: "refused", occurred_at: "2026-07-29T00:00:00Z" }],
      analyses: [],
    });
    const metrics = await getAiEngineMetrics(db, DEFAULT_COST_CONTROLS);
    expect(metrics.recentRuns).toHaveLength(1);
    expect(metrics.recentFailures).toHaveLength(1);
  });
});
