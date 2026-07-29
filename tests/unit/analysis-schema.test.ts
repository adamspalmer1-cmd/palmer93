import { describe, expect, it } from "vitest";
import {
  opportunityAnalysisOutputSchema,
  validateAnalysisOutput,
  type OpportunityAnalysisOutput,
} from "@/lib/ai/analysis-schema";

function baseOutput(overrides: Partial<OpportunityAnalysisOutput> = {}): OpportunityAnalysisOutput {
  return {
    analyzedOutcome: "Yes",
    marketProbabilityObserved: 0.55,
    fairProbabilityLow: 0.5,
    fairProbabilityBase: 0.56,
    fairProbabilityHigh: 0.62,
    confidenceScore: 65,
    marketSummary: "A close race with recent polling movement toward Yes.",
    bullCase: ["Recent polling trend favors Yes."],
    bearCase: ["Historical base rate favors No in similar races."],
    keyEvidence: [
      {
        title: "Official poll release",
        publisher: "Reuters",
        url: "https://example.com/poll",
        publishedAt: "2026-07-20T00:00:00Z",
        eventDate: null,
        sourceType: "wire",
        credibilityTier: 2,
        excerpt: "Poll shows Yes ahead by 4 points.",
        supportsThesis: true,
        duplicateOfTitle: null,
      },
    ],
    contraryEvidence: [],
    assumptions: ["Assumes no major news shock before resolution."],
    unknowns: ["Unclear how undecided voters break."],
    catalysts: [
      { kind: "important_date", description: "Final debate", eventDate: "2026-08-01T00:00:00Z", importance: "high" },
    ],
    invalidationConditions: ["A late scandal affecting the frontrunner."],
    liquidityAssessment: "Liquidity is moderate, sufficient for small positions.",
    spreadAssessment: "Spread is tight at 1-2 cents.",
    resolutionCriteriaAssessment: "Resolution criteria reference the official certified result.",
    resolutionRiskLevel: "LOW",
    resolutionAmbiguityFlags: [],
    evidenceAssessment: "Evidence is recent and from credible primary/wire sources.",
    selfCritique: {
      weakestPoint: "Polling sample size is modest.",
      strongestCounterArgument: "Base rates historically favor the incumbent.",
      evidenceSufficiencyConcerns: "Only one recent poll available.",
      resolutionCriteriaAmbiguityConcerns: "None identified.",
      whatWouldChangeAssessment: "A second independent poll confirming the trend.",
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

const context = { marketProbability: 0.55 };

describe("opportunityAnalysisOutputSchema", () => {
  it("parses a well-formed analysis", () => {
    const result = opportunityAnalysisOutputSchema.safeParse(baseOutput());
    expect(result.success).toBe(true);
  });

  it("rejects probabilities outside [0, 1]", () => {
    const result = opportunityAnalysisOutputSchema.safeParse(baseOutput({ fairProbabilityHigh: 1.2 }));
    expect(result.success).toBe(false);
  });

  it("rejects scores outside [0, 100]", () => {
    const result = opportunityAnalysisOutputSchema.safeParse(baseOutput({ confidenceScore: 150 }));
    expect(result.success).toBe(false);
  });

  it("rejects a recommendationStatus outside the enumerated list", () => {
    const raw = { ...baseOutput(), recommendationStatus: "STRONG BUY" };
    const result = opportunityAnalysisOutputSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });
});

describe("validateAnalysisOutput", () => {
  it("accepts a consistent, well-hedged analysis", () => {
    const result = validateAnalysisOutput(baseOutput(), context);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects fairProbabilityLow > fairProbabilityBase", () => {
    const result = validateAnalysisOutput(
      baseOutput({ fairProbabilityLow: 0.6, fairProbabilityBase: 0.55 }),
      context,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("fairProbabilityLow"))).toBe(true);
  });

  it("rejects fairProbabilityBase > fairProbabilityHigh", () => {
    const result = validateAnalysisOutput(
      baseOutput({ fairProbabilityBase: 0.7, fairProbabilityHigh: 0.65 }),
      context,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("fairProbabilityBase"))).toBe(true);
  });

  it("rejects marketProbabilityObserved that doesn't match supplied data", () => {
    const result = validateAnalysisOutput(baseOutput({ marketProbabilityObserved: 0.9 }), context);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("marketProbabilityObserved"))).toBe(true);
  });

  it("requires a wider range under HIGH resolution risk", () => {
    const result = validateAnalysisOutput(
      baseOutput({
        resolutionRiskLevel: "HIGH",
        fairProbabilityLow: 0.53,
        fairProbabilityBase: 0.55,
        fairProbabilityHigh: 0.57,
      }),
      context,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("too narrow"))).toBe(true);
  });

  it("requires a wider range under CRITICAL resolution risk than HIGH", () => {
    const narrowButPassesHigh = baseOutput({
      resolutionRiskLevel: "CRITICAL",
      fairProbabilityLow: 0.45,
      fairProbabilityBase: 0.55,
      fairProbabilityHigh: 0.62,
    });
    const result = validateAnalysisOutput(narrowButPassesHigh, context);
    expect(result.valid).toBe(false);
  });

  it("requires a wider range under low confidence", () => {
    const result = validateAnalysisOutput(
      baseOutput({ confidenceScore: 20, fairProbabilityLow: 0.5, fairProbabilityBase: 0.53, fairProbabilityHigh: 0.56 }),
      context,
    );
    expect(result.valid).toBe(false);
  });

  it("requires a very wide range and low confidence for INSUFFICIENT DATA", () => {
    const tooConfident = baseOutput({
      recommendationStatus: "INSUFFICIENT DATA",
      confidenceScore: 50,
      fairProbabilityLow: 0.3,
      fairProbabilityBase: 0.5,
      fairProbabilityHigh: 0.7,
    });
    const result = validateAnalysisOutput(tooConfident, context);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("INSUFFICIENT DATA"))).toBe(true);
  });

  it("passes INSUFFICIENT DATA when hedged appropriately", () => {
    const hedged = baseOutput({
      recommendationStatus: "INSUFFICIENT DATA",
      confidenceScore: 10,
      fairProbabilityLow: 0.2,
      fairProbabilityBase: 0.5,
      fairProbabilityHigh: 0.8,
      marketProbabilityObserved: 0.55,
    });
    const result = validateAnalysisOutput(hedged, context);
    expect(result.valid).toBe(true);
  });

  it("rejects a materially-weakened thesis that keeps a high confidence score", () => {
    const result = validateAnalysisOutput(
      baseOutput({
        confidenceScore: 85,
        selfCritique: {
          ...baseOutput().selfCritique,
          materiallyWeakensThesis: true,
          adjustmentsMade: "Lowered confidence and recommendation status.",
        },
      }),
      context,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("materiallyWeakensThesis"))).toBe(true);
  });

  it("rejects a materially-weakened thesis with no adjustments noted", () => {
    const result = validateAnalysisOutput(
      baseOutput({
        confidenceScore: 40,
        selfCritique: { ...baseOutput().selfCritique, materiallyWeakensThesis: true, adjustmentsMade: "" },
      }),
      context,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("adjustmentsMade"))).toBe(true);
  });

  it.each(["Guaranteed", "a Lock", "sure thing", "can't miss", "risk-free"])(
    "rejects banned overconfident language: %s",
    (phrase) => {
      const result = validateAnalysisOutput(baseOutput({ marketSummary: `This is ${phrase}.` }), context);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("banned overconfident language"))).toBe(true);
    },
  );

  it("scans nested evidence excerpts for banned language", () => {
    const result = validateAnalysisOutput(
      baseOutput({
        keyEvidence: [
          {
            title: "Bad excerpt",
            publisher: null,
            url: null,
            publishedAt: null,
            eventDate: null,
            sourceType: null,
            credibilityTier: 3,
            excerpt: "This is a guaranteed outcome.",
            supportsThesis: true,
            duplicateOfTitle: null,
          },
        ],
      }),
      context,
    );
    expect(result.valid).toBe(false);
  });
});
