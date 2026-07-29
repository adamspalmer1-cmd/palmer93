import type { CatalystItem, EvidenceItem, ResolutionRiskLevel } from "@/lib/ai/analysis-schema";

/**
 * Deterministic Opportunity Score formula.
 *
 * Every input here is either raw market data (liquidity, spread) or a
 * qualitative field Claude produced (resolutionRiskLevel, catalysts,
 * evidence, confidenceScore) — never a number the model was asked to
 * self-grade. See docs/OPPORTUNITY_SCORING.md for the human-readable write
 * up; this module is the source of truth it describes.
 *
 * Structure, not just weighting, is what keeps a large theoretical edge
 * from outweighing poor liquidity, a wide spread, ambiguous resolution,
 * stale data, or thin evidence: those five factors (plus model confidence)
 * are combined as a **geometric mean gate** in [0, 1] and multiplied into
 * the edge score, rather than added as independent weighted terms. A
 * geometric mean is pulled down hard by any single very-low factor —
 * e.g. resolutionRiskScore = 5 (CRITICAL) collapses the gate to near zero
 * even if every other factor is a perfect 100 — whereas a weighted sum
 * would let a big edge simply outvote one bad dimension. Catalysts are the
 * one exception: they're additive, small, and capped, because the
 * *absence* of a known catalyst shouldn't zero out an otherwise-sound
 * opportunity the way bad liquidity or an ambiguous resolution should.
 */

export const SCORING_VERSION = "opportunity-score-v1";

export interface OpportunityScoringConfig {
  /** Liquidity (USD) at or below which liquidityScore is 0. */
  liquidityFloorUsd: number;
  /** Liquidity (USD) at or above which liquidityScore saturates at 100. Scored on a log scale between floor and here. */
  liquiditySaturationUsd: number;
  /** Spread (decimal, e.g. 0.02 = 2 cents) at or below which spreadScore is 100. */
  spreadFloorDecimal: number;
  /** Spread at or above which spreadScore is 0. Missing order-book data also scores 0. */
  spreadCeilingDecimal: number;
  /** Number of non-duplicate evidence items at which the corroboration-count component saturates. */
  evidenceSaturationCount: number;
  /** Weight (0-1) applied to each evidence item by its Claude-assigned credibility tier (1 = most credible). */
  evidenceCredibilityWeights: Record<1 | 2 | 3 | 4 | 5 | 6, number>;
  /** Base resolutionRiskScore (0-100) per Claude-assigned risk level, before ambiguity-flag penalties. */
  resolutionRiskBaseScores: Record<ResolutionRiskLevel, number>;
  /** Points subtracted from resolutionRiskScore per distinct ambiguity flag Claude reported. */
  resolutionRiskAmbiguityPenaltyPerFlag: number;
  /** Points added per catalyst, by importance (missing/unrecognized importance falls back to "low"). */
  catalystImportanceWeights: Record<"low" | "medium" | "high", number>;
  /** Absolute decimal probability edge (|fair - market|) that maps to an edgeScore of 100. */
  edgeSaturation: number;
  /** Data age (hours) at or under which the freshness gate factor is 1.0. */
  freshnessFullCreditHours: number;
  /** Data age (hours) at or over which the freshness gate factor is 0. */
  freshnessZeroCreditHours: number;
}

