import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import Anthropic from "@anthropic-ai/sdk";
import {
  BANNED_LANGUAGE,
  PROMPT_INJECTION_DEFENSE_SENTENCE,
  RECOMMENDATION_STATUSES,
  SELF_CRITIQUE_QUESTIONS,
  type OpportunityAnalysisOutput,
} from "@/lib/ai/analysis-schema";
import {
  buildAnalysisSystemPrompt,
  buildAnalysisUserPrompt,
  runAnalysisModelCall,
  type AnalysisModelInput,
} from "@/lib/ai/analysis-model";

function baseAnalysisOutput(overrides: Partial<OpportunityAnalysisOutput> = {}): OpportunityAnalysisOutput {
  return {
    analyzedOutcome: "Yes",
    marketProbabilityObserved: 0.4,
    fairProbabilityLow: 0.45,
    fairProbabilityBase: 0.5,
    fairProbabilityHigh: 0.55,
    confidenceScore: 60,
    marketSummary: "Summary.",
    bullCase: ["Bull point."],
    bearCase: ["Bear point."],
    keyEvidence: [],
    contraryEvidence: [],
    assumptions: ["An assumption."],
    unknowns: ["An unknown."],
    catalysts: [],
    invalidationConditions: ["Invalidation."],
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
      whatWouldChangeAssessment: "new info",
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

function input(overrides: Partial<AnalysisModelInput> = {}): AnalysisModelInput {
  return {
    market: {
      id: "m1",
      question: "Will X happen?",
      description: "Resolves YES if X happens per official records.",
      category: "politics",
      analyzedOutcome: "Yes",
      endDate: "2026-12-31T00:00:00Z",
    },
    pricing: {
      marketProbability: 0.4,
      bestBid: 0.39,
      bestAsk: 0.41,
      midPrice: 0.4,
      spread: 0.02,
      liquidity: 20_000,
      volume24hr: 5_000,
    },
    priceHistory: [{ price: 0.38, capturedAt: "2026-07-28T00:00:00Z" }],
    relatedMarkets: [],
    previousAnalyses: [],
    dataFreshnessWarnings: [],
    sourceDataAsOf: "2026-07-29T00:00:00Z",
    ...overrides,
  };
}

function fakeMessage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    stop_reason: "end_turn",
    stop_details: null,
    content: [{ type: "text", text: "" }],
    parsed_output: baseAnalysisOutput(),
    usage: { input_tokens: 100, output_tokens: 50 },
    ...overrides,
  };
}

function fakeClient(parseImpl: (...args: unknown[]) => unknown) {
  return { messages: { parse: vi.fn(parseImpl) } } as unknown as Anthropic;
}

describe("buildAnalysisSystemPrompt", () => {
  it("includes the verbatim prompt-injection defense sentence", () => {
    expect(buildAnalysisSystemPrompt()).toContain(PROMPT_INJECTION_DEFENSE_SENTENCE);
  });

  it("includes all five self-critique questions", () => {
    const prompt = buildAnalysisSystemPrompt();
    for (const q of SELF_CRITIQUE_QUESTIONS) {
      expect(prompt).toContain(q);
    }
  });

  it("includes every banned language phrase and every recommendation status", () => {
    const prompt = buildAnalysisSystemPrompt();
    for (const phrase of BANNED_LANGUAGE) {
      expect(prompt.toLowerCase()).toContain(phrase);
    }
    for (const status of RECOMMENDATION_STATUSES) {
      expect(prompt).toContain(status);
    }
  });

  it("instructs the model never to estimate from the title alone", () => {
    expect(buildAnalysisSystemPrompt()).toMatch(/never estimate.*from the market question\/title alone/i);
  });
});

describe("buildAnalysisUserPrompt", () => {
  it("includes the market question, description, and observed market probability", () => {
    const prompt = buildAnalysisUserPrompt(input());
    expect(prompt).toContain("Will X happen?");
    expect(prompt).toContain("Resolves YES if X happens per official records.");
    expect(prompt).toContain("40.00%");
    expect(prompt).toContain("2026-07-29T00:00:00Z");
  });
});

