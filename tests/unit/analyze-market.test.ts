import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/services/analysis-context.service", () => ({
  buildAnalysisModelInput: vi.fn(),
}));
vi.mock("@/lib/services/reanalysis.service", () => ({
  checkReanalysisEligibility: vi.fn(),
}));
vi.mock("@/lib/services/analysis-persistence.service", () => ({
  persistAnalysis: vi.fn(),
  recordAnalysisFailure: vi.fn(),
}));
vi.mock("@/lib/ai/analysis-model", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/analysis-model")>("@/lib/ai/analysis-model");
  return { ...actual, runAnalysisModelCall: vi.fn() };
});

import { buildAnalysisModelInput } from "@/lib/services/analysis-context.service";
import { checkReanalysisEligibility } from "@/lib/services/reanalysis.service";
import { persistAnalysis, recordAnalysisFailure } from "@/lib/services/analysis-persistence.service";
import { runAnalysisModelCall, type AnalysisModelInput } from "@/lib/ai/analysis-model";
import { runSingleMarketAnalysis } from "@/lib/ai/analyze-market";
import type { OpportunityAnalysisOutput } from "@/lib/ai/analysis-schema";
import { DEFAULT_COST_CONTROLS } from "@/lib/ai/cost-controls";

function market(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    liquidity: 20_000,
    spread: 0.02,
    category_id: "politics",
    mid_price: 0.4,
    last_price: 0.4,
    ...overrides,
  } as never;
}

function modelInput(overrides: Partial<AnalysisModelInput> = {}): AnalysisModelInput {
  return {
    market: { id: "m1", question: "Q?", description: "d", category: "politics", analyzedOutcome: "Yes", endDate: null },
    pricing: { marketProbability: 0.4, bestBid: 0.39, bestAsk: 0.41, midPrice: 0.4, spread: 0.02, liquidity: 20_000, volume24hr: 1000 },
    priceHistory: [],
    relatedMarkets: [],
    previousAnalyses: [],
    dataFreshnessWarnings: [],
    sourceDataAsOf: "2026-07-29T00:00:00Z",
    ...overrides,
  };
}

function output(overrides: Partial<OpportunityAnalysisOutput> = {}): OpportunityAnalysisOutput {
  return {
    analyzedOutcome: "Yes",
    marketProbabilityObserved: 0.4,
    fairProbabilityLow: 0.45,
    fairProbabilityBase: 0.5,
    fairProbabilityHigh: 0.55,
    confidenceScore: 60,
    marketSummary: "Summary.",
    bullCase: ["Bull."],
    bearCase: ["Bear."],
    keyEvidence: [],
    contraryEvidence: [],
    assumptions: ["A."],
    unknowns: ["U."],
    catalysts: [],
    invalidationConditions: ["I."],
    liquidityAssessment: "Fine.",
    spreadAssessment: "Fine.",
    resolutionCriteriaAssessment: "Clear.",
    resolutionRiskLevel: "LOW",
    resolutionAmbiguityFlags: [],
    evidenceAssessment: "Adequate.",
    selfCritique: {
      weakestPoint: "x",
      strongestCounterArgument: "y",
      evidenceSufficiencyConcerns: "z",
      resolutionCriteriaAmbiguityConcerns: "none",
      whatWouldChangeAssessment: "info",
      materiallyWeakensThesis: false,
      adjustmentsMade: "",
    },
    recommendationStatus: "WATCH",
    promptInjectionFlags: [],
    dataFreshnessNotes: null,
    sourceDataAsOf: "2026-07-29T00:00:00Z",
    ...overrides,
  };
}

