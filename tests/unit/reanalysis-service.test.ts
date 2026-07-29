import { describe, expect, it } from "vitest";
import { checkReanalysisEligibility, getLatestAnalysis } from "@/lib/services/reanalysis.service";
import { DEFAULT_COST_CONTROLS } from "@/lib/ai/cost-controls";
import { createFakeDb } from "../helpers/fake-supabase";

function market(overrides: Record<string, unknown> = {}) {
  return { id: "m1", mid_price: 0.5, last_price: 0.5, ...overrides } as never;
}

function analysis(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    market_id: "m1",
    analyzed_at: "2026-07-29T00:00:00Z",
    market_probability: 0.5,
    fair_probability_base: 0.5,
    recommendation_status: "WATCH",
    opportunity_score: 40,
    ...overrides,
  };
}

const NOW = new Date("2026-07-29T02:00:00Z"); // 2 hours after the seeded analysis

describe("getLatestAnalysis", () => {
  it("returns null when no analysis exists", async () => {
    const db = createFakeDb({ analyses: [] });
    expect(await getLatestAnalysis(db, "m1")).toBeNull();
  });

  it("returns the most recent analysis for the market", async () => {
    const db = createFakeDb({
      analyses: [analysis({ id: 1, analyzed_at: "2026-07-28T00:00:00Z" }), analysis({ id: 2, analyzed_at: "2026-07-29T00:00:00Z" })],
    });
    const latest = await getLatestAnalysis(db, "m1");
    expect(latest?.id).toBe(2);
  });

  it("scopes to the requested market only", async () => {
    const db = createFakeDb({ analyses: [analysis({ id: 1, market_id: "other" })] });
    expect(await getLatestAnalysis(db, "m1")).toBeNull();
  });
});

describe("checkReanalysisEligibility", () => {
  it("is eligible when the market has never been analyzed", async () => {
    const db = createFakeDb({ analyses: [] });
    const result = await checkReanalysisEligibility(db, market(), DEFAULT_COST_CONTROLS, NOW);
    expect(result.eligible).toBe(true);
    expect(result.lastAnalyzedAt).toBeNull();
  });

  it("is eligible once the cooldown has elapsed", async () => {
    const db = createFakeDb({ analyses: [analysis({ analyzed_at: "2026-07-28T00:00:00Z" })] }); // 26h before NOW
    const result = await checkReanalysisEligibility(db, market(), DEFAULT_COST_CONTROLS, NOW);
    expect(result.eligible).toBe(true);
    expect(result.reason).toContain("cooldown elapsed");
  });

  it("is ineligible within the cooldown when the price hasn't moved", async () => {
    const db = createFakeDb({ analyses: [analysis({ analyzed_at: "2026-07-29T01:00:00Z", market_probability: 0.5 })] }); // 1h before NOW
    const result = await checkReanalysisEligibility(db, market({ mid_price: 0.5 }), DEFAULT_COST_CONTROLS, NOW);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("cooldown");
  });

  it("is eligible within the cooldown when the price has moved beyond the override threshold", async () => {
    const db = createFakeDb({ analyses: [analysis({ analyzed_at: "2026-07-29T01:00:00Z", market_probability: 0.5 })] });
    const result = await checkReanalysisEligibility(db, market({ mid_price: 0.6 }), DEFAULT_COST_CONTROLS, NOW);
    expect(result.eligible).toBe(true);
    expect(result.reason).toContain("price moved");
  });

  it("stays ineligible within the cooldown for a small price move under the threshold", async () => {
    const db = createFakeDb({ analyses: [analysis({ analyzed_at: "2026-07-29T01:00:00Z", market_probability: 0.5 })] });
    const result = await checkReanalysisEligibility(db, market({ mid_price: 0.51 }), DEFAULT_COST_CONTROLS, NOW);
    expect(result.eligible).toBe(false);
  });

  it("falls back to last_price when mid_price is unavailable for the price-move check", async () => {
    const db = createFakeDb({ analyses: [analysis({ analyzed_at: "2026-07-29T01:00:00Z", market_probability: 0.5 })] });
    const result = await checkReanalysisEligibility(
      db,
      market({ mid_price: null, last_price: 0.65 }),
      DEFAULT_COST_CONTROLS,
      NOW,
    );
    expect(result.eligible).toBe(true);
  });
});
