import { describe, expect, it } from "vitest";
import { normalizeEvent, normalizeMarket } from "@/lib/polymarket/normalize";
import type { GammaEvent, GammaMarket } from "@/lib/polymarket/types";

const baseEvent: GammaEvent = {
  id: "evt_1",
  slug: "us-election-2028",
  title: "2028 US Election",
  description: "Who will win?",
  image: null,
  startDate: "2026-01-01T00:00:00Z",
  endDate: "2028-11-05T00:00:00Z",
  active: true,
  closed: false,
  volume24hr: "1200.5",
  liquidity: 5000,
  tags: [{ id: "1", label: "Politics", slug: "politics" }],
  markets: [],
};

const baseMarket: GammaMarket = {
  id: "mkt_1",
  slug: "will-x-win",
  question: "Will X win?",
  description: null,
  outcomes: ["Yes", "No"],
  outcomePrices: ["0.62", "0.38"],
  clobTokenIds: ["token-yes", "token-no"],
  volume: "50000",
  volume24hr: "1200.5",
  liquidity: "5000",
  bestBid: "0.61",
  bestAsk: "0.63",
  lastTradePrice: "0.62",
  active: true,
  closed: false,
  endDate: "2028-11-05T00:00:00Z",
  startDate: null,
  image: null,
};

describe("normalizeEvent", () => {
  it("maps a Gamma event onto the events row shape", () => {
    const row = normalizeEvent(baseEvent);
    expect(row.id).toBe("evt_1");
    expect(row.slug).toBe("us-election-2028");
    expect(row.volume_24hr).toBeCloseTo(1200.5);
    expect(row.category_id).toBe("politics");
    expect(row.tags).toEqual(["politics"]);
  });

  it("defaults category to null when no known tag matches", () => {
    const row = normalizeEvent({ ...baseEvent, tags: [{ slug: "unknown-tag" }] });
    expect(row.category_id).toBeNull();
  });
});

describe("normalizeMarket", () => {
  it("decodes JSON-string-encoded outcome fields into structured data", () => {
    const row = normalizeMarket(baseMarket, baseEvent);
    expect(row.outcomes).toEqual([
      { name: "Yes", tokenId: "token-yes", price: 0.62 },
      { name: "No", tokenId: "token-no", price: 0.38 },
    ]);
    expect(row.clob_token_ids).toEqual(["token-yes", "token-no"]);
    expect(row.last_price).toBeCloseTo(0.62);
    expect(row.volume).toBeCloseTo(50000);
    expect(row.category_id).toBe("politics");
  });

  it("falls back to lastTradePrice when outcomePrices is empty", () => {
    const market = { ...baseMarket, outcomePrices: [] };
    const row = normalizeMarket(market, baseEvent);
    expect(row.last_price).toBeCloseTo(0.62);
  });
});