export const DEFAULT_SCORING_CONFIG: OpportunityScoringConfig = {
  liquidityFloorUsd: 500,
  liquiditySaturationUsd: 100_000,
  spreadFloorDecimal: 0.005,
  spreadCeilingDecimal: 0.15,
  evidenceSaturationCount: 5,
  evidenceCredibilityWeights: {
    1: 1.0,
    2: 0.85,
    3: 0.65,
    4: 0.5,
    5: 0.3,
    6: 0.15,
  },
  resolutionRiskBaseScores: {
    LOW: 90,
    MEDIUM: 60,
    HIGH: 25,
    CRITICAL: 5,
  },
  resolutionRiskAmbiguityPenaltyPerFlag: 5,
  catalystImportanceWeights: {
    low: 10,
    medium: 20,
    high: 35,
  },
  edgeSaturation: 0.3,
  freshnessFullCreditHours: 2,
  freshnessZeroCreditHours: 48,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function computeLiquidityScore(
  liquidityUsd: number,
  config: OpportunityScoringConfig = DEFAULT_SCORING_CONFIG,
): number {
  if (liquidityUsd <= config.liquidityFloorUsd) return 0;
  if (liquidityUsd >= config.liquiditySaturationUsd) return 100;
  const logFloor = Math.log10(config.liquidityFloorUsd + 1);
  const logSaturation = Math.log10(config.liquiditySaturationUsd + 1);
  const logValue = Math.log10(liquidityUsd + 1);
  return clamp(((logValue - logFloor) / (logSaturation - logFloor)) * 100, 0, 100);
}

export function computeSpreadScore(
  spreadDecimal: number | null,
  config: OpportunityScoringConfig = DEFAULT_SCORING_CONFIG,
): number {
  if (spreadDecimal === null) return 0;
  if (spreadDecimal <= config.spreadFloorDecimal) return 100;
  if (spreadDecimal >= config.spreadCeilingDecimal) return 0;
  const range = config.spreadCeilingDecimal - config.spreadFloorDecimal;
  return clamp((100 * (config.spreadCeilingDecimal - spreadDecimal)) / range, 0, 100);
}

export function computeEvidenceQualityScore(
  evidence: EvidenceItem[],
  config: OpportunityScoringConfig = DEFAULT_SCORING_CONFIG,
): number {
  const unique = evidence.filter((item) => !item.duplicateOfTitle);
  if (unique.length === 0) return 0;

  const weights = unique.map((item) => config.evidenceCredibilityWeights[item.credibilityTier as 1 | 2 | 3 | 4 | 5 | 6] ?? 0);
  const avgCredibilityWeight = weights.reduce((sum, w) => sum + w, 0) / weights.length;
  const corroborationFactor = clamp(unique.length / config.evidenceSaturationCount, 0, 1);

  return clamp((avgCredibilityWeight * 0.8 + corroborationFactor * 0.2) * 100, 0, 100);
}

export function computeResolutionRiskScore(
  level: ResolutionRiskLevel,
  ambiguityFlagsCount: number,
  config: OpportunityScoringConfig = DEFAULT_SCORING_CONFIG,
): number {
  const base = config.resolutionRiskBaseScores[level];
  const penalty = ambiguityFlagsCount * config.resolutionRiskAmbiguityPenaltyPerFlag;
  return clamp(base - penalty, 0, 100);
}

export function computeCatalystScore(
  catalysts: CatalystItem[],
  config: OpportunityScoringConfig = DEFAULT_SCORING_CONFIG,
): number {
  if (catalysts.length === 0) return 0;
  const total = catalysts.reduce((sum, catalyst) => {
    const importance = catalyst.importance ?? "low";
    return sum + config.catalystImportanceWeights[importance];
  }, 0);
  return clamp(total, 0, 100);
}

export function computeDataFreshnessFactor(
  sourceDataAsOf: Date,
  now: Date,
  config: OpportunityScoringConfig = DEFAULT_SCORING_CONFIG,
): number {
  const ageHours = (now.getTime() - sourceDataAsOf.getTime()) / (1000 * 60 * 60);
  if (ageHours <= config.freshnessFullCreditHours) return 1;
  if (ageHours >= config.freshnessZeroCreditHours) return 0;
  const range = config.freshnessZeroCreditHours - config.freshnessFullCreditHours;
  return clamp(1 - (ageHours - config.freshnessFullCreditHours) / range, 0, 1);
}

export interface FairProbabilityRange {
  low: number;
  base: number;
  high: number;
}

export interface EstimatedEdge {
  low: number;
  base: number;
  high: number;
}

export function computeEstimatedEdge(fairProbability: FairProbabilityRange, marketProbability: number): EstimatedEdge {
  const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
  return {
    low: round4(fairProbability.low - marketProbability),
    base: round4(fairProbability.base - marketProbability),
    high: round4(fairProbability.high - marketProbability),
  };
}

export interface OpportunityScoreInputs {
  liquidityUsd: number;
  spreadDecimal: number | null;
  evidence: EvidenceItem[];
  resolutionRiskLevel: ResolutionRiskLevel;
  resolutionAmbiguityFlagsCount: number;
  catalysts: CatalystItem[];
  confidenceScore: number;
  fairProbability: FairProbabilityRange;
  marketProbability: number;
  sourceDataAsOf: Date;
  now?: Date;
  config?: OpportunityScoringConfig;
}

export interface OpportunityScoreBreakdownItem {
  factor: string;
  rawValue: number;
  weight: number;
  contribution: number;
}

export interface OpportunityScoreResult {
  opportunityScore: number;
  liquidityScore: number;
  spreadScore: number;
  evidenceQualityScore: number;
  resolutionRiskScore: number;
  catalystScore: number;
  estimatedEdgeLow: number;
  estimatedEdgeBase: number;
  estimatedEdgeHigh: number;
  scoringVersion: string;
  breakdown: OpportunityScoreBreakdownItem[];
}

const GATE_FACTOR_COUNT = 6;

export function computeOpportunityScore(inputs: OpportunityScoreInputs): OpportunityScoreResult {
  const config = inputs.config ?? DEFAULT_SCORING_CONFIG;
  const now = inputs.now ?? new Date();

  const liquidityScore = computeLiquidityScore(inputs.liquidityUsd, config);
  const spreadScore = computeSpreadScore(inputs.spreadDecimal, config);
  const evidenceQualityScore = computeEvidenceQualityScore(inputs.evidence, config);
  const resolutionRiskScore = computeResolutionRiskScore(
    inputs.resolutionRiskLevel,
    inputs.resolutionAmbiguityFlagsCount,
    config,
  );
  const catalystScore = computeCatalystScore(inputs.catalysts, config);
  const freshnessFactor = computeDataFreshnessFactor(inputs.sourceDataAsOf, now, config);

  const edge = computeEstimatedEdge(inputs.fairProbability, inputs.marketProbability);
  const edgeMagnitude = Math.abs(edge.base);
  const edgeScore = clamp((edgeMagnitude / config.edgeSaturation) * 100, 0, 100);

  const gateFactors = [
    liquidityScore / 100,
    spreadScore / 100,
    evidenceQualityScore / 100,
    resolutionRiskScore / 100,
    inputs.confidenceScore / 100,
    freshnessFactor,
  ];
  const gateProduct = gateFactors.reduce((product, factor) => product * Math.max(factor, 0), 1);
  const gateMultiplier = Math.pow(gateProduct, 1 / GATE_FACTOR_COUNT);

  const catalystBonusMaxPoints = 8;
  const catalystBonusRaw = (catalystScore / 100) * catalystBonusMaxPoints;
  // Gated by the same quality multiplier as the edge score: a catalyst is
  // only worth crediting when there's credible, fresh research behind it —
  // it must not become a backdoor around the liquidity/spread/risk/evidence
  // gate the way an ungated additive bonus would.
  const catalystBonus = catalystBonusRaw * gateMultiplier;

  const opportunityScore = clamp((edgeScore + catalystBonusRaw) * gateMultiplier, 0, 100);

  const gateWeight = 1 / GATE_FACTOR_COUNT;
  const breakdown: OpportunityScoreBreakdownItem[] = [
    { factor: "edgeScore", rawValue: edgeScore, weight: 1, contribution: edgeScore * gateMultiplier },
    { factor: "liquidityScore", rawValue: liquidityScore, weight: gateWeight, contribution: liquidityScore * gateWeight },
    { factor: "spreadScore", rawValue: spreadScore, weight: gateWeight, contribution: spreadScore * gateWeight },
    {
      factor: "evidenceQualityScore",
      rawValue: evidenceQualityScore,
      weight: gateWeight,
      contribution: evidenceQualityScore * gateWeight,
    },
    {
      factor: "resolutionRiskScore",
      rawValue: resolutionRiskScore,
      weight: gateWeight,
      contribution: resolutionRiskScore * gateWeight,
    },
    {
      factor: "confidenceScore",
      rawValue: inputs.confidenceScore,
      weight: gateWeight,
      contribution: inputs.confidenceScore * gateWeight,
    },
    {
      factor: "dataFreshnessFactor",
      rawValue: freshnessFactor * 100,
      weight: gateWeight,
      contribution: freshnessFactor * 100 * gateWeight,
    },
    { factor: "catalystScore", rawValue: catalystScore, weight: catalystBonusMaxPoints / 100, contribution: catalystBonus },
  ];

  return {
    opportunityScore,
    liquidityScore,
    spreadScore,
    evidenceQualityScore,
    resolutionRiskScore,
    catalystScore,
    estimatedEdgeLow: edge.low,
    estimatedEdgeBase: edge.base,
    estimatedEdgeHigh: edge.high,
    scoringVersion: SCORING_VERSION,
    breakdown,
  };
}
