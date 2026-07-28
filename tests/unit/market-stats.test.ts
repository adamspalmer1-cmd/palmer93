import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { bucketByUtcDay, standardDeviation, getLargestMovers, getSpreadStats } from "@/lib/services/market-stats.service";
import { createFakeDb } from "../helpers/fake-supabase";

describe("bucketByUtcDay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T18:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("buckets timestamps into their UTC calendar day", () => {
    const buckets = bucketByUtcDay(
      ["2026-01-01T23:59:00Z", "2026-01-01T00:00:01Z", "2026-01-02T12:00:00Z"],
      3,
    );
    const byDate = Object.fromEntries(buckets.map((b) => [b.date, b.count]));
    expect(byDate["2026-01-01"]).toBe(2);
    expect(byDate["2026-01-02"]).toBe(1);
  });

  it("includes zero-count days within the window", () => {
    const buckets = bucketByUtcDay([], 5);
    expect(buckets).toHaveLength(5);
    expect(buckets.every((b) => b.count === 0)).toBe(true);
  });

  it("ignores timestamps outside the requested window", () => {
    const farPast = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const buckets = bucketByUtcDay([farPast], 3);
    expect(buckets.reduce((sum, b) => sum + b.count, 0)).toBe(0);
  });
});

describe("standardDeviation", () => {
  it("returns 0 for fewer than two samples", () => {
    expect(standardDeviation([])).toBe(0);
    expect(standardDeviation([0.5])).toBe(0);
  });

  it("returns 0 for a constant series", () => {
    expect(standardDeviation([0.5, 0.5, 0.5])).toBe(0);
  });

  it("computes the sample standard deviation", () => {
    // mean = 2, variance (n-1) = ((1)^2+(0)^2+(1)^2)/2 = 1, stddev = 1
    expect(standardDeviation([1, 2, 3])).toBeCloseTo(1);
  });
});

describe("getLargestMovers", () => {
  it("ranks markets by absolute price change regardless of direction", async () => {
    const db = createFakeDb({
      markets: [
        { id: "a", question: "A", active: true, archived: false, price_change_24h: 0.05 },
        { id: "b", question: "B", active: true, archived: false, price_change_24h: -0.3 },
        { id: "c", question: "C", active: true, archived: false, price_change_24h: 0.12 },
      ],
    });
    const movers = await getLargestMovers(db, 2);
    expect(movers.map((m) => m.id)).toEqual(["b", "c"]);
  });
});

describe("getSpreadStats", () => {
  it("computes average/min/max over active markets with a known spread", async () => {
    const db = createFakeDb({
      markets: [
        { id: "a", active: true, archived: false, spread: 0.02 },
        { id: "b", active: true, archived: false, spread: 0.04 },
        { id: "c", active: true, archived: false, spread: null },
      ],
    });
    const stats = await getSpreadStats(db);
    expect(stats.sampleSize).toBe(2);
    expect(stats.average).toBeCloseTo(0.03);
    expect(stats.min).toBeCloseTo(0.02);
    expect(stats.max).toBeCloseTo(0.04);
  });

  it("returns nulls when no market has a recorded spread", async () => {
    const db = createFakeDb({ markets: [{ id: "a", active: true, archived: false, spread: null }] });
    const stats = await getSpreadStats(db);
    expect(stats).toEqual({ average: null, min: null, max: null, sampleSize: 0 });
  });
});
