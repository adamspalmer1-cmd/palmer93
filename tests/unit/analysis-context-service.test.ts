import { describe, expect, it } from "vitest";
import {
  buildAnalysisModelInput,
  buildDataFreshnessWarnings,
  resolvePrimaryOutcome,
} from "@/lib/services/analysis-context.service";
import { createFakeDb } from "../helpers/fake-supabase";

function market(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    event_id: "e1",
    question: "Will X happen?",
    description: "Resolves YES if X happens.",
    outcomes: [
      { name: "Yes", tokenId: "tok-yes", price: 0.4 },
      { name: "No", tokenId: "tok-no", price: 0.6 },
    ],
    category_id: "politics",
    mid_price: 0.4,
    last_price: 0.39,
    best_bid: 0.39,
    best_ask: 0.41,
    spread: 0.02,
    liquidity: 20_000,
    volume_24hr: 5_000,
    end_date: "2026-12-31T00:00:00Z",
    last_synced_at: "2026-07-29T00:55:00Z",
    ...overrides,
  };
}

const NOW = new Date("2026-07-29T01:00:00Z");

describe("resolvePrimaryOutcome", () => {
  it("returns the first outcome's name, tokenId, and price", () => {
    const outcome = resolvePrimaryOutcome(market() as never);
    expect(outcome).toEqual({ name: "Yes", tokenId: "tok-yes", price: 0.4 });
  });

  it("returns null when outcomes is empty or malformed", () => {
    expect(resolvePrimaryOutcome(market({ outcomes: [] }) as never)).toBeNull();
    expect(resolvePrimaryOutcome(market({ outcomes: null }) as never)).toBeNull();
  });
});

describe("buildDataFreshnessWarnings", () => {
  it("warns on stale sync, missing order book, no history, and non-positive liquidity", () => {
    const warnings = buildDataFreshnessWarnings(
      market({ last_synced_at: "2026-07-29T00:00:00Z", best_bid: null, best_ask: null, liquidity: 0 }) as never,
      0,
      NOW,
    );
    expect(warnings.some((w) => w.includes("synced"))).toBe(true);
    expect(warnings.some((w) => w.includes("order book"))).toBe(true);
    expect(warnings.some((w) => w.includes("historical price"))).toBe(true);
    expect(warnings.some((w) => w.includes("liquidity"))).toBe(true);
  });

  it("has no warnings for fresh, complete data", () => {
    const warnings = buildDataFreshnessWarnings(market() as never, 5, NOW);
    expect(warnings).toEqual([]);
  });

  it("warns when never synced", () => {
    const warnings = buildDataFreshnessWarnings(market({ last_synced_at: null }) as never, 5, NOW);
    expect(warnings.some((w) => w.includes("never been synced"))).toBe(true);
  });
});

describe("buildAnalysisModelInput", () => {
  it("assembles pricing, description, and analyzedOutcome from the market row", async () => {
    const db = createFakeDb({ markets: [market()], price_snapshots: [], analyses: [] });
    const input = await buildAnalysisModelInput(db, market() as never, { now: NOW });

    expect(input.market.analyzedOutcome).toBe("Yes");
    expect(input.market.description).toBe("Resolves YES if X happens.");
    expect(input.pricing.marketProbability).toBe(0.4);
    expect(input.pricing.spread).toBe(0.02);
    expect(input.sourceDataAsOf).toBe(NOW.toISOString());
  });

  it("falls back to computing spread from best bid/ask when spread is null", async () => {
    const db = createFakeDb({ markets: [], price_snapshots: [], analyses: [] });
    const input = await buildAnalysisModelInput(db, market({ spread: null, best_bid: 0.3, best_ask: 0.35 }) as never, {
      now: NOW,
    });
    expect(input.pricing.spread).toBeCloseTo(0.05);
  });

  it("falls back to last_price then outcome price when mid_price is unavailable", async () => {
    const db = createFakeDb({ markets: [], price_snapshots: [], analyses: [] });
    const input = await buildAnalysisModelInput(db, market({ mid_price: null, last_price: 0.42 }) as never, { now: NOW });
    expect(input.pricing.marketProbability).toBe(0.42);
  });

  it("throws when the market has no usable price data", async () => {
    const db = createFakeDb({ markets: [], price_snapshots: [], analyses: [] });
    const bad = market({ mid_price: null, last_price: null, outcomes: [{ name: "Yes", tokenId: "tok-yes", price: null }] });
    await expect(buildAnalysisModelInput(db, bad as never, { now: NOW })).rejects.toThrow(/no usable price data/);
  });

  it("throws when the market has no outcomes", async () => {
    const db = createFakeDb({ markets: [], price_snapshots: [], analyses: [] });
    await expect(buildAnalysisModelInput(db, market({ outcomes: [] }) as never, { now: NOW })).rejects.toThrow(/no parseable outcomes/);
  });

  it("includes stored price history for the resolved outcome's token", async () => {
    const db = createFakeDb({
      markets: [],
      price_snapshots: [
        { market_id: "m1", token_id: "tok-yes", price: 0.35, captured_at: "2026-07-20T00:00:00Z" },
        { market_id: "m1", token_id: "tok-no", price: 0.65, captured_at: "2026-07-20T00:00:00Z" },
      ],
      analyses: [],
    });
    const input = await buildAnalysisModelInput(db, market() as never, { now: NOW });
    expect(input.priceHistory).toEqual([{ price: 0.35, capturedAt: "2026-07-20T00:00:00Z" }]);
  });

  it("includes related markets from the same event, excluding itself", async () => {
    const db = createFakeDb({
      markets: [
        market({ id: "m2", event_id: "e1", question: "Related?", active: true, mid_price: 0.7, volume_24hr: 10 }),
        market({ id: "m1", event_id: "e1", active: true }),
        market({ id: "m3", event_id: "other-event", question: "Unrelated?", active: true }),
      ],
      price_snapshots: [],
      analyses: [],
    });
    const input = await buildAnalysisModelInput(db, market() as never, { now: NOW });
    expect(input.relatedMarkets).toEqual([{ question: "Related?", probability: 0.7 }]);
  });

  it("includes previous analyses of this market, most recent first, limited", async () => {
    const db = createFakeDb({
      markets: [],
      price_snapshots: [],
      analyses: [
        {
          market_id: "m1",
          analyzed_at: "2026-07-27T00:00:00Z",
          fair_probability_base: 0.3,
          recommendation_status: "PASS",
          opportunity_score: 10,
        },
        {
          market_id: "m1",
          analyzed_at: "2026-07-28T00:00:00Z",
          fair_probability_base: 0.35,
          recommendation_status: "WATCH",
          opportunity_score: 20,
        },
      ],
    });
    const input = await buildAnalysisModelInput(db, market() as never, { now: NOW, maxPreviousAnalyses: 1 });
    expect(input.previousAnalyses).toEqual([
      { analyzedAt: "2026-07-28T00:00:00Z", fairProbabilityBase: 0.35, recommendationStatus: "WATCH", opportunityScore: 20 },
    ]);
  });
});
