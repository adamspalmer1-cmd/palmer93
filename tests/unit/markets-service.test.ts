import { describe, expect, it } from "vitest";
import {
  listMarkets,
  getMarketCounts,
  markResolvedMarkets,
  archiveStaleClosedMarkets,
  isPastArchiveGrace,
  getMarketsForOrderBookRefresh,
  upsertMarkets,
} from "@/lib/services/markets.service";
import { createFakeDb, tableRows } from "../helpers/fake-supabase";
import type { MarketFilters } from "@/lib/validation/market-filters";

function baseFilters(overrides: Partial<MarketFilters> = {}): MarketFilters {
  return { q: "", category: "", sort: "volume_24hr", status: "active", page: 1, ...overrides };
}

describe("listMarkets", () => {
  const seed = {
    markets: [
      { id: "m1", question: "Will A win?", active: true, closed: false, archived: false, category_id: "politics", volume_24hr: 300, end_date: null },
      { id: "m2", question: "Will B win?", active: true, closed: false, archived: false, category_id: "sports", volume_24hr: 500, end_date: null },
      { id: "m3", question: "Resolved market", active: false, closed: true, archived: false, category_id: "politics", volume_24hr: 100, end_date: null },
    ],
  };

  it("defaults to active, non-archived markets sorted by volume", async () => {
    const db = createFakeDb(seed);
    const result = await listMarkets(db, baseFilters());
    expect(result.markets.map((m) => m.id)).toEqual(["m2", "m1"]);
    expect(result.count).toBe(2);
  });

  it("filters by category", async () => {
    const db = createFakeDb(seed);
    const result = await listMarkets(db, baseFilters({ category: "sports" }));
    expect(result.markets.map((m) => m.id)).toEqual(["m2"]);
  });

  it("filters by search text against the question", async () => {
    const db = createFakeDb(seed);
    const result = await listMarkets(db, baseFilters({ q: "win" }));
    expect(result.markets.map((m) => m.id).sort()).toEqual(["m1", "m2"]);
  });

  it("includes closed markets only when status is 'closed'", async () => {
    const db = createFakeDb(seed);
    const result = await listMarkets(db, baseFilters({ status: "closed" }));
    expect(result.markets.map((m) => m.id)).toEqual(["m3"]);
  });
});

describe("getMarketCounts", () => {
  it("counts active, closed, and archived markets independently", async () => {
    const db = createFakeDb({
      markets: [
        { id: "m1", active: true, closed: false, archived: false },
        { id: "m2", active: true, closed: false, archived: false },
        { id: "m3", active: false, closed: true, archived: false },
        { id: "m4", active: false, closed: true, archived: true },
      ],
    });
    const counts = await getMarketCounts(db);
    expect(counts).toEqual({ active: 2, closed: 1, archived: 1 });
  });
});

describe("markResolvedMarkets", () => {
  it("stamps resolved_at only for markets with an outcome and no existing timestamp", async () => {
    const db = createFakeDb({
      markets: [
        { id: "m1", resolved_outcome: "Yes", resolved_at: null },
        { id: "m2", resolved_outcome: null, resolved_at: null },
        { id: "m3", resolved_outcome: "No", resolved_at: "2026-01-01T00:00:00Z" },
      ],
    });
    const count = await markResolvedMarkets(db);
    expect(count).toBe(1);
    const m1 = tableRows(db, "markets").find((m) => m.id === "m1");
    const m3 = tableRows(db, "markets").find((m) => m.id === "m3");
    expect(m1?.resolved_at).not.toBeNull();
    expect(m3?.resolved_at).toBe("2026-01-01T00:00:00Z"); // untouched, not overwritten
  });
});

describe("isPastArchiveGrace", () => {
  const cutoff = new Date("2026-01-10T00:00:00Z");

  it("uses resolved_at when present", () => {
    expect(isPastArchiveGrace({ resolved_at: "2026-01-01T00:00:00Z", end_date: null }, cutoff)).toBe(true);
    expect(isPastArchiveGrace({ resolved_at: "2026-01-15T00:00:00Z", end_date: null }, cutoff)).toBe(false);
  });

  it("falls back to end_date when resolved_at is null", () => {
    expect(isPastArchiveGrace({ resolved_at: null, end_date: "2026-01-01T00:00:00Z" }, cutoff)).toBe(true);
  });

  it("is not past grace when neither date is set", () => {
    expect(isPastArchiveGrace({ resolved_at: null, end_date: null }, cutoff)).toBe(false);
  });
});

describe("archiveStaleClosedMarkets", () => {
  it("archives closed markets past the grace period and leaves others untouched", async () => {
    const oldEnough = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const tooRecent = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    const db = createFakeDb({
      markets: [
        { id: "m1", closed: true, archived: false, resolved_at: oldEnough, end_date: null },
        { id: "m2", closed: true, archived: false, resolved_at: tooRecent, end_date: null },
        { id: "m3", closed: false, archived: false, resolved_at: oldEnough, end_date: null },
      ],
    });
    const archivedCount = await archiveStaleClosedMarkets(db, 3);
    expect(archivedCount).toBe(1);
    expect(tableRows(db, "markets").find((m) => m.id === "m1")?.archived).toBe(true);
    expect(tableRows(db, "markets").find((m) => m.id === "m2")?.archived).toBe(false);
    expect(tableRows(db, "markets").find((m) => m.id === "m3")?.archived).toBe(false);
  });

  it("is a no-op when nothing qualifies", async () => {
    const db = createFakeDb({ markets: [{ id: "m1", closed: false, archived: false }] });
    expect(await archiveStaleClosedMarkets(db, 3)).toBe(0);
  });
});

describe("getMarketsForOrderBookRefresh", () => {
  it("excludes markets with no clob token ids", async () => {
    const db = createFakeDb({
      markets: [
        { id: "m1", active: true, closed: false, archived: false, clob_token_ids: ["t1"], volume_24hr: 10 },
        { id: "m2", active: true, closed: false, archived: false, clob_token_ids: [], volume_24hr: 20 },
      ],
    });
    const markets = await getMarketsForOrderBookRefresh(db, 10);
    expect(markets.map((m) => m.id)).toEqual(["m1"]);
  });
});

describe("upsertMarkets", () => {
  it("is a no-op for an empty array (no accidental full-table write)", async () => {
    const db = createFakeDb({ markets: [] });
    expect(await upsertMarkets(db, [])).toBe(0);
    expect(db.tables.markets).toHaveLength(0);
  });

  it("upserts new rows keyed by id", async () => {
    const db = createFakeDb({ markets: [] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = [{ id: "m1", slug: "m1", question: "Q1" }];
    const count = await upsertMarkets(db, rows);
    expect(count).toBe(1);
    expect(db.tables.markets).toHaveLength(1);
  });
});
