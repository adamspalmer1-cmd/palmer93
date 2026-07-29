/**
 * Cost/eligibility controls for the AI Opportunity Engine's batch analysis
 * runs. Every limit here is a hard stop the batch engine (lib/ai/batch-engine.ts)
 * checks before and during a run — see docs/COST_CONTROLS.md. Kept as plain
 * data + pure functions (no `server-only`, no I/O) so it's usable from the
 * batch engine, the admin panel, and unit tests without a live environment.
 */

export interface ModelPricing {
  /** USD per 1,000,000 input tokens. */
  inputPerMillionTokensUsd: number;
  /** USD per 1,000,000 output tokens. */
  outputPerMillionTokensUsd: number;
}

/**
 * Placeholder pricing — override via ANTHROPIC_INPUT_COST_PER_MTOK /
 * ANTHROPIC_OUTPUT_COST_PER_MTOK once real billed rates for the configured
 * model are confirmed. Cost tracking degrades gracefully (just under- or
 * over-estimates spend) if this drifts from actual billing; it never
 * blocks an analysis from running.
 */
export const DEFAULT_MODEL_PRICING: ModelPricing = {
  inputPerMillionTokensUsd: 15,
  outputPerMillionTokensUsd: 75,
};

export interface CostControlsConfig {
  /** Maximum number of markets a single batch run will analyze. */
  maxMarketsPerRun: number;
  /** Hard ceiling on total estimated spend (USD) for a single calendar day (UTC). */
  maxDailySpendUsd: number;
  /** If a single analysis call's input+output tokens exceed this, the result is discarded as a runaway/failed call. */
  maxTokensPerAnalysis: number;
  /** Markets below this liquidity (USD) are skipped as ineligible before any Claude call is made. */
  minLiquidityUsd: number;
  /** Markets with a spread at or above this (decimal, e.g. 0.15 = 15 cents) are skipped as ineligible. */
  maxSpreadDecimal: number;
  /** A market already analyzed within this many hours is not eligible for reanalysis (see lib/ai/reanalysis.ts). */
  reanalysisCooldownHours: number;
  /** Token/cost pricing used to estimate spend. */
  modelPricing: ModelPricing;
  /** Per-category overrides, merged on top of the fields above. Category keys match `categories.slug`. */
  categoryOverrides: Record<string, Partial<Omit<CostControlsConfig, "categoryOverrides">>>;
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const DEFAULT_COST_CONTROLS: CostControlsConfig = {
  maxMarketsPerRun: 50,
  maxDailySpendUsd: 25,
  maxTokensPerAnalysis: 100_000,
  minLiquidityUsd: 1_000,
  maxSpreadDecimal: 0.2,
  reanalysisCooldownHours: 12,
  modelPricing: DEFAULT_MODEL_PRICING,
  categoryOverrides: {},
};

/**
 * Builds a cost-controls config from defaults, then environment variables,
 * then an explicit `overrides` object (highest precedence) — read at call
 * time rather than module load time so tests can set `process.env` per
 * case without module-reset gymnastics.
 */
export function loadCostControlsConfig(overrides: Partial<CostControlsConfig> = {}): CostControlsConfig {
  const fromEnv: CostControlsConfig = {
    maxMarketsPerRun: envNumber("AI_MAX_MARKETS_PER_RUN", DEFAULT_COST_CONTROLS.maxMarketsPerRun),
    maxDailySpendUsd: envNumber("AI_MAX_DAILY_SPEND_USD", DEFAULT_COST_CONTROLS.maxDailySpendUsd),
    maxTokensPerAnalysis: envNumber("AI_MAX_TOKENS_PER_ANALYSIS", DEFAULT_COST_CONTROLS.maxTokensPerAnalysis),
    minLiquidityUsd: envNumber("AI_MIN_LIQUIDITY_USD", DEFAULT_COST_CONTROLS.minLiquidityUsd),
    maxSpreadDecimal: envNumber("AI_MAX_SPREAD_DECIMAL", DEFAULT_COST_CONTROLS.maxSpreadDecimal),
    reanalysisCooldownHours: envNumber("AI_REANALYSIS_COOLDOWN_HOURS", DEFAULT_COST_CONTROLS.reanalysisCooldownHours),
    modelPricing: {
      inputPerMillionTokensUsd: envNumber(
        "ANTHROPIC_INPUT_COST_PER_MTOK",
        DEFAULT_MODEL_PRICING.inputPerMillionTokensUsd,
      ),
      outputPerMillionTokensUsd: envNumber(
        "ANTHROPIC_OUTPUT_COST_PER_MTOK",
        DEFAULT_MODEL_PRICING.outputPerMillionTokensUsd,
      ),
    },
    categoryOverrides: DEFAULT_COST_CONTROLS.categoryOverrides,
  };

  return { ...fromEnv, ...overrides };
}

/** Resolves the effective config for a market's category, merging any category override over the run-level config. */
export function resolveCategoryConfig(config: CostControlsConfig, category: string | null): CostControlsConfig {
  if (!category) return config;
  const override = config.categoryOverrides[category];
  if (!override) return config;
  return { ...config, ...override };
}

export function estimateCostUsd(inputTokens: number, outputTokens: number, pricing: ModelPricing): number {
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillionTokensUsd;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillionTokensUsd;
  return Math.round((inputCost + outputCost) * 10_000) / 10_000;
}

export interface EligibilityCheck {
  eligible: boolean;
  reasons: string[];
}

/** Pre-call eligibility gate on cost/liquidity/spread thresholds only — recency/cooldown eligibility lives in lib/ai/reanalysis.ts. */
export function checkCostEligibility(
  market: { liquidity: number; spread: number | null; category: string | null },
  config: CostControlsConfig,
): EligibilityCheck {
  const effective = resolveCategoryConfig(config, market.category);
  const reasons: string[] = [];

  if (market.liquidity < effective.minLiquidityUsd) {
    reasons.push(`liquidity ${market.liquidity} is below the minimum ${effective.minLiquidityUsd}`);
  }
  if (market.spread === null) {
    reasons.push("spread is unknown (no order-book data)");
  } else if (market.spread >= effective.maxSpreadDecimal) {
    reasons.push(`spread ${market.spread} is at or above the maximum ${effective.maxSpreadDecimal}`);
  }

  return { eligible: reasons.length === 0, reasons };
}

/** Whether a single completed analysis call should be treated as a runaway/failed call and discarded rather than persisted. */
export function exceedsTokenBudget(inputTokens: number, outputTokens: number, config: CostControlsConfig): boolean {
  return inputTokens + outputTokens > config.maxTokensPerAnalysis;
}

export interface BudgetStatus {
  spentUsd: number;
  remainingUsd: number;
  exhausted: boolean;
}

/** Given cumulative spend so far in a run/day, reports remaining budget and whether the batch engine must stop. */
export function checkDailyBudget(spentSoFarUsd: number, config: CostControlsConfig): BudgetStatus {
  const remainingUsd = Math.max(0, config.maxDailySpendUsd - spentSoFarUsd);
  return {
    spentUsd: spentSoFarUsd,
    remainingUsd,
    exhausted: spentSoFarUsd >= config.maxDailySpendUsd,
  };
}
