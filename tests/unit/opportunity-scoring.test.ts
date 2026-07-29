import { describe, expect, it } from "vitest";
import type { CatalystItem, EvidenceItem } from "@/lib/ai/analysis-schema";
import {
  computeCatalystScore,
  computeDataFreshnessFactor,
  computeEstimatedEdge,
  computeEvidenceQualityScore,
  computeLiquidityScore,
  computeOpportunityScore,
  computeResolutionRiskScore,
  computeSpreadScore,
  DEFAULT_SCORING_CONFIG,
  type OpportunityScoreInputs,
} from "@/lib/ai/opportunity-scoring";

const goodEvidence: EvidenceItem[] = [
  {
    title: "Official result certified",
    publisher: "Reuters",
    url: "https://example.com/a",
    publishedAt: "2026-07-28T00:00:00Z",
    eventDate: null,
    sourceType: "wire",
    credibilityTier: 1,
    excerpt: "...",
    supportsThesis: true,
    duplicateOfTitle: null,
  },
  {
    title: "Independent confirmation",
    publisher: "AP",
    url: "https://example.com/b",
    publishedAt: "2026-07-28T00:00:00Z",
    eventDate: null,
    sourceType: "wire",
    credibilityTier: 2,
    excerpt: "...",
    supportsThesis: true,
    duplicateOfTitle: null,
  },
];

const highImportanceCatalyst: CatalystItem[] = [
  { kind: "important_date", description: "Certification deadline", eventDate: "2026-08-01T00:00:00Z", importance: "high" },
];

function baseInputs(overrides: Partial<OpportunityScoreInputs> = {}): OpportunityScoreInputs {
  return {
    liquidityUsd: 50_000,
    spreadDecimal: 0.01,
    evidence: goodEvidence,
    resolutionRiskLevel: "LOW",
    resolutionAmbiguityFlagsCount: 0,
    catalysts: highImportanceCatalyst,
    confidenceScore: 80,
    fairProbability: { low: 0.55, base: 0.6, high: 0.65 },
    marketProbability: 0.4,
    sourceDataAsOf: new Date("2026-07-29T00:00:00Z"),
    now: new Date("2026-07-29T01:00:00Z"),
    ...overrides,
  };
}

describe("computeLiquidityScore", () => {
  it("scores 0 at or below the floor", () => {
    expect(computeLiquidityScore(0)).toBe(0);
    expect(computeLiquidityScore(DEFAULT_SCORING_CONFIG.liquidityFloorUsd)).toBe(0);
  });

  it("scores 100 at or above saturation", () => {
    expect(computeLiquidityScore(DEFAULT_SCORING_CONFIG.liquiditySaturationUsd)).toBe(100);
    expect(computeLiquidityScore(10_000_000)).toBe(100);
  });

  it("scores strictly higher for more liquidity in between", () => {
    expect(computeLiquidityScore(5_000)).toBeLessThan(computeLiquidityScore(50_000));
  });
});

describe("computeSpreadScore", () => {
  it("treats missing order-book data as unscoreable (0)", () => {
    expect(computeSpreadScore(null)).toBe(0);
  });

  it("scores 100 at or under the floor and 0 at or over the ceiling", () => {
    expect(computeSpreadScore(0.001)).toBe(100);
    expect(computeSpreadScore(0.5)).toBe(0);
  });

  it("scores tighter spreads higher", () => {
    expect(computeSpreadScore(0.01)).toBeGreaterThan(computeSpreadScore(0.1));
  });
});

describe("computeEvidenceQualityScore", () => {
  it("scores 0 with no evidence", () => {
    expect(computeEvidenceQualityScore([])).toBe(0);
  });

  it("excludes duplicate-flagged items from scoring", () => {
    const withDuplicate: EvidenceItem[] = [
      ...goodEvidence,
      { ...goodEvidence[0], title: "Rehash", duplicateOfTitle: goodEvidence[0].title },
    ];
    expect(computeEvidenceQualityScore(withDuplicate)).toBe(computeEvidenceQualityScore(goodEvidence));
  });

  it("scores low-credibility-only evidence lower than high-credibility evidence", () => {
    const lowTier: EvidenceItem[] = goodEvidence.map((e) => ({ ...e, credibilityTier: 6 }));
    expect(computeEvidenceQualityScore(lowTier)).toBeLessThan(computeEvidenceQualityScore(goodEvidence));
  });
});

describe("computeResolutionRiskScore", () => {
  it("scores LOW risk far higher than CRITICAL", () => {
    expect(computeResolutionRiskScore("LOW", 0)).toBeGreaterThan(computeResolutionRiskScore("CRITICAL", 0));
  });

  it("applies a penalty per ambiguity flag, floored at 0", () => {
    const withoutFlags = computeResolutionRiskScore("MEDIUM", 0);
    const withFlags = computeResolutionRiskScore("MEDIUM", 3);
    expect(withFlags).toBeLessThan(withoutFlags);
    expect(computeResolutionRiskScore("CRITICAL", 20)).toBe(0);
  });
});

