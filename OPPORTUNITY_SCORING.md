# Opportunity Score

Source of truth: `lib/ai/opportunity-scoring.ts` (`SCORING_VERSION =
"opportunity-score-v1"`). This document explains the formula in prose; if
the two ever disagree, the code is correct and this file is stale.

## Why the score is computed, not asked of Claude

Claude's structured output (`lib/ai/analysis-schema.ts`) carries only
qualitative/judgment fields: the fair-probability range, a confidence
score, the resolution-risk level and ambiguity flags, evidence citations
with credibility tiers, and catalysts. Every number in `analyses` that
looks like a "score" — `liquidity_score`, `spread_score`,
`evidence_quality_score`, `resolution_risk_score`, `catalyst_score`,
`estimated_edge_*`, and `opportunity_score` itself — is derived from those
qualitative fields plus raw market data by deterministic functions in this
module. Nothing asks the model to self-grade its own opportunity score.
That's what makes the formula "transparent, documented, and configurable"
rather than an opaque number a prompt happened to produce.

## The individual scores (all 0–100 except edge, which is signed decimal)

| Score | Computed from | Function |
|---|---|---|
| `liquidityScore` | Market liquidity (USD), log-scaled between a floor and saturation point | `computeLiquidityScore` |
| `spreadScore` | Bid/ask spread (decimal); `null` (no order-book data) scores 0 | `computeSpreadScore` |
| `evidenceQualityScore` | Cited evidence's credibility tiers (Claude-assigned, 1–6) and corroboration count, excluding items flagged as duplicates | `computeEvidenceQualityScore` |
| `resolutionRiskScore` | Claude's `resolutionRiskLevel`, penalized per distinct ambiguity flag | `computeResolutionRiskScore` |
| `catalystScore` | Claude's `catalysts` list, weighted by importance | `computeCatalystScore` |
| `estimatedEdgeLow/Base/High` | `fairProbability{Low,Base,High} - marketProbabilityObserved` | `computeEstimatedEdge` |
| data-freshness factor (internal, not stored as its own column) | Age of the data snapshot Claude analyzed | `computeDataFreshnessFactor` |

All thresholds live in `OpportunityScoringConfig` /
`DEFAULT_SCORING_CONFIG` — liquidity floor/saturation, spread floor/
ceiling, evidence-tier weights, resolution-risk base scores and per-flag
penalty, catalyst importance weights, edge saturation, and the freshness
window. Change the numbers there, not in the formula logic, when tuning.

## The gate: why a big edge can't paper over a bad market

The requirement this structure exists to satisfy: a large theoretical
edge must not outweigh poor liquidity, a wide spread, ambiguous
resolution, stale data, or thin evidence. A weighted **sum** can't
guarantee that — a big edge term with 40% weight can still dominate a
liquidity term at 0 with 10% weight. So the formula isn't a sum:

```
edgeScore = clamp(|estimatedEdgeBase| / edgeSaturation, 0, 1) * 100

gateMultiplier = geometricMean([
  liquidityScore / 100,
  spreadScore / 100,
  evidenceQualityScore / 100,
  resolutionRiskScore / 100,
  confidenceScore / 100,
  dataFreshnessFactor,
])

catalystBonusRaw = (catalystScore / 100) * 8   // small, capped

opportunityScore = clamp((edgeScore + catalystBonusRaw) * gateMultiplier, 0, 100)
```

A geometric mean is dominated by its smallest input far more than an
arithmetic mean is — one factor at 5 (e.g. `resolutionRiskScore` for a
CRITICAL-risk market) collapses the whole gate toward zero even if every
other factor is a perfect 100. Catalysts are the one additive-feeling
piece, but they're still multiplied by the same gate: a catalyst is only
worth crediting when there's credible, fresh research behind it, so the
gate applies to it too rather than letting it become a backdoor around the
liquidity/spread/risk/evidence checks.

`lib/ai/opportunity-scoring.ts`'s test suite
(`tests/unit/opportunity-scoring.test.ts`) asserts this structurally: a
market with a large edge but zero liquidity, a wide spread, CRITICAL
resolution risk, stale data, or no evidence scores dramatically lower than
the same edge with those factors healthy — in most cases exactly 0.

## Audit trail

Every computed score plus a synthetic `edgeScore` and `catalystScore`
"factor" is written to `analysis_scores` (`factor`, `raw_value`, `weight`,
`contribution`, `scoring_version`) by `persistAnalysis`. The `weight`
recorded there is each factor's nominal role in the formula (1/6 for each
gate factor, 1 for edge, the catalyst bonus's max-points share for
catalyst) — useful for display/audit, not a literal linear decomposition
of a multiplicative formula.