describe("runAnalysisModelCall", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns ok with a valid parsed output on the first turn", async () => {
    const client = fakeClient(async () => fakeMessage());
    const result = await runAnalysisModelCall(input(), { client });

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.output.recommendationStatus).toBe("WATCH");
      expect(result.validationRetries).toBe(0);
      expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
    }
    expect(client.messages.parse).toHaveBeenCalledTimes(1);
  });

  it("resumes on pause_turn and aggregates usage across turns", async () => {
    const parse = vi
      .fn()
      .mockResolvedValueOnce(fakeMessage({ stop_reason: "pause_turn", parsed_output: null }))
      .mockResolvedValueOnce(fakeMessage());
    const client = { messages: { parse } } as unknown as Anthropic;

    const result = await runAnalysisModelCall(input(), { client, maxPauseTurnResumes: 3 });

    expect(result.status).toBe("ok");
    expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 100 });
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("gives up after exceeding the pause_turn resume cap", async () => {
    const client = fakeClient(async () => fakeMessage({ stop_reason: "pause_turn", parsed_output: null }));
    const result = await runAnalysisModelCall(input(), { client, maxPauseTurnResumes: 1 });

    expect(result.status).toBe("invalid_output");
    if (result.status === "invalid_output") {
      expect(result.errors[0]).toMatch(/pause_turn resumes/);
    }
    expect(client.messages.parse).toHaveBeenCalledTimes(2);
  });

  it("returns refused with the explanation on a refusal stop reason", async () => {
    const client = fakeClient(async () =>
      fakeMessage({ stop_reason: "refusal", stop_details: { type: "refusal", category: "general_harms", explanation: "Cannot help with that." } }),
    );
    const result = await runAnalysisModelCall(input(), { client });

    expect(result.status).toBe("refused");
    if (result.status === "refused") {
      expect(result.message).toBe("Cannot help with that.");
    }
  });

  it("re-prompts once on invalid output and succeeds if the retry is valid", async () => {
    const parse = vi
      .fn()
      .mockResolvedValueOnce(fakeMessage({ parsed_output: baseAnalysisOutput({ marketProbabilityObserved: 0.9 }) }))
      .mockResolvedValueOnce(fakeMessage());
    const client = { messages: { parse } } as unknown as Anthropic;

    const result = await runAnalysisModelCall(input(), { client, maxValidationRetries: 2 });

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.validationRetries).toBe(1);
    }
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("gives up after exceeding the validation retry cap", async () => {
    const client = fakeClient(async () => fakeMessage({ parsed_output: baseAnalysisOutput({ marketProbabilityObserved: 0.9 }) }));
    const result = await runAnalysisModelCall(input(), { client, maxValidationRetries: 1 });

    expect(result.status).toBe("invalid_output");
    if (result.status === "invalid_output") {
      expect(result.errors.some((e) => e.includes("marketProbabilityObserved"))).toBe(true);
    }
    expect(client.messages.parse).toHaveBeenCalledTimes(2);
  });

  it("returns invalid_output when no parsed_output is present", async () => {
    const client = fakeClient(async () => fakeMessage({ parsed_output: null }));
    const result = await runAnalysisModelCall(input(), { client, maxValidationRetries: 0 });

    expect(result.status).toBe("invalid_output");
  });

  it("retries a transient (5xx) API error and eventually succeeds", async () => {
    const parse = vi
      .fn()
      .mockRejectedValueOnce(new Anthropic.APIError(500, {}, "server error", new Headers()))
      .mockResolvedValueOnce(fakeMessage());
    const client = { messages: { parse } } as unknown as Anthropic;

    const result = await runAnalysisModelCall(input(), { client });

    expect(result.status).toBe("ok");
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-retryable (4xx) API error", async () => {
    const parse = vi.fn().mockRejectedValueOnce(new Anthropic.APIError(400, {}, "bad request", new Headers()));
    const client = { messages: { parse } } as unknown as Anthropic;

    await expect(runAnalysisModelCall(input(), { client })).rejects.toThrow();
    expect(parse).toHaveBeenCalledTimes(1);
  });
});
