import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/services/analysis-eligibility.service", () => ({
  selectEligibleMarkets: vi.fn(),
}));
vi.mock("@/lib/services/analysis-runs.service", () => ({
  createAnalysisRun: vi.fn(),
  finishAnalysisRun: vi.fn(),
  getFailedMarketIds: vi.fn(),
  getTodaysSpendUsd: vi.fn(),
}));
vi.mock("@/lib/ai/analyze-market", () => ({
  runSingleMarketAnalysis: vi.fn(),
}));

import { selectEligibleMarkets } from "@/lib/services/analysis-eligibility.service";
import { createAnalysisRun, finishAnalysisRun, getFailedMarketIds, getTodaysSpendUsd } from "@/lib/services/analysis-runs.service";
import { runSingleMarketAnalysis } from "@/lib/ai/analyze-market";
import { runBatchAnalysis } from "@/lib/ai/batch-engine";
import { DEFAULT_COST_CONTROLS } from "@/lib/ai/cost-controls";

function market(id: string, overrides: Record<string, unknown> = {}) {
  return { id, liquidity: 10_000, spread: 0.02, category_id: "politics", ...overrides } as never;
}

const NOW = new Date("2026-07-29T12:00:00Z");

describe("runBatchAnalysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createAnalysisRun).mockResolvedValue({ id: 100 } as never);
    vi.mocked(getTodaysSpendUsd).mockResolvedValue(0);
    vi.mocked(getFailedMarketIds).mockResolvedValue(new Set());
  });

  it("processes every eligible market and reports a success summary", async () => {
    vi.mocked(selectEligibleMarkets).mockResolvedValue({
      eligible: [market("m1"), market("m2")],
      skipped: [{ market: market("m3"), reasons: ["liquidity too low"] }],
    });
    vi.mocked(runSingleMarketAnalysis).mockResolvedValue({
      status: "ok",
      analysis: { recommendation_status: "WATCH" } as never,
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    const summary = await runBatchAnalysis({} as never, { now: NOW });

    expect(summary.status).toBe("success");
    expect(summary.marketsAnalyzed).toBe(2);
    expect(summary.marketsSkipped).toBe(1);
    expect(summary.skipSummary["liquidity too low"]).toBe(1);
    expect(summary.totalInputTokens).toBe(200);
    expect(summary.totalOutputTokens).toBe(100);
    expect(runSingleMarketAnalysis).toHaveBeenCalledTimes(2);
    expect(finishAnalysisRun).toHaveBeenCalledWith(expect.anything(), 100, expect.objectContaining({ status: "success" }));
  });

  it("counts INSUFFICIENT DATA results separately from analyzed", async () => {
    vi.mocked(selectEligibleMarkets).mockResolvedValue({ eligible: [market("m1")], skipped: [] });
    vi.mocked(runSingleMarketAnalysis).mockResolvedValue({
      status: "ok",
      analysis: { recommendation_status: "INSUFFICIENT DATA" } as never,
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const summary = await runBatchAnalysis({} as never, { now: NOW });
    expect(summary.marketsAnalyzed).toBe(1);
    expect(summary.marketsInsufficientData).toBe(1);
  });

  it("marks the run partial when some markets fail", async () => {
    vi.mocked(selectEligibleMarkets).mockResolvedValue({ eligible: [market("m1"), market("m2")], skipped: [] });
    vi.mocked(runSingleMarketAnalysis)
      .mockResolvedValueOnce({ status: "ok", analysis: { recommendation_status: "WATCH" } as never, usage: { inputTokens: 10, outputTokens: 10 } })
      .mockResolvedValueOnce({ status: "refused", message: "no", usage: { inputTokens: 5, outputTokens: 0 } });

    const summary = await runBatchAnalysis({} as never, { now: NOW, concurrency: 1 });
    expect(summary.status).toBe("partial");
    expect(summary.marketsFailed).toBe(1);
  });

  it("caps candidates at maxMarketsPerRun", async () => {
    vi.mocked(selectEligibleMarkets).mockResolvedValue({
      eligible: [market("m1"), market("m2"), market("m3")],
      skipped: [],
    });
    vi.mocked(runSingleMarketAnalysis).mockResolvedValue({
      status: "ok",
      analysis: { recommendation_status: "WATCH" } as never,
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const summary = await runBatchAnalysis({} as never, {
      now: NOW,
      config: { ...DEFAULT_COST_CONTROLS, maxMarketsPerRun: 2 },
    });
    expect(summary.marketsSelected).toBe(2);
    expect(runSingleMarketAnalysis).toHaveBeenCalledTimes(2);
  });

  it("stops scheduling new work once the daily budget is exhausted, marking remaining markets skipped", async () => {
    vi.mocked(selectEligibleMarkets).mockResolvedValue({
      eligible: [market("m1"), market("m2"), market("m3")],
      skipped: [],
    });
    vi.mocked(getTodaysSpendUsd).mockResolvedValue(DEFAULT_COST_CONTROLS.maxDailySpendUsd);
    vi.mocked(runSingleMarketAnalysis).mockResolvedValue({
      status: "ok",
      analysis: { recommendation_status: "WATCH" } as never,
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const summary = await runBatchAnalysis({} as never, { now: NOW, concurrency: 1 });

    expect(summary.status).toBe("budget_stopped");
    expect(summary.budgetStopped).toBe(true);
    expect(summary.marketsSkipped).toBe(3);
    expect(runSingleMarketAnalysis).not.toHaveBeenCalled();
  });

  it("scopes a resumed run to only the markets that previously failed", async () => {
    vi.mocked(selectEligibleMarkets).mockResolvedValue({
      eligible: [market("m1"), market("m2"), market("m3")],
      skipped: [],
    });
    vi.mocked(getFailedMarketIds).mockResolvedValue(new Set(["m2"]));
    vi.mocked(runSingleMarketAnalysis).mockResolvedValue({
      status: "ok",
      analysis: { recommendation_status: "WATCH" } as never,
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const summary = await runBatchAnalysis({} as never, { now: NOW, resumeFromRunId: 42 });

    expect(summary.marketsSelected).toBe(1);
    expect(runSingleMarketAnalysis).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runSingleMarketAnalysis).mock.calls[0][1]).toEqual(market("m2"));
    expect(createAnalysisRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ resumedFromRunId: 42 }));
  });

  it("records skip reasons from pre-filtered ineligible markets in the skip summary", async () => {
    vi.mocked(selectEligibleMarkets).mockResolvedValue({
      eligible: [],
      skipped: [
        { market: market("m1"), reasons: ["liquidity too low"] },
        { market: market("m2"), reasons: ["liquidity too low", "spread too wide"] },
      ],
    });

    const summary = await runBatchAnalysis({} as never, { now: NOW });
    expect(summary.skipSummary["liquidity too low"]).toBe(2);
    expect(summary.skipSummary["spread too wide"]).toBe(1);
    expect(summary.status).toBe("success");
  });

  it("marks the run failed and rethrows when market selection itself throws", async () => {
    vi.mocked(selectEligibleMarkets).mockRejectedValue(new Error("db unreachable"));

    await expect(runBatchAnalysis({} as never, { now: NOW })).rejects.toThrow("db unreachable");
    expect(finishAnalysisRun).toHaveBeenCalledWith(expect.anything(), 100, expect.objectContaining({ status: "failed" }));
  });
});
