import { describe, expect, it } from "vitest";
import { listOpportunities, type ScannerFilters } from "@/lib/services/opportunity-scanner.service";
import { createFakeDb } from "../helpers/fake-supabase";

function analysis(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    market_id: "m1",
    recommendation_status: "WATCH",
    resolution_risk_level: "LOW",
    opportunity_score: 50,
    confidence_score: 60,
    estimated_edge_base: 0.1,
    market_probability: 0.4,
    fair_probability_base: 0.5,
    analyzed_at: "2026-07-29T00:00:00Z",
    ...overrides,
  };
}

function market(overrides: Record<string, unknown> = {}) {
  return { id: "m1", slug: "m1-slug", question: "Will X?", category_id: "politics", liquidity: 10_000, spread: 0.02, ...overrides };
}

function baseFilters(overrides: Partial<ScannerFilters> = {}): ScannerFilters {
  return { sort: "opportunity_score", sortDir: "desc", page: 1, ...overrides };
}

describe("listOpportunities", () => {
  it("joins the latest_analyses view with live market data", async () => {
    const db = createFakeDb({ latest_analyses: [analysis()], markets: [market()] });
    const result = await listOpportunities(db, baseFilters());
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].market?.question).toBe("Will X?");
    expect(result.count).toBe(1);
  });

  it("filters by recommendation status", async () => {
    const db = createFakeDb({
      latest_analyses: [analysis({ id: 1, market_id: "m1", recommendation_status: "WATCH" }), analysis({ id: 2, market_id: "m2", recommendation_status: "PASS" })],
      markets: [market({ id: "m1" }), market({ id: "m2" })],
    });
    const result = await listOpportunities(db, baseFilters({ recommendationStatus: "PASS" }));
    expect(result.rows.map((r) => r.analysis.id)).toEqual([2]);
  });

  it("filters by resolution risk level", async () => {
    const db = createFakeDb({
      latest_analyses: [analysis({ id: 1, resolution_risk_level: "LOW" }), analysis({ id: 2, market_id: "m2", resolution_risk_level: "HIGH" })],
      markets: [market({ id: "m1" }), market({ id: "m2" })],
    });
    const result = await listOpportunities(db, baseFilters({ resolutionRiskLevel: "HIGH" }));
    expect(result.rows.map((r) => r.analysis.id)).toEqual([2]);
  });

  it("filters by minimum opportunity score", async () => {
    const db = createFakeDb({
      latest_analyses: [analysis({ id: 1, opportunity_score: 30 }), analysis({ id: 2, market_id: "m2", opportunity_score: 80 })],
      markets: [market({ id: "m1" }), market({ id: "m2" })],
    });
    const result = await listOpportunities(db, baseFilters({ minOpportunityScore: 50 }));
    expect(result.rows.map((r) => r.analysis.id)).toEqual([2]);
  });

  it("filters by category via the joined market, after the DB-level scan", async () => {
    const db = createFakeDb({
      latest_analyses: [analysis({ id: 1, market_id: "m1" }), analysis({ id: 2, market_id: "m2" })],
      markets: [market({ id: "m1", category_id: "politics" }), market({ id: "m2", category_id: "sports" })],
    });
    const result = await listOpportunities(db, baseFilters({ category: "sports" }));
    expect(result.rows.map((r) => r.analysis.id)).toEqual([2]);
  });

  it("sorts by the requested column and direction", async () => {
    const db = createFakeDb({
      latest_analyses: [
        analysis({ id: 1, market_id: "m1", opportunity_score: 30 }),
        analysis({ id: 2, market_id: "m2", opportunity_score: 80 }),
      ],
      markets: [market({ id: "m1" }), market({ id: "m2" })],
    });
    const asc = await listOpportunities(db, baseFilters({ sortDir: "asc" }));
    expect(asc.rows.map((r) => r.analysis.id)).toEqual([1, 2]);
  });

  it("paginates results", async () => {
    const analyses = Array.from({ length: 30 }, (_, i) => analysis({ id: i + 1, market_id: `m${i + 1}`, opportunity_score: i }));
    const markets = Array.from({ length: 30 }, (_, i) => market({ id: `m${i + 1}` }));
    const db = createFakeDb({ latest_analyses: analyses, markets });

    const page1 = await listOpportunities(db, baseFilters({ page: 1 }));
    const page2 = await listOpportunities(db, baseFilters({ page: 2 }));

    expect(page1.rows).toHaveLength(25);
    expect(page2.rows).toHaveLength(5);
    expect(page1.count).toBe(30);
  });

  it("returns a null market when no matching market row exists", async () => {
    const db = createFakeDb({ latest_analyses: [analysis({ market_id: "missing" })], markets: [] });
    const result = await listOpportunities(db, baseFilters());
    expect(result.rows[0].market).toBeNull();
  });
});
