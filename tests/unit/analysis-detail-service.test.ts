import { describe, expect, it } from "vitest";
import { getFullAnalysis, getLatestFullAnalysis, getAnalysisHistory } from "@/lib/services/analysis-detail.service";
import { createFakeDb } from "../helpers/fake-supabase";

function analysis(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    market_id: "m1",
    analyzed_at: "2026-07-29T00:00:00Z",
    market_probability: 0.4,
    fair_probability_low: 0.45,
    fair_probability_base: 0.5,
    fair_probability_high: 0.55,
    opportunity_score: 60,
    recommendation_status: "WATCH",
    ...overrides,
  };
}

describe("getFullAnalysis", () => {
  it("returns null when the analysis doesn't exist", async () => {
    const db = createFakeDb({ analyses: [] });
    expect(await getFullAnalysis(db, 999)).toBeNull();
  });

  it("splits evidence into key and contrary by supports_thesis", async () => {
    const db = createFakeDb({
      analyses: [analysis()],
      analysis_evidence: [
        { id: 1, analysis_id: 1, title: "Supports", supports_thesis: true },
        { id: 2, analysis_id: 1, title: "Neutral/unset", supports_thesis: null },
        { id: 3, analysis_id: 1, title: "Contrary", supports_thesis: false },
      ],
      analysis_catalysts: [],
      analysis_assumptions: [],
      analysis_unknowns: [],
    });
    const full = await getFullAnalysis(db, 1);
    expect(full?.keyEvidence.map((e) => e.title)).toEqual(["Supports", "Neutral/unset"]);
    expect(full?.contraryEvidence.map((e) => e.title)).toEqual(["Contrary"]);
  });

  it("loads catalysts, assumptions, and unknowns in sort order", async () => {
    const db = createFakeDb({
      analyses: [analysis()],
      analysis_evidence: [],
      analysis_catalysts: [
        { id: 1, analysis_id: 1, kind: "catalyst", description: "second", sort_order: 1 },
        { id: 2, analysis_id: 1, kind: "catalyst", description: "first", sort_order: 0 },
      ],
      analysis_assumptions: [{ id: 1, analysis_id: 1, assumption: "a1", sort_order: 0 }],
      analysis_unknowns: [{ id: 1, analysis_id: 1, description: "u1", sort_order: 0 }],
    });
    const full = await getFullAnalysis(db, 1);
    expect(full?.catalysts.map((c) => c.description)).toEqual(["first", "second"]);
    expect(full?.assumptions).toHaveLength(1);
    expect(full?.unknowns).toHaveLength(1);
  });

  it("scopes child rows to the requested analysis only", async () => {
    const db = createFakeDb({
      analyses: [analysis({ id: 1 }), analysis({ id: 2 })],
      analysis_evidence: [
        { id: 1, analysis_id: 1, title: "For analysis 1", supports_thesis: true },
        { id: 2, analysis_id: 2, title: "For analysis 2", supports_thesis: true },
      ],
      analysis_catalysts: [],
      analysis_assumptions: [],
      analysis_unknowns: [],
    });
    const full = await getFullAnalysis(db, 1);
    expect(full?.keyEvidence.map((e) => e.title)).toEqual(["For analysis 1"]);
  });
});

describe("getLatestFullAnalysis", () => {
  it("returns null when the market has no analyses", async () => {
    const db = createFakeDb({ analyses: [] });
    expect(await getLatestFullAnalysis(db, "m1")).toBeNull();
  });

  it("resolves the most recent analysis and its child rows", async () => {
    const db = createFakeDb({
      analyses: [analysis({ id: 1, analyzed_at: "2026-07-28T00:00:00Z" }), analysis({ id: 2, analyzed_at: "2026-07-29T00:00:00Z" })],
      analysis_evidence: [],
      analysis_catalysts: [],
      analysis_assumptions: [],
      analysis_unknowns: [],
    });
    const full = await getLatestFullAnalysis(db, "m1");
    expect(full?.analysis.id).toBe(2);
  });
});

describe("getAnalysisHistory", () => {
  it("returns history points oldest first", async () => {
    const db = createFakeDb({
      analyses: [
        analysis({ id: 2, analyzed_at: "2026-07-29T00:00:00Z" }),
        analysis({ id: 1, analyzed_at: "2026-07-28T00:00:00Z" }),
      ],
    });
    const history = await getAnalysisHistory(db, "m1");
    expect(history.map((h) => h.analysisId)).toEqual([1, 2]);
    expect(history[0].fairProbabilityBase).toBe(0.5);
  });

  it("returns an empty array for a market with no analyses", async () => {
    const db = createFakeDb({ analyses: [] });
    expect(await getAnalysisHistory(db, "m1")).toEqual([]);
  });
});
