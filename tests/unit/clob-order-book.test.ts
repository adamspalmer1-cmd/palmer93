import { describe, expect, it } from "vitest";
import { computeMidAndSpread } from "@/lib/polymarket/order-book-math";

describe("computeMidAndSpread", () => {
  it("computes the midpoint and spread from best bid/ask", () => {
    const { midPrice, spread } = computeMidAndSpread(0.6, 0.62);
    expect(midPrice).toBeCloseTo(0.61);
    expect(spread).toBeCloseTo(0.02);
  });

  it("returns nulls when either side of the book is empty", () => {
    expect(computeMidAndSpread(null, 0.62)).toEqual({ midPrice: null, spread: null });
    expect(computeMidAndSpread(0.6, null)).toEqual({ midPrice: null, spread: null });
    expect(computeMidAndSpread(null, null)).toEqual({ midPrice: null, spread: null });
  });
});
