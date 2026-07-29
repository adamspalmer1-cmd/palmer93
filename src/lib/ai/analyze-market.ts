import "server-only";
import type { Db } from "@/lib/services/types";
import type { Analysis, Market } from "@/types/database.types";
import { buildAnalysisModelInput, type BuildAnalysisContextOptions } from "@/lib/services/analysis-context.service";
import { checkReanalysisEligibility } from "@/lib/services/reanalysis.service";
import { persistAnalysis, recordAnalysisFailure } from "@/lib/services/analysis-persistence.service";
import { checkCostEligibility, DEFAULT_COST_CONTROLS, type CostControlsConfig } from "@/lib/ai/cost-controls";
import {
  ANALYSIS_MODEL,
  buildAnalysisSystemPrompt,
  runAnalysisModelCall,
  type AnalysisModelInput,
} from "@/lib/ai/analysis-model";
import { runEvidencePipeline } from "@/lib/ai/evidence-pipeline";
import { computeOpportunityScore } from "@/lib/ai/opportunity-scoring";

/**
 * Single-market analysis pipeline: eligibility -> context assembly -> Claude
 * call -> evidence pipeline -> deterministic scoring -> persistence. This is
 * the one function both the on-demand API route (task #33) and the batch
 * engine (task #32) call per market — neither reimplements the sequence.
 */

export const PROMPT_VERSION_ID = "opportunity-analysis-v1";

export interface RunSingleMarketAnalysisOptions {
  /** Attaches the resulting analysis/failure rows to a batch run for provenance. Omit for standalone/on-demand calls. */
  runId?: number | null;
  config?: CostControlsConfig;
  /** Bypasses the cost-eligibility and reanalysis-cooldown checks — for explicit admin/user-triggered reanalysis. */
  forceReanalysis?: boolean;
  contextOptions?: BuildAnalysisContextOptions;
  now?: Date;
}

export type SingleAnalysisOutcome =
  | { status: "ok"; analysis: Analysis }
  | { status: "skipped"; reason: string }
  | { status: "refused"; message: string }
  | { status: "invalid_output"; errors: string[] }
  | { status: "error"; error: string };

export async function runSingleMarketAnalysis(
  db: Db,
  market: Market,
  options: RunSingleMarketAnalysisOptions = {},
): Promise<SingleAnalysisOutcome> {
  const config = options.config ?? DEFAULT_COST_CONTROLS;
  const now = options.now ?? new Date();
  const runId = options.runId ?? null;

  if (!options.forceReanalysis) {
    const costCheck = checkCostEligibility(
      { liquidity: market.liquidity, spread: market.spread, category: market.category_id },
      config,
    );
    if (!costCheck.eligible) {
      return { status: "skipped", reason: costCheck.reasons.join("; ") };
    }

    const reanalysisCheck = await checkReanalysisEligibility(db, market, config, now);
    if (!reanalysisCheck.eligible) {
      return { status: "skipped", reason: reanalysisCheck.reason };
    }
  }

  let input: AnalysisModelInput;
  try {
    input = await buildAnalysisModelInput(db, market, { ...options.contextOptions, now });
  } catch (error) {
    const message = (error as Error).message;
    await recordAnalysisFailure(db, { runId, marketId: market.id, stage: "context", error: message, retryable: false });
    return { status: "error", error: message };
  }

  const result = await runAnalysisModelCall(input);

  if (result.status === "refused") {
    await recordAnalysisFailure(db, { runId, marketId: market.id, stage: "model_call", error: result.message, retryable: false });
    return { status: "refused", message: result.message };
  }

  if (result.status === "invalid_output") {
    await recordAnalysisFailure(db, {
      runId,
      marketId: market.id,
      stage: "validation",
      error: result.errors.join("; ") || "Invalid structured output",
      retryable: false,
    });
    return { status: "invalid_output", errors: result.errors };
  }

  const output = result.output;

  // Run the dedup/injection pipeline over both lists together so a
  // "contrary" item that repeats a "key" item's source is still caught.
  const combinedEvidence = runEvidencePipeline([...output.keyEvidence, ...output.contraryEvidence]);
  const keyEvidence = combinedEvidence.slice(0, output.keyEvidence.length);
  const contraryEvidence = combinedEvidence.slice(output.keyEvidence.length);

  const scoring = computeOpportunityScore({
    liquidityUsd: input.pricing.liquidity,
    spreadDecimal: input.pricing.spread,
    evidence: [...output.keyEvidence, ...output.contraryEvidence],
    resolutionRiskLevel: output.resolutionRiskLevel,
    resolutionAmbiguityFlagsCount: output.resolutionAmbiguityFlags.length,
    catalysts: output.catalysts,
    confidenceScore: output.confidenceScore,
    fairProbability: { low: output.fairProbabilityLow, base: output.fairProbabilityBase, high: output.fairProbabilityHigh },
    marketProbability: output.marketProbabilityObserved,
    sourceDataAsOf: new Date(output.sourceDataAsOf),
    now,
  });

  try {
    const analysis = await persistAnalysis(db, {
      marketId: market.id,
      runId,
      output,
      scoring,
      keyEvidence,
      contraryEvidence,
      modelVersion: ANALYSIS_MODEL,
      promptVersion: PROMPT_VERSION_ID,
      promptTemplate: buildAnalysisSystemPrompt(),
      marketSnapshot: { market, pricing: input.pricing },
    });
    return { status: "ok", analysis };
  } catch (error) {
    const message = (error as Error).message;
    await recordAnalysisFailure(db, { runId, marketId: market.id, stage: "persistence", error: message, retryable: true });
    return { status: "error", error: message };
  }
}