describe("computeCatalystScore", () => {
  it("scores 0 with no catalysts", () => {
    expect(computeCatalystScore([])).toBe(0);
  });

  it("weights high-importance catalysts more than low", () => {
    const low: CatalystItem[] = [{ kind: "catalyst", description: "x", eventDate: null, importance: "low" }];
    const high: CatalystItem[] = [{ kind: "catalyst", description: "x", eventDate: null, importance: "high" }];
    expect(computeCatalystScore(high)).toBeGreaterThan(computeCatalystScore(low));
  });
});

describe("computeDataFreshnessFactor", () => {
  it("gives full credit within the fresh window and zero credit past the stale window", () => {
    const now = new Date("2026-07-29T12:00:00Z");
    expect(computeDataFreshnessFactor(new Date("2026-07-29T11:00:00Z"), now)).toBe(1);
    expect(computeDataFreshnessFactor(new Date("2026-07-01T00:00:00Z"), now)).toBe(0);
  });
});

describe("computeEstimatedEdge", () => {
  it("computes signed edges against market probability", () => {
    const edge = computeEstimatedEdge({ low: 0.5, base: 0.6, high: 0.7 }, 0.4);
    expect(edge.low).toBeCloseTo(0.1);
    expect(edge.base).toBeCloseTo(0.2);
    expect(edge.high).toBeCloseTo(0.3);
  });
});

describe("computeOpportunityScore", () => {
  it("scores a strong, liquid, tight-spread, well-evidenced, low-risk edge highly", () => {
    const result = computeOpportunityScore(baseInputs());
    expect(result.opportunityScore).toBeGreaterThan(50);
    expect(result.scoringVersion).toBe("opportunity-score-v1");
  });

  it("does not let poor liquidity be outweighed by a large theoretical edge", () => {
    const illiquid = computeOpportunityScore(baseInputs({ liquidityUsd: 0 }));
    const liquid = computeOpportunityScore(baseInputs({ liquidityUsd: 200_000 }));
    expect(illiquid.opportunityScore).toBeLessThan(liquid.opportunityScore * 0.3);
  });

  it("does not let a wide spread be outweighed by a large theoretical edge", () => {
    const wide = computeOpportunityScore(baseInputs({ spreadDecimal: 0.4 }));
    const tight = computeOpportunityScore(baseInputs({ spreadDecimal: 0.005 }));
    expect(wide.opportunityScore).toBeLessThan(tight.opportunityScore * 0.3);
  });

  it("does not let ambiguous/high-risk resolution be outweighed by a large theoretical edge", () => {
    const critical = computeOpportunityScore(
      baseInputs({ resolutionRiskLevel: "CRITICAL", resolutionAmbiguityFlagsCount: 4 }),
    );
    const low = computeOpportunityScore(baseInputs());
    expect(critical.opportunityScore).toBeLessThan(low.opportunityScore * 0.15);
  });

  it("does not let stale data be outweighed by a large theoretical edge", () => {
    const stale = computeOpportunityScore(
      baseInputs({ sourceDataAsOf: new Date("2026-07-01T00:00:00Z"), now: new Date("2026-07-29T00:00:00Z") }),
    );
    expect(stale.opportunityScore).toBe(0);
  });

  it("does not let low-quality evidence be outweighed by a large theoretical edge", () => {
    const thinEvidence = computeOpportunityScore(baseInputs({ evidence: [] }));
    const wellEvidenced = computeOpportunityScore(baseInputs());
    expect(thinEvidence.opportunityScore).toBe(0);
    expect(wellEvidenced.opportunityScore).toBeGreaterThan(0);
  });

  it("returns a breakdown usable for the analysis_scores audit table", () => {
    const result = computeOpportunityScore(baseInputs());
    const factors = result.breakdown.map((b) => b.factor);
    expect(factors).toContain("edgeScore");
    expect(factors).toContain("liquidityScore");
    expect(factors).toContain("resolutionRiskScore");
    for (const item of result.breakdown) {
      expect(Number.isFinite(item.rawValue)).toBe(true);
      expect(Number.isFinite(item.weight)).toBe(true);
      expect(Number.isFinite(item.contribution)).toBe(true);
    }
  });

  it("caps the opportunity score at 100 even for maximal inputs", () => {
    const result = computeOpportunityScore(
      baseInputs({
        liquidityUsd: 10_000_000,
        spreadDecimal: 0.001,
        confidenceScore: 100,
        fairProbability: { low: 0.95, base: 0.99, high: 1 },
        marketProbability: 0.01,
      }),
    );
    expect(result.opportunityScore).toBeLessThanOrEqual(100);
  });
});
