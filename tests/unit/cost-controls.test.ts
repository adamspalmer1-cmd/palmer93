import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkCostEligibility,
  checkDailyBudget,
  DEFAULT_COST_CONTROLS,
  estimateCostUsd,
  exceedsTokenBudget,
  loadCostControlsConfig,
  resolveCategoryConfig,
  type CostControlsConfig,
} from "@/lib/ai/cost-controls";

describe("loadCostControlsConfig", () => {
  const envKeys = [
    "AI_MAX_MARKETS_PER_RUN",
    "AI_MAX_DAILY_SPEND_USD",
    "AI_MAX_TOKENS_PER_ANALYSIS",
    "AI_MIN_LIQUIDITY_USD",
    "AI_MAX_SPREAD_DECIMAL",
    "AI_REANALYSIS_COOLDOWN_HOURS",
    "ANTHROPIC_INPUT_COST_PER_MTOK",
    "ANTHROPIC_OUTPUT_COST_PER_MTOK",
  ];
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of envKeys) original[key] = process.env[key];
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  it("falls back to defaults when no env vars are set", () => {
    for (const key of envKeys) delete process.env[key];
    const config = loadCostControlsConfig();
    expect(config.maxMarketsPerRun).toBe(DEFAULT_COST_CONTROLS.maxMarketsPerRun);
    expect(config.maxDailySpendUsd).toBe(DEFAULT_COST_CONTROLS.maxDailySpendUsd);
  });

  it("reads overrides from environment variables", () => {
    process.env.AI_MAX_MARKETS_PER_RUN = "10";
    process.env.AI_MAX_DAILY_SPEND_USD = "5.5";
    const config = loadCostControlsConfig();
    expect(config.maxMarketsPerRun).toBe(10);
    expect(config.maxDailySpendUsd).toBe(5.5);
  });

  it("ignores malformed env values and falls back to defaults", () => {
    process.env.AI_MAX_MARKETS_PER_RUN = "not-a-number";
    const config = loadCostControlsConfig();
    expect(config.maxMarketsPerRun).toBe(DEFAULT_COST_CONTROLS.maxMarketsPerRun);
  });

  it("lets explicit overrides win over environment variables", () => {
    process.env.AI_MAX_MARKETS_PER_RUN = "10";
    const config = loadCostControlsConfig({ maxMarketsPerRun: 3 });
    expect(config.maxMarketsPerRun).toBe(3);
  });
});

describe("resolveCategoryConfig", () => {
  const base: CostControlsConfig = {
    ...DEFAULT_COST_CONTROLS,
    categoryOverrides: {
      politics: { minLiquidityUsd: 5_000 },
    },
  };

  it("returns the base config for an uncategorized market", () => {
    expect(resolveCategoryConfig(base, null).minLiquidityUsd).toBe(base.minLiquidityUsd);
  });

  it("returns the base config for a category with no override", () => {
    expect(resolveCategoryConfig(base, "sports").minLiquidityUsd).toBe(base.minLiquidityUsd);
  });

  it("merges a category override on top of the base config", () => {
    const resolved = resolveCategoryConfig(base, "politics");
    expect(resolved.minLiquidityUsd).toBe(5_000);
    expect(resolved.maxSpreadDecimal).toBe(base.maxSpreadDecimal);
  });
});

describe("estimateCostUsd", () => {
  it("computes cost from input/output token pricing", () => {
    const cost = estimateCostUsd(1_000_000, 1_000_000, { inputPerMillionTokensUsd: 15, outputPerMillionTokensUsd: 75 });
    expect(cost).toBeCloseTo(90);
  });

  it("scales linearly with token count", () => {
    const pricing = { inputPerMillionTokensUsd: 15, outputPerMillionTokensUsd: 75 };
    expect(estimateCostUsd(500_000, 0, pricing)).toBeCloseTo(7.5);
  });
});

describe("checkCostEligibility", () => {
  it("is eligible when liquidity and spread both pass", () => {
    const result = checkCostEligibility({ liquidity: 5_000, spread: 0.02, category: null }, DEFAULT_COST_CONTROLS);
    expect(result.eligible).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("is ineligible when liquidity is below the minimum", () => {
    const result = checkCostEligibility({ liquidity: 10, spread: 0.02, category: null }, DEFAULT_COST_CONTROLS);
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes("liquidity"))).toBe(true);
  });

  it("is ineligible when spread is at or above the maximum", () => {
    const result = checkCostEligibility(
      { liquidity: 5_000, spread: DEFAULT_COST_CONTROLS.maxSpreadDecimal, category: null },
      DEFAULT_COST_CONTROLS,
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes("spread"))).toBe(true);
  });

  it("is ineligible when spread is unknown", () => {
    const result = checkCostEligibility({ liquidity: 5_000, spread: null, category: null }, DEFAULT_COST_CONTROLS);
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes("unknown"))).toBe(true);
  });

  it("applies a category-specific minimum liquidity", () => {
    const config: CostControlsConfig = {
      ...DEFAULT_COST_CONTROLS,
      categoryOverrides: { politics: { minLiquidityUsd: 10_000 } },
    };
    const result = checkCostEligibility({ liquidity: 5_000, spread: 0.02, category: "politics" }, config);
    expect(result.eligible).toBe(false);
  });
});

describe("exceedsTokenBudget", () => {
  it("returns false under the cap", () => {
    expect(exceedsTokenBudget(1_000, 1_000, DEFAULT_COST_CONTROLS)).toBe(false);
  });

  it("returns true over the cap", () => {
    expect(exceedsTokenBudget(90_000, 20_000, DEFAULT_COST_CONTROLS)).toBe(true);
  });
});

describe("checkDailyBudget", () => {
  it("reports remaining budget under the cap", () => {
    const status = checkDailyBudget(10, DEFAULT_COST_CONTROLS);
    expect(status.exhausted).toBe(false);
    expect(status.remainingUsd).toBeCloseTo(DEFAULT_COST_CONTROLS.maxDailySpendUsd - 10);
  });

  it("reports exhausted at or over the cap", () => {
    const status = checkDailyBudget(DEFAULT_COST_CONTROLS.maxDailySpendUsd, DEFAULT_COST_CONTROLS);
    expect(status.exhausted).toBe(true);
    expect(status.remainingUsd).toBe(0);
  });

  it("never reports negative remaining budget", () => {
    const status = checkDailyBudget(DEFAULT_COST_CONTROLS.maxDailySpendUsd + 100, DEFAULT_COST_CONTROLS);
    expect(status.remainingUsd).toBe(0);
  });
});
