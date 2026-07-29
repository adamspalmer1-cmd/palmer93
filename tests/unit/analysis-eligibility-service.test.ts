import { describe, expect, it } from "vitest";
import { selectEligibleMarkets } from "@/lib/services/analysis-eligibility.service";
import { DEFAULT_COST_CONTROLS } from "@/lib/ai/cost-controls";
import { createFakeDb } from "../helpers/fake-supabase";

function market(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    question: "Will X happen?",
    active: true,
    closed: false,
    archived: false,
    resolved_outcome: null,
    liquidity: 10_000,
    spread: 0.02,
    category_id: "politics",
    end_date: null,
    last_synced_at: "2026-07-29T00:00:00Z",
    volume_24hr: 1000,
    ...overrides,
  };
}

const NOW = new Date("2026-07-29T01:00:00Z");

describe("selectEligibleMarkets", () => {
  it("selects active, unresolved markets passing cost thresholds", async () => {
    const db = createFakeDb({ markets: [market()] });
    const result = await selectEligibleMarkets(db, DEFAULT_COST_CONTROLS, { now: NOW });
    expect(result.eligible.map((m) => m.id)).toEqual(["m1"]);
    expect(result.skipped).toEqual([]);
  });

  it("excludes closed, archived, and resolved markets from the scan entirely", async () => {
    const db = createFakeDb({
      markets: [
        market({ id: "closed", closed: true }),
        market({ id: "archived", archived: true }),
        market({ id: "resolved", resolved_outcome: "Yes" }),
        market({ id: "ok" }),
      ],
    });
    const result = await selectEligibleMarkets(db, DEFAULT_COST_CONTROLS, { now: NOW });
    expect(result.eligible.map((m) => m.id)).toEqual(["ok"]);
  });

  it("skips markets below the minimum liquidity with a reason", async () => {
    const db = createFakeDb({ markets: [market({ liquidity: 1 })] });
    const result = await selectEligibleMarkets(db, DEFAULT_COST_CONTROLS, { now: NOW });
    expect(result.eligible).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reasons.some((r) => r.includes("liquidity"))).toBe(true);
  });

  it("skips markets with a spread at or above the maximum", async () => {
    const db = createFakeDb({ markets: [market({ spread: DEFAULT_COST_CONTROLS.maxSpreadDecimal })] });
    const result = await selectEligibleMarkets(db, DEFAULT_COST_CONTROLS, { now: NOW });
    expect(result.eligible).toEqual([]);
  });

  it("filters by category when requested", async () => {
    const db = createFakeDb({ markets: [market({ id: "a", category_id: "politics" }), market({ id: "b", category_id: "sports" })] });
    const result = await selectEligibleMarkets(db, DEFAULT_COST_CONTROLS, { category: "sports", now: NOW });
    expect(result.eligible.map((m) => m.id)).toEqual(["b"]);
    expect(result.skipped.map((s) => s.market.id)).toEqual(["a"]);
  });

  it("filters by max hours to resolution, excluding markets with no end_date", async () => {
    const db = createFakeDb({
      markets: [
        market({ id: "soon", end_date: "2026-07-29T06:00:00Z" }),
        market({ id: "far", end_date: "2027-01-01T00:00:00Z" }),
        market({ id: "unknown", end_date: null }),
      ],
    });
    const result = await selectEligibleMarkets(db, DEFAULT_COST_CONTROLS, { maxHoursToResolution: 24, now: NOW });
    expect(result.eligible.map((m) => m.id)).toEqual(["soon"]);
  });

  it("filters by min hours to resolution to exclude markets resolving imminently", async () => {
    const db = createFakeDb({
      markets: [
        market({ id: "imminent", end_date: "2026-07-29T01:30:00Z" }),
        market({ id: "later", end_date: "2026-07-30T00:00:00Z" }),
      ],
    });
    const result = await selectEligibleMarkets(db, DEFAULT_COST_CONTROLS, { minHoursToResolution: 2, now: NOW });
    expect(result.eligible.map((m) => m.id)).toEqual(["later"]);
  });

  it("filters by max hours since sync, excluding never-synced markets", async () => {
    const db = createFakeDb({
      markets: [
        market({ id: "fresh", last_synced_at: "2026-07-29T00:50:00Z" }),
        market({ id: "stale", last_synced_at: "2026-07-01T00:00:00Z" }),
        market({ id: "never", last_synced_at: null }),
      ],
    });
    const result = await selectEligibleMarkets(db, DEFAULT_COST_CONTROLS, { maxHoursSinceSync: 1, now: NOW });
    expect(result.eligible.map((m) => m.id)).toEqual(["fresh"]);
  });

  it("applies category-specific cost overrides from the config", async () => {
    const config = { ...DEFAULT_COST_CONTROLS, categoryOverrides: { politics: { minLiquidityUsd: 50_000 } } };
    const db = createFakeDb({ markets: [market({ liquidity: 10_000 })] });
    const result = await selectEligibleMarkets(db, config, { now: NOW });
    expect(result.eligible).toEqual([]);
  });
});
