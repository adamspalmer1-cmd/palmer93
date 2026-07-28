import { describe, expect, it } from "vitest";
import { parseMarketFilters } from "@/lib/validation/market-filters";

describe("parseMarketFilters", () => {
  it("applies defaults when no params are given", () => {
    const filters = parseMarketFilters({});
    expect(filters).toEqual({
      q: "",
      category: "",
      sort: "volume_24hr",
      status: "active",
      page: 1,
    });
  });

  it("parses valid params, taking the first value of array params", () => {
    const filters = parseMarketFilters({
      q: "election",
      category: ["politics", "crypto"],
      sort: "liquidity",
      status: "closed",
      page: "3",
    });
    expect(filters).toMatchObject({
      q: "election",
      category: "politics",
      sort: "liquidity",
      status: "closed",
      page: 3,
    });
  });

  it("falls back to defaults for invalid enum values", () => {
    const filters = parseMarketFilters({ sort: "not-a-real-sort", status: "bogus" });
    expect(filters.sort).toBe("volume_24hr");
    expect(filters.status).toBe("active");
  });
});
