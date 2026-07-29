import { describe, expect, it } from "vitest";
import { parseScannerFilters } from "@/lib/validation/scanner-filters";

describe("parseScannerFilters", () => {
  it("defaults to opportunity_score desc with no filters", () => {
    const filters = parseScannerFilters({});
    expect(filters.sort).toBe("opportunity_score");
    expect(filters.sortDir).toBe("desc");
    expect(filters.page).toBe(1);
    expect(filters.recommendationStatus).toBeUndefined();
  });

  it("applies a named view's filters", () => {
    const filters = parseScannerFilters({ view: "top-opportunities" });
    expect(filters.recommendationStatus).toBe("POSSIBLE EDGE");
    expect(filters.sort).toBe("opportunity_score");
  });

  it("applies the recently-analyzed view's sort", () => {
    const filters = parseScannerFilters({ view: "recently-analyzed" });
    expect(filters.sort).toBe("analyzed_at");
    expect(filters.recommendationStatus).toBeUndefined();
  });

  it("lets explicit query params override a view's defaults", () => {
    const filters = parseScannerFilters({ view: "top-opportunities", status: "WATCH" });
    expect(filters.recommendationStatus).toBe("WATCH");
  });

  it("parses category, risk, minScore, and page from raw params", () => {
    const filters = parseScannerFilters({ category: "politics", risk: "HIGH", minScore: "40", page: "2" });
    expect(filters.category).toBe("politics");
    expect(filters.resolutionRiskLevel).toBe("HIGH");
    expect(filters.minOpportunityScore).toBe(40);
    expect(filters.page).toBe(2);
  });

  it("falls back to defaults for an invalid status value", () => {
    const filters = parseScannerFilters({ status: "NOT_A_STATUS" });
    expect(filters.recommendationStatus).toBeUndefined();
  });

  it("flattens array-valued search params", () => {
    const filters = parseScannerFilters({ category: ["politics", "sports"] });
    expect(filters.category).toBe("politics");
  });
});
