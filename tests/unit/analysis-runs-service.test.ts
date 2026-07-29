import { describe, expect, it } from "vitest";
import {
  createAnalysisRun,
  finishAnalysisRun,
  getFailedMarketIds,
  getTodaysSpendUsd,
} from "@/lib/services/analysis-runs.service";
import { createFakeDb, tableRows } from "../helpers/fake-supabase";

describe("createAnalysisRun", () => {
  it("inserts a running run with the given filters and lineage", async () => {
    const db = createFakeDb({ analysis_runs: [] });
    const run = await createAnalysisRun(db, {
      filters: { category: "politics" },
      resumedFromRunId: 5,
      startedAt: new Date("2026-07-29T00:00:00Z"),
    });
    expect(run.status).toBe("running");
    expect(run.resumed_from_run_id).toBe(5);
    expect(run.filters).toEqual({ category: "politics" });
  });
});

describe("finishAnalysisRun", () => {
  it("updates the run row with final counts and status", async () => {
    const db = createFakeDb({ analysis_runs: [{ id: 1, status: "running" }] });
    await finishAnalysisRun(db, 1, {
      status: "success",
      marketsSelected: 10,
      marketsAnalyzed: 8,
      marketsInsufficientData: 1,
      marketsSkipped: 1,
      marketsFailed: 1,
      skipSummary: { "low liquidity": 1 },
      totalInputTokens: 1000,
      totalOutputTokens: 500,
      estimatedCostUsd: 1.5,
      durationMs: 4000,
      budgetStopped: false,
    });
    const run = tableRows(db, "analysis_runs")[0];
    expect(run.status).toBe("success");
    expect(run.markets_analyzed).toBe(8);
    expect(run.estimated_cost_usd).toBe(1.5);
  });
});

describe("getTodaysSpendUsd", () => {
  it("sums spend across runs started today (UTC) only", async () => {
    const db = createFakeDb({
      analysis_runs: [
        { id: 1, started_at: "2026-07-29T00:30:00Z", estimated_cost_usd: 2 },
        { id: 2, started_at: "2026-07-29T20:00:00Z", estimated_cost_usd: 3 },
        { id: 3, started_at: "2026-07-28T23:59:00Z", estimated_cost_usd: 100 },
      ],
    });
    const total = await getTodaysSpendUsd(db, new Date("2026-07-29T21:00:00Z"));
    expect(total).toBe(5);
  });

  it("returns 0 when there are no runs today", async () => {
    const db = createFakeDb({ analysis_runs: [] });
    expect(await getTodaysSpendUsd(db, new Date("2026-07-29T12:00:00Z"))).toBe(0);
  });
});

describe("getFailedMarketIds", () => {
  it("returns the distinct market ids that failed for a run", async () => {
    const db = createFakeDb({
      analysis_failures: [
        { run_id: 1, market_id: "m1" },
        { run_id: 1, market_id: "m2" },
        { run_id: 2, market_id: "m3" },
        { run_id: 1, market_id: null },
      ],
    });
    const ids = await getFailedMarketIds(db, 1);
    expect(ids).toEqual(new Set(["m1", "m2"]));
  });
});
