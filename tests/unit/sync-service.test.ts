import { describe, expect, it, vi } from "vitest";
import { createFakeDb, tableRows, type Row } from "../helpers/fake-supabase";
import type { GammaEvent } from "@/lib/polymarket/types";

vi.mock("@/lib/polymarket/gamma", () => ({
  fetchActiveEvents: vi.fn(),
}));

vi.mock("@/lib/polymarket/clob", () => ({
  fetchOrderBookSummary: vi.fn(),
}));

const { fetchActiveEvents } = await import("@/lib/polymarket/gamma");
const { fetchOrderBookSummary } = await import("@/lib/polymarket/clob");
const { syncMarkets, refreshOrderBooks, archiveMarkets } = await import("@/lib/services/sync.service");

function makeEvent(id: string, marketQuestion: string): GammaEvent {
  return {
    id,
    slug: id,
    title: id,
    description: null,
    image: null,
    startDate: null,
    endDate: null,
    active: true,
    closed: false,
    volume24hr: 100,
    liquidity: 50,
    tags: [{ slug: "politics" }],
    markets: [
      {
        id: `${id}-m1`,
        slug: `${id}-m1`,
        question: marketQuestion,
        description: null,
        outcomes: ["Yes", "No"],
        outcomePrices: ["0.6", "0.4"],
        clobTokenIds: ["tok-yes", "tok-no"],
        volume: "1000",
        volume24hr: "100",
        liquidity: "50",
        bestBid: "0.59",
        bestAsk: "0.61",
        lastTradePrice: "0.6",
        active: true,
        closed: false,
        endDate: null,
        startDate: null,
        image: null,
      },
    ],
  };
}

describe("syncMarkets", () => {
  it("upserts every event/market on a clean run and marks the run successful", async () => {
    vi.mocked(fetchActiveEvents).mockResolvedValue([makeEvent("e1", "Will A happen?"), makeEvent("e2", "Will B happen?")]);
    const db = createFakeDb({});

    const result = await syncMarkets(db);

    expect(result.eventsUpserted).toBe(2);
    expect(result.marketsUpserted).toBe(2);
    expect(result.marketsFailed).toBe(0);
    expect(db.tables.events).toHaveLength(2);
    expect(db.tables.markets).toHaveLength(2);

    const run = tableRows(db, "ingestion_runs").find((r) => r.id === result.runId);
    expect(run?.status).toBe("success");
    expect(run?.job_name).toBe("sync-markets");
    expect(typeof run?.duration_ms).toBe("number");
  });

  it("isolates a single bad event's failure without losing the rest of the batch", async () => {
    vi.mocked(fetchActiveEvents).mockResolvedValue([
      makeEvent("good-event", "Will A happen?"),
      makeEvent("bad-event", "Will B happen?"),
    ]);
    const db = createFakeDb({});
    db.failUpsertWhen("events", (rows: Row[]) => rows.some((r) => r.id === "bad-event"));

    const result = await syncMarkets(db);

    expect(result.eventsUpserted).toBe(1);
    expect(result.marketsUpserted).toBe(1); // only good-event's market — bad-event's upsert never runs since its event upsert threw first
    expect(result.marketsFailed).toBe(1);
    expect(tableRows(db, "events").map((e) => e.id)).toEqual(["good-event"]);

    const run = tableRows(db, "ingestion_runs").find((r) => r.id === result.runId);
    expect(run?.status).toBe("partial");

    const failures = tableRows(db, "sync_failures");
    expect(failures).toHaveLength(1);
    expect(failures[0].event_id).toBe("bad-event");
    expect(failures[0].job_name).toBe("sync-markets");
    expect(failures[0].run_id).toBe(result.runId);
  });

  it("marks the run failed and rethrows when the upstream fetch itself fails", async () => {
    vi.mocked(fetchActiveEvents).mockRejectedValue(new Error("Gamma API unreachable"));
    const db = createFakeDb({});

    await expect(syncMarkets(db)).rejects.toThrow("Gamma API unreachable");

    const run = tableRows(db, "ingestion_runs")[0];
    expect(run.status).toBe("failed");
    expect(run.error).toContain("Gamma API unreachable");
  });

  it("stamps resolved_at once a market's outcome is observed", async () => {
    const event = makeEvent("e1", "Will A happen?");
    vi.mocked(fetchActiveEvents).mockResolvedValue([event]);
    const db = createFakeDb({});

    await syncMarkets(db);
    tableRows(db, "markets")[0].resolved_outcome = "Yes"; // simulate Polymarket resolving it
    await syncMarkets(db);

    expect(tableRows(db, "markets")[0].resolved_at).not.toBeNull();
  });
});

describe("refreshOrderBooks", () => {
  it("continues past one market's CLOB failure and still refreshes the rest", async () => {
    const db = createFakeDb({
      markets: [
        { id: "m1", active: true, closed: false, archived: false, clob_token_ids: ["tok-fail"], volume_24hr: 100 },
        { id: "m2", active: true, closed: false, archived: false, clob_token_ids: ["tok-ok"], volume_24hr: 50 },
      ],
    });

    vi.mocked(fetchOrderBookSummary).mockImplementation(async (tokenId: string) => {
      if (tokenId === "tok-fail") throw new Error("order book fetch failed");
      return { bestBid: 0.4, bestAsk: 0.42, midPrice: 0.41, spread: 0.02 };
    });

    const result = await refreshOrderBooks(db, 10);

    expect(result.refreshed).toBe(1);
    expect(result.failed).toBe(1);
    expect(tableRows(db, "markets").find((m) => m.id === "m2")?.mid_price).toBeCloseTo(0.41);
    expect(db.tables.sync_failures).toHaveLength(1);
    expect(tableRows(db, "sync_failures")[0].market_id).toBe("m1");

    const run = tableRows(db, "ingestion_runs").find((r) => r.id === result.runId);
    expect(run?.status).toBe("partial");
  });
});

describe("archiveMarkets", () => {
  it("records a successful run with the archived count", async () => {
    const oldEnough = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const db = createFakeDb({
      markets: [{ id: "m1", closed: true, archived: false, resolved_at: oldEnough, end_date: null }],
    });

    const result = await archiveMarkets(db, 3);

    expect(result.archived).toBe(1);
    const run = tableRows(db, "ingestion_runs").find((r) => r.id === result.runId);
    expect(run?.status).toBe("success");
    expect(run?.markets_archived).toBe(1);
  });
});
