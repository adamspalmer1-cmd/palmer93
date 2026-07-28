import { describe, expect, it } from "vitest";
import {
  checkDuplicateMarkets,
  checkMissingPrices,
  checkNegativeLiquidity,
  checkInvalidProbabilities,
  checkMissingCategories,
  checkBrokenEventLinks,
  checkMarketsWithoutHistory,
  checkStaleData,
  isStale,
  runDataQualityChecks,
} from "@/lib/services/data-quality.service";
import { createFakeDb } from "../helpers/fake-supabase";

describe("isStale", () => {
  const cutoff = new Date("2026-01-01T12:00:00Z");

  it("treats a null last-synced timestamp as stale", () => {
    expect(isStale(null, cutoff)).toBe(true);
  });

  it("treats a timestamp before the cutoff as stale", () => {
    expect(isStale("2026-01-01T11:00:00Z", cutoff)).toBe(true);
  });

  it("treats a timestamp at or after the cutoff as fresh", () => {
    expect(isStale("2026-01-01T13:00:00Z", cutoff)).toBe(false);
  });
});

describe("checkDuplicateMarkets", () => {
  it("flags a second market with the same question in the same event", async () => {
    const db = createFakeDb({
      markets: [
        { id: "m1", question: "Will X happen?", event_id: "e1", archived: false },
        { id: "m2", question: "Will X happen?", event_id: "e1", archived: false },
        { id: "m3", question: "Will X happen?", event_id: "e2", archived: false },
      ],
    });
    const warnings = await checkDuplicateMarkets(db);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].marketId).toBe("m2");
  });
});

describe("checkMissingPrices", () => {
  it("flags active markets with no last_price", async () => {
    const db = createFakeDb({
      markets: [
        { id: "m1", active: true, archived: false, last_price: null },
        { id: "m2", active: true, archived: false, last_price: 0.4 },
      ],
    });
    const warnings = await checkMissingPrices(db);
    expect(warnings.map((w) => w.marketId)).toEqual(["m1"]);
  });
});

describe("checkNegativeLiquidity", () => {
  it("flags markets with negative liquidity", async () => {
    const db = createFakeDb({
      markets: [
        { id: "m1", liquidity: -5 },
        { id: "m2", liquidity: 100 },
      ],
    });
    const warnings = await checkNegativeLiquidity(db);
    expect(warnings.map((w) => w.marketId)).toEqual(["m1"]);
  });
});

describe("checkInvalidProbabilities", () => {
  it("flags last_price outside [0, 1] in either direction", async () => {
    const db = createFakeDb({
      markets: [
        { id: "m1", last_price: -0.1 },
        { id: "m2", last_price: 1.5 },
        { id: "m3", last_price: 0.5 },
      ],
    });
    const warnings = await checkInvalidProbabilities(db);
    expect(warnings.map((w) => w.marketId).sort()).toEqual(["m1", "m2"]);
  });
});

describe("checkMissingCategories", () => {
  it("flags active markets without a category", async () => {
    const db = createFakeDb({
      markets: [
        { id: "m1", active: true, archived: false, category_id: null },
        { id: "m2", active: true, archived: false, category_id: "politics" },
      ],
    });
    const warnings = await checkMissingCategories(db);
    expect(warnings.map((w) => w.marketId)).toEqual(["m1"]);
  });
});

describe("checkBrokenEventLinks", () => {
  it("flags a market whose event_id has no matching event row", async () => {
    const db = createFakeDb({
      markets: [
        { id: "m1", event_id: "e1", archived: false },
        { id: "m2", event_id: "missing", archived: false },
      ],
      events: [{ id: "e1" }],
    });
    const warnings = await checkBrokenEventLinks(db);
    expect(warnings.map((w) => w.marketId)).toEqual(["m2"]);
  });

  it("reports nothing when every event_id resolves", async () => {
    const db = createFakeDb({
      markets: [{ id: "m1", event_id: "e1", archived: false }],
      events: [{ id: "e1" }],
    });
    expect(await checkBrokenEventLinks(db)).toEqual([]);
  });
});

describe("checkMarketsWithoutHistory", () => {
  it("flags active markets with zero price_snapshots rows", async () => {
    const db = createFakeDb({
      markets: [
        { id: "m1", active: true, archived: false },
        { id: "m2", active: true, archived: false },
      ],
      price_snapshots: [{ id: 1, market_id: "m1" }],
    });
    const warnings = await checkMarketsWithoutHistory(db);
    expect(warnings.map((w) => w.marketId)).toEqual(["m2"]);
  });
});

describe("checkStaleData", () => {
  it("flags active markets whose last_synced_at is older than the threshold", async () => {
    const fresh = new Date().toISOString();
    const stale = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const db = createFakeDb({
      markets: [
        { id: "m1", active: true, archived: false, last_synced_at: fresh },
        { id: "m2", active: true, archived: false, last_synced_at: stale },
        { id: "m3", active: true, archived: false, last_synced_at: null },
      ],
    });
    const warnings = await checkStaleData(db, 30);
    expect(warnings.map((w) => w.marketId).sort()).toEqual(["m2", "m3"]);
  });
});

describe("runDataQualityChecks", () => {
  it("aggregates every check into counts by warning type", async () => {
    const db = createFakeDb({
      markets: [{ id: "m1", active: true, archived: false, last_price: null, category_id: null }],
    });
    const report = await runDataQualityChecks(db);
    expect(report.countsByType.missing_price).toBe(1);
    expect(report.countsByType.missing_category).toBe(1);
    expect(report.warnings.length).toBeGreaterThanOrEqual(2);
  });
});
