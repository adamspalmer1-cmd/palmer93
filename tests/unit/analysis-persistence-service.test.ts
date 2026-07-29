import { describe, expect, it } from "vitest";
import {
  ensureModelVersion,
  ensurePromptVersion,
  persistAnalysis,
  recordAnalysisFailure,
} from "@/lib/services/analysis-persistence.service";
import type { OpportunityAnalysisOutput } from "@/lib/ai/analysis-schema";
import type { OpportunityScoreResult } from "@/lib/ai/opportunity-scoring";
import type { ProcessedEvidenceItem } from "@/lib/ai/evidence-pipeline";
import { createFakeDb, tableRows } from "../helpers/fake-supabase";

function baseOutput(overrides: Partial<OpportunityAnalysisOutput> = {}): OpportunityAnalysisOutput {
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
    catalysts: [{ kind: "important_date", description: "Vote", eventDate: "2026-08-01T00:00:00Z", importance: "high" }],
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

function baseScoring(overrides: Partial<OpportunityScoreResult> = {}): OpportunityScoreResult {
  return {
    opportunityScore: 55,
    liquidityScore: 70,
    spreadScore: 80,
    evidenceQualityScore: 60,
    resolutionRiskScore: 90,
    catalystScore: 35,
    estimatedEdgeLow: 0.05,
    estimatedEdgeBase: 0.1,
    estimatedEdgeHigh: 0.15,
    scoringVersion: "opportunity-score-v1",
    breakdown: [{ factor: "edgeScore", rawValue: 33, weight: 1, contribution: 33 }],
    ...overrides,
  };
}

function evidenceItem(overrides: Partial<ProcessedEvidenceItem> = {}): ProcessedEvidenceItem {
  return {
    title: "A story",
    publisher: "Reuters",
    url: "https://example.com/a",
    publishedAt: null,
    eventDate: null,
    sourceType: "wire",
    credibilityTier: 2,
    excerpt: "...",
    supportsThesis: true,
    duplicateOfTitle: null,
    effectiveDuplicateOfTitle: null,
    duplicateDetectionSource: null,
    credibilityWeight: 0.85,
    flaggedInjection: false,
    injectionNotes: null,
    ...overrides,
  };
}

describe("ensureModelVersion", () => {
  it("registers a model id the first time it's seen", async () => {
    const db = createFakeDb({ model_versions: [] });
    await ensureModelVersion(db, "claude-opus-5");
    expect(tableRows(db, "model_versions")).toEqual([{ id: "claude-opus-5", display_name: "claude-opus-5" }]);
  });

  it("does not duplicate or overwrite an existing registration", async () => {
    const db = createFakeDb({ model_versions: [{ id: "claude-opus-5", display_name: "custom", first_used_at: "2026-01-01T00:00:00Z" }] });
    await ensureModelVersion(db, "claude-opus-5", "should not apply");
    expect(tableRows(db, "model_versions")).toHaveLength(1);
    expect(tableRows(db, "model_versions")[0].display_name).toBe("custom");
  });
});

describe("ensurePromptVersion", () => {
  it("registers a prompt id + template the first time it's seen", async () => {
    const db = createFakeDb({ prompt_versions: [] });
    await ensurePromptVersion(db, "v1", "template text", "desc");
    expect(tableRows(db, "prompt_versions")).toEqual([{ id: "v1", template: "template text", description: "desc" }]);
  });

  it("does not duplicate an existing registration", async () => {
    const db = createFakeDb({ prompt_versions: [{ id: "v1", template: "original" }] });
    await ensurePromptVersion(db, "v1", "different template");
    expect(tableRows(db, "prompt_versions")).toHaveLength(1);
    expect(tableRows(db, "prompt_versions")[0].template).toBe("original");
  });
});

describe("persistAnalysis", () => {
  it("inserts the analyses row with fields mapped from output + scoring", async () => {
    const db = createFakeDb({
      model_versions: [],
      prompt_versions: [],
      analyses: [],
      analysis_evidence: [],
      analysis_scores: [],
      analysis_catalysts: [],
      analysis_assumptions: [],
      analysis_unknowns: [],
    });

    const analysis = await persistAnalysis(db, {
      marketId: "m1",
      runId: 7,
      output: baseOutput(),
      scoring: baseScoring(),
      keyEvidence: [],
      contraryEvidence: [],
      modelVersion: "claude-opus-5",
      promptVersion: "v1",
      promptTemplate: "system prompt text",
      marketSnapshot: { liquidity: 1000 },
    });

    expect(analysis.market_id).toBe("m1");
    expect(analysis.run_id).toBe(7);
    expect(analysis.opportunity_score).toBe(55);
    expect(analysis.recommendation_status).toBe("WATCH");
    expect(analysis.self_critique).toContain("weakest point");
    expect(tableRows(db, "model_versions")).toHaveLength(1);
    expect(tableRows(db, "prompt_versions")).toHaveLength(1);
  });

  it("persists the score breakdown rows linked to the analysis", async () => {
    const db = createFakeDb({
      model_versions: [],
      prompt_versions: [],
      analyses: [],
      analysis_evidence: [],
      analysis_scores: [],
      analysis_catalysts: [],
      analysis_assumptions: [],
      analysis_unknowns: [],
    });
    const analysis = await persistAnalysis(db, {
      marketId: "m1",
      runId: null,
      output: baseOutput(),
      scoring: baseScoring({
        breakdown: [
          { factor: "edgeScore", rawValue: 33, weight: 1, contribution: 33 },
          { factor: "liquidityScore", rawValue: 70, weight: 0.1667, contribution: 11.67 },
        ],
      }),
      keyEvidence: [],
      contraryEvidence: [],
      modelVersion: "claude-opus-5",
      promptVersion: "v1",
      promptTemplate: "prompt",
      marketSnapshot: {},
    });
    const scores = tableRows(db, "analysis_scores");
    expect(scores).toHaveLength(2);
    expect(scores.every((s) => s.analysis_id === analysis.id)).toBe(true);
  });

  it("persists catalysts, assumptions, and unknowns with sort order", async () => {
    const db = createFakeDb({
      model_versions: [],
      prompt_versions: [],
      analyses: [],
      analysis_evidence: [],
      analysis_scores: [],
      analysis_catalysts: [],
      analysis_assumptions: [],
      analysis_unknowns: [],
    });
    await persistAnalysis(db, {
      marketId: "m1",
      runId: null,
      output: baseOutput({ assumptions: ["a1", "a2"], unknowns: ["u1"] }),
      scoring: baseScoring(),
      keyEvidence: [],
      contraryEvidence: [],
      modelVersion: "claude-opus-5",
      promptVersion: "v1",
      promptTemplate: "prompt",
      marketSnapshot: {},
    });
    expect(tableRows(db, "analysis_catalysts")).toHaveLength(1);
    expect(tableRows(db, "analysis_assumptions").map((a) => a.assumption)).toEqual(["a1", "a2"]);
    expect(tableRows(db, "analysis_unknowns").map((u) => u.description)).toEqual(["u1"]);
  });

  it("inserts evidence sequentially and resolves duplicate_of_id from an earlier row's id", async () => {
    const db = createFakeDb({
      model_versions: [],
      prompt_versions: [],
      analyses: [],
      analysis_evidence: [],
      analysis_scores: [],
      analysis_catalysts: [],
      analysis_assumptions: [],
      analysis_unknowns: [],
    });

    await persistAnalysis(db, {
      marketId: "m1",
      runId: null,
      output: baseOutput(),
      scoring: baseScoring(),
      keyEvidence: [evidenceItem({ title: "Original" })],
      contraryEvidence: [evidenceItem({ title: "Rehash", effectiveDuplicateOfTitle: "Original" })],
      modelVersion: "claude-opus-5",
      promptVersion: "v1",
      promptTemplate: "prompt",
      marketSnapshot: {},
    });

    const evidenceRows = tableRows(db, "analysis_evidence");
    expect(evidenceRows).toHaveLength(2);
    const original = evidenceRows.find((r) => r.title === "Original");
    const rehash = evidenceRows.find((r) => r.title === "Rehash");
    expect(rehash?.duplicate_of_id).toBe(original?.id);
  });

  it("merges injection flags from processed evidence into prompt_injection_flags", async () => {
    const db = createFakeDb({
      model_versions: [],
      prompt_versions: [],
      analyses: [],
      analysis_evidence: [],
      analysis_scores: [],
      analysis_catalysts: [],
      analysis_assumptions: [],
      analysis_unknowns: [],
    });

    const analysis = await persistAnalysis(db, {
      marketId: "m1",
      runId: null,
      output: baseOutput({ promptInjectionFlags: ["model-noticed-something"] }),
      scoring: baseScoring(),
      keyEvidence: [evidenceItem({ title: "Sketchy", flaggedInjection: true, injectionNotes: "instruction override" })],
      contraryEvidence: [],
      modelVersion: "claude-opus-5",
      promptVersion: "v1",
      promptTemplate: "prompt",
      marketSnapshot: {},
    });

    const flags = analysis.prompt_injection_flags as string[];
    expect(flags).toContain("model-noticed-something");
    expect(flags.some((f) => f.includes("instruction override"))).toBe(true);
  });
});

describe("recordAnalysisFailure", () => {
  it("inserts a failure row", async () => {
    const db = createFakeDb({ analysis_failures: [] });
    await recordAnalysisFailure(db, { runId: 3, marketId: "m1", stage: "model_call", error: "boom", retryable: true });
    const rows = tableRows(db, "analysis_failures");
    expect(rows).toEqual([expect.objectContaining({ run_id: 3, market_id: "m1", stage: "model_call", error: "boom", retryable: true })]);
  });
});
