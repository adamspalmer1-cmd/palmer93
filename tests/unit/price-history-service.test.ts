import { describe, expect, it } from "vitest";
import {
  rangeStartDate,
  shouldInsertSnapshot,
  insertSnapshotIfChanged,
  getStoredPriceHistory,
} from "@/lib/services/price-history.service";
import { createFakeDb } from "../helpers/fake-supabase";

describe("rangeStartDate", () => {
  const now = new Date("2026-01-08T00:00:00.000Z");

  it("returns null for 'all' (full history)", () => {
    expect(rangeStartDate("all", now)).toBeNull();
  });

  it.each([
    ["1h", 1],
    ["6h", 6],
    ["24h", 24],
    ["7d", 24 * 7],
    ["30d", 24 * 30],
  ] as const)("computes the start of the '%s' window", (range, hours) => {
    const start = rangeStartDate(range, now);
    expect(start).not.toBeNull();
    expect(now.getTime() - start!.getTime()).toBe(hours * 60 * 60 * 1000);
  });
});

describe("shouldInsertSnapshot", () => {
  it("always inserts the first snapshot for a token", () => {
    expect(shouldInsertSnapshot(null, { price: 0.5, capturedAt: new Date() })).toBe(true);
  });

  it("skips an unchanged price observed shortly after the last one", () => {
    const latest = { price: 0.62, capturedAt: new Date("2026-01-01T00:00:00Z") };
    const next = { price: 0.62, capturedAt: new Date("2026-01-01T00:05:00Z") };
    expect(shouldInsertSnapshot(latest, next)).toBe(false);
  });

  it("inserts when the price has moved beyond the epsilon", () => {
    const latest = { price: 0.62, capturedAt: new Date("2026-01-01T00:00:00Z") };
    const next = { price: 0.65, capturedAt: new Date("2026-01-01T00:05:00Z") };
    expect(shouldInsertSnapshot(latest, next)).toBe(true);
  });

  it("inserts an unchanged price once the max gap has elapsed, to keep continuity", () => {
    const latest = { price: 0.62, capturedAt: new Date("2026-01-01T00:00:00Z") };
    const next = { price: 0.62, capturedAt: new Date("2026-01-01T02:00:00Z") };
    expect(shouldInsertSnapshot(latest, next, { maxGapMs: 60 * 60 * 1000 })).toBe(true);
  });

  it("treats a sub-epsilon price wiggle as unchanged", () => {
    const latest = { price: 0.62, capturedAt: new Date("2026-01-01T00:00:00Z") };
    const next = { price: 0.620001, capturedAt: new Date("2026-01-01T00:01:00Z") };
    expect(shouldInsertSnapshot(latest, next, { epsilon: 0.001 })).toBe(false);
  });
});

describe("insertSnapshotIfChanged", () => {
  it("inserts a snapshot when none exists yet", async () => {
    const db = createFakeDb({ price_snapshots: [] });
    const wrote = await insertSnapshotIfChanged(db, { marketId: "m1", tokenId: "t1", price: 0.5 });
    expect(wrote).toBe(true);
    expect(db.tables.price_snapshots).toHaveLength(1);
  });

  it("skips writing a duplicate of the latest unchanged price", async () => {
    const db = createFakeDb({
      price_snapshots: [
        { id: 1, market_id: "m1", token_id: "t1", price: 0.5, captured_at: new Date().toISOString() },
      ],
    });
    const wrote = await insertSnapshotIfChanged(db, { marketId: "m1", tokenId: "t1", price: 0.5 });
    expect(wrote).toBe(false);
    expect(db.tables.price_snapshots).toHaveLength(1);
  });

  it("writes a new row when the price has changed", async () => {
    const db = createFakeDb({
      price_snapshots: [
        { id: 1, market_id: "m1", token_id: "t1", price: 0.5, captured_at: new Date().toISOString() },
      ],
    });
    const wrote = await insertSnapshotIfChanged(db, { marketId: "m1", tokenId: "t1", price: 0.7 });
    expect(wrote).toBe(true);
    expect(db.tables.price_snapshots).toHaveLength(2);
  });

  it("keeps snapshots for different tokens on the same market independent", async () => {
    const db = createFakeDb({
      price_snapshots: [
        { id: 1, market_id: "m1", token_id: "yes", price: 0.5, captured_at: new Date().toISOString() },
      ],
    });
    const wrote = await insertSnapshotIfChanged(db, { marketId: "m1", tokenId: "no", price: 0.5 });
    expect(wrote).toBe(true);
  });
});

describe("getStoredPriceHistory", () => {
  it("filters to the requested market/token and orders ascending by time", async () => {
    const db = createFakeDb({
      price_snapshots: [
        { id: 1, market_id: "m1", token_id: "t1", price: 0.4, captured_at: "2026-01-02T00:00:00Z" },
        { id: 2, market_id: "m1", token_id: "t1", price: 0.3, captured_at: "2026-01-01T00:00:00Z" },
        { id: 3, market_id: "m2", token_id: "t1", price: 0.9, captured_at: "2026-01-01T00:00:00Z" },
      ],
    });
    const rows = await getStoredPriceHistory(db, "m1", "t1", "all");
    expect(rows.map((r) => r.id)).toEqual([2, 1]);
  });
});
