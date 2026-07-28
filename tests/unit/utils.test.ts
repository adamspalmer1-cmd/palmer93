import { describe, expect, it } from "vitest";
import {
  formatProbability,
  formatCompactUsd,
  formatSignedPercent,
  timeUntil,
} from "@/lib/utils";

describe("formatProbability", () => {
  it("formats a fraction as a rounded percentage", () => {
    expect(formatProbability(0.617)).toBe("62%");
  });

  it("returns an em dash for null/undefined/NaN", () => {
    expect(formatProbability(null)).toBe("—");
    expect(formatProbability(undefined)).toBe("—");
    expect(formatProbability(Number.NaN)).toBe("—");
  });
});

describe("formatCompactUsd", () => {
  it("formats large numbers compactly", () => {
    expect(formatCompactUsd(2_100_000)).toBe("$2.1M");
  });

  it("returns an em dash for missing values", () => {
    expect(formatCompactUsd(null)).toBe("—");
  });
});

describe("formatSignedPercent", () => {
  it("prefixes positive changes with a plus sign", () => {
    expect(formatSignedPercent(0.032)).toBe("+3.2%");
  });

  it("leaves negative changes with their own minus sign", () => {
    expect(formatSignedPercent(-0.018)).toBe("-1.8%");
  });
});

describe("timeUntil", () => {
  it("returns Closed for dates in the past", () => {
    expect(timeUntil("2000-01-01T00:00:00Z")).toBe("Closed");
  });

  it("returns an em dash when no date is given", () => {
    expect(timeUntil(null)).toBe("—");
  });

  it("returns a day count for dates in the future", () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + 60_000).toISOString();
    expect(timeUntil(future)).toBe("3d");
  });
});