describe("runSingleMarketAnalysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildAnalysisModelInput).mockResolvedValue(modelInput());
    vi.mocked(checkReanalysisEligibility).mockResolvedValue({ eligible: true, reason: "never analyzed", lastAnalyzedAt: null });
    vi.mocked(persistAnalysis).mockResolvedValue({ id: 1, market_id: "m1" } as never);
  });

  it("skips a market that fails the cost-eligibility check without calling Claude", async () => {
    vi.mocked(runAnalysisModelCall).mockResolvedValue({
      status: "ok",
      output: output(),
      usage: { inputTokens: 0, outputTokens: 0 },
      validationRetries: 0,
    });

    const result = await runSingleMarketAnalysis({} as never, market({ liquidity: 1 }));

    expect(result.status).toBe("skipped");
    expect(runAnalysisModelCall).not.toHaveBeenCalled();
  });

  it("skips a market within its reanalysis cooldown", async () => {
    vi.mocked(checkReanalysisEligibility).mockResolvedValue({
      eligible: false,
      reason: "within reanalysis cooldown (5.0h remaining)",
      lastAnalyzedAt: "2026-07-29T00:00:00Z",
    });

    const result = await runSingleMarketAnalysis({} as never, market());

    expect(result.status).toBe("skipped");
    if (result.status === "skipped") expect(result.reason).toContain("cooldown");
    expect(runAnalysisModelCall).not.toHaveBeenCalled();
  });

  it("bypasses eligibility checks when forceReanalysis is set", async () => {
    vi.mocked(runAnalysisModelCall).mockResolvedValue({
      status: "ok",
      output: output(),
      usage: { inputTokens: 10, outputTokens: 10 },
      validationRetries: 0,
    });

    const result = await runSingleMarketAnalysis({} as never, market({ liquidity: 1 }), { forceReanalysis: true });

    expect(result.status).toBe("ok");
    expect(checkReanalysisEligibility).not.toHaveBeenCalled();
  });

  it("persists an analysis on a successful, valid model call", async () => {
    vi.mocked(runAnalysisModelCall).mockResolvedValue({
      status: "ok",
      output: output(),
      usage: { inputTokens: 10, outputTokens: 10 },
      validationRetries: 0,
    });

    const result = await runSingleMarketAnalysis({} as never, market());

    expect(result.status).toBe("ok");
    expect(persistAnalysis).toHaveBeenCalledTimes(1);
    const call = vi.mocked(persistAnalysis).mock.calls[0][1];
    expect(call.marketId).toBe("m1");
    expect(call.scoring.opportunityScore).toBeGreaterThanOrEqual(0);
  });

  it("records a failure and returns refused when Claude refuses", async () => {
    vi.mocked(runAnalysisModelCall).mockResolvedValue({
      status: "refused",
      message: "Cannot help with that.",
      usage: { inputTokens: 5, outputTokens: 0 },
    });

    const result = await runSingleMarketAnalysis({} as never, market());

    expect(result.status).toBe("refused");
    expect(recordAnalysisFailure).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ stage: "model_call", retryable: false }),
    );
    expect(persistAnalysis).not.toHaveBeenCalled();
  });

  it("records a failure and returns invalid_output when validation never succeeds", async () => {
    vi.mocked(runAnalysisModelCall).mockResolvedValue({
      status: "invalid_output",
      errors: ["fairProbabilityLow must be <= fairProbabilityBase"],
      usage: { inputTokens: 5, outputTokens: 5 },
    });

    const result = await runSingleMarketAnalysis({} as never, market());

    expect(result.status).toBe("invalid_output");
    expect(recordAnalysisFailure).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ stage: "validation", retryable: false }),
    );
  });

  it("records a context-stage failure when context assembly throws", async () => {
    vi.mocked(buildAnalysisModelInput).mockRejectedValue(new Error("no usable price data"));

    const result = await runSingleMarketAnalysis({} as never, market());

    expect(result.status).toBe("error");
    expect(recordAnalysisFailure).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ stage: "context" }));
    expect(runAnalysisModelCall).not.toHaveBeenCalled();
  });

  it("records a persistence-stage retryable failure when persistAnalysis throws", async () => {
    vi.mocked(runAnalysisModelCall).mockResolvedValue({
      status: "ok",
      output: output(),
      usage: { inputTokens: 10, outputTokens: 10 },
      validationRetries: 0,
    });
    vi.mocked(persistAnalysis).mockRejectedValue(new Error("db write failed"));

    const result = await runSingleMarketAnalysis({} as never, market());

    expect(result.status).toBe("error");
    expect(recordAnalysisFailure).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ stage: "persistence", retryable: true }),
    );
  });

  it("passes the runId through to persistAnalysis and failure records", async () => {
    vi.mocked(runAnalysisModelCall).mockResolvedValue({
      status: "refused",
      message: "no",
      usage: { inputTokens: 0, outputTokens: 0 },
    });

    await runSingleMarketAnalysis({} as never, market(), { runId: 42 });

    expect(recordAnalysisFailure).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ runId: 42 }));
  });

  it("respects a custom cost-controls config for eligibility", async () => {
    const strictConfig = { ...DEFAULT_COST_CONTROLS, minLiquidityUsd: 1_000_000 };
    const result = await runSingleMarketAnalysis({} as never, market(), { config: strictConfig });
    expect(result.status).toBe("skipped");
  });
});
