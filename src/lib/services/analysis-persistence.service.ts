import type { Db } from "./types";
import type { Analysis, Database, Json } from "@/types/database.types";
import { SELF_CRITIQUE_QUESTIONS, type OpportunityAnalysisOutput } from "@/lib/ai/analysis-schema";
import type { OpportunityScoreResult } from "@/lib/ai/opportunity-scoring";
import type { ProcessedEvidenceItem } from "@/lib/ai/evidence-pipeline";

type AnalysisInsert = Database["public"]["Tables"]["analyses"]["Insert"];
type EvidenceInsert = Database["public"]["Tables"]["analysis_evidence"]["Insert"];
type ScoreInsert = Database["public"]["Tables"]["analysis_scores"]["Insert"];
type CatalystInsert = Database["public"]["Tables"]["analysis_catalysts"]["Insert"];
type AssumptionInsert = Database["public"]["Tables"]["analysis_assumptions"]["Insert"];
type UnknownInsert = Database["public"]["Tables"]["analysis_unknowns"]["Insert"];
type AnalysisFailureInsert = Database["public"]["Tables"]["analysis_failures"]["Insert"];

/** Registers a model id in `model_versions` the first time it's used; a no-op if already registered. Never updates an existing row — `first_used_at` is meant to stick. */
export async function ensureModelVersion(db: Db, id: string, displayName?: string): Promise<void> {
  const { data, error } = await db.from("model_versions").select("id").eq("id", id).maybeSingle();
  if (error) throw new Error(`Failed to check model_versions: ${error.message}`);
  if (data) return;

  const { error: insertError } = await db.from("model_versions").insert({ id, display_name: displayName ?? id });
  if (insertError) throw new Error(`Failed to register model version ${id}: ${insertError.message}`);
}

/** Registers a prompt version's id + template the first time it's used; a no-op if already registered — prompt text for a given id is meant to be immutable in practice (bump the id when the prompt changes). */
export async function ensurePromptVersion(db: Db, id: string, template: string, description?: string): Promise<void> {
  const { data, error } = await db.from("prompt_versions").select("id").eq("id", id).maybeSingle();
  if (error) throw new Error(`Failed to check prompt_versions: ${error.message}`);
  if (data) return;

  const { error: insertError } = await db.from("prompt_versions").insert({ id, template, description });
  if (insertError) throw new Error(`Failed to register prompt version ${id}: ${insertError.message}`);
}

function formatSelfCritique(critique: OpportunityAnalysisOutput["selfCritique"]): string {
  const lines = [
    `${SELF_CRITIQUE_QUESTIONS[0]}\n${critique.weakestPoint}`,
    `${SELF_CRITIQUE_QUESTIONS[1]}\n${critique.strongestCounterArgument}`,
    `${SELF_CRITIQUE_QUESTIONS[2]}\n${critique.evidenceSufficiencyConcerns}`,
    `${SELF_CRITIQUE_QUESTIONS[3]}\n${critique.resolutionCriteriaAmbiguityConcerns}`,
    `${SELF_CRITIQUE_QUESTIONS[4]}\n${critique.whatWouldChangeAssessment}`,
    `Materially weakens thesis: ${critique.materiallyWeakensThesis ? "yes" : "no"}`,
  ];
  if (critique.adjustmentsMade.trim().length > 0) {
    lines.push(`Adjustments made: ${critique.adjustmentsMade}`);
  }
  return lines.join("\n\n");
}

export interface PersistAnalysisInput {
  marketId: string;
  runId: number | null;
  output: OpportunityAnalysisOutput;
  scoring: OpportunityScoreResult;
  keyEvidence: ProcessedEvidenceItem[];
  contraryEvidence: ProcessedEvidenceItem[];
  modelVersion: string;
  promptVersion: string;
  promptTemplate: string;
  /** Raw market + pricing data as of the analysis, kept verbatim for audit/reproducibility. */
  marketSnapshot: Record<string, unknown>;
}

/**
 * Inserts one immutable analysis and all of its child rows (evidence,
 * score breakdown, catalysts, assumptions, unknowns). Nothing here ever
 * issues an UPDATE against these tables — the database's own trigger
 * (migration 0007) would reject it anyway. Evidence rows are inserted one
 * at a time, in citation order, so a later duplicate item can resolve
 * `duplicate_of_id` to the id an earlier insert in this same analysis just
 * received — `analysis_evidence` is immutable too, so that FK can't be
 * back-filled with a follow-up UPDATE.
 */
export async function persistAnalysis(db: Db, input: PersistAnalysisInput): Promise<Analysis> {
  const { output, scoring } = input;

  const additionalInjectionFlags = [...input.keyEvidence, ...input.contraryEvidence]
    .filter((e) => e.flaggedInjection && e.injectionNotes)
    .map((e) => `${e.title}: ${e.injectionNotes}`);
  const promptInjectionFlags = Array.from(new Set([...output.promptInjectionFlags, ...additionalInjectionFlags]));

  const analysisRow: AnalysisInsert = {
    market_id: input.marketId,
    run_id: input.runId,
    analyzed_outcome: output.analyzedOutcome,
    market_probability: output.marketProbabilityObserved,
    fair_probability_low: output.fairProbabilityLow,
    fair_probability_base: output.fairProbabilityBase,
    fair_probability_high: output.fairProbabilityHigh,
    estimated_edge_low: scoring.estimatedEdgeLow,
    estimated_edge_base: scoring.estimatedEdgeBase,
    estimated_edge_high: scoring.estimatedEdgeHigh,
    confidence_score: output.confidenceScore,
    evidence_quality_score: scoring.evidenceQualityScore,
    liquidity_score: scoring.liquidityScore,
    spread_score: scoring.spreadScore,
    resolution_risk_score: scoring.resolutionRiskScore,
    resolution_risk_level: output.resolutionRiskLevel,
    catalyst_score: scoring.catalystScore,
    opportunity_score: scoring.opportunityScore,
    market_summary: output.marketSummary,
    bull_case: output.bullCase,
    bear_case: output.bearCase,
    key_evidence: output.keyEvidence,
    contrary_evidence: output.contraryEvidence,
    invalidation_conditions: output.invalidationConditions,
    liquidity_assessment: output.liquidityAssessment,
    spread_assessment: output.spreadAssessment,
    resolution_assessment: output.resolutionCriteriaAssessment,
    evidence_assessment: output.evidenceAssessment,
    self_critique: formatSelfCritique(output.selfCritique),
    recommendation_status: output.recommendationStatus,
    prompt_injection_flags: promptInjectionFlags,
    market_snapshot: input.marketSnapshot as unknown as Json,
    scoring_version: scoring.scoringVersion,
    model_version: input.modelVersion,
    prompt_version: input.promptVersion,
    source_data_as_of: output.sourceDataAsOf,
  };

  await ensureModelVersion(db, input.modelVersion);
  await ensurePromptVersion(db, input.promptVersion, input.promptTemplate);

  const { data: analysis, error: analysisError } = await db.from("analyses").insert(analysisRow).select().single();
  if (analysisError || !analysis) {
    throw new Error(`Failed to persist analysis for market ${input.marketId}: ${analysisError?.message}`);
  }

  await persistEvidence(db, analysis.id, [...input.keyEvidence, ...input.contraryEvidence]);
  await persistScoreBreakdown(db, analysis.id, scoring);
  await persistCatalysts(db, analysis.id, output.catalysts);
  await persistAssumptions(db, analysis.id, output.assumptions);
  await persistUnknowns(db, analysis.id, output.unknowns);

  return analysis;
}

async function persistEvidence(db: Db, analysisId: number, evidence: ProcessedEvidenceItem[]): Promise<void> {
  const titleToId = new Map<string, number>();

  for (const item of evidence) {
    const duplicateOfId = item.effectiveDuplicateOfTitle ? (titleToId.get(item.effectiveDuplicateOfTitle) ?? null) : null;

    const row: EvidenceInsert = {
      analysis_id: analysisId,
      title: item.title,
      publisher: item.publisher,
      url: item.url,
      published_at: item.publishedAt,
      event_date: item.eventDate,
      source_type: item.sourceType,
      credibility_tier: item.credibilityTier,
      excerpt: item.excerpt,
      supports_thesis: item.supportsThesis,
      duplicate_of_id: duplicateOfId,
      flagged_injection: item.flaggedInjection,
      injection_notes: item.injectionNotes,
    };

    const { data, error } = await db.from("analysis_evidence").insert(row).select().single();
    if (error || !data) {
      throw new Error(`Failed to persist evidence "${item.title}" for analysis ${analysisId}: ${error?.message}`);
    }
    titleToId.set(item.title, data.id);
  }
}

async function persistScoreBreakdown(db: Db, analysisId: number, scoring: OpportunityScoreResult): Promise<void> {
  if (scoring.breakdown.length === 0) return;
  const rows: ScoreInsert[] = scoring.breakdown.map((item) => ({
    analysis_id: analysisId,
    factor: item.factor,
    raw_value: item.rawValue,
    weight: item.weight,
    contribution: item.contribution,
    scoring_version: scoring.scoringVersion,
  }));
  const { error } = await db.from("analysis_scores").insert(rows);
  if (error) throw new Error(`Failed to persist score breakdown for analysis ${analysisId}: ${error.message}`);
}

async function persistCatalysts(
  db: Db,
  analysisId: number,
  catalysts: OpportunityAnalysisOutput["catalysts"],
): Promise<void> {
  if (catalysts.length === 0) return;
  const rows: CatalystInsert[] = catalysts.map((c, i) => ({
    analysis_id: analysisId,
    kind: c.kind,
    description: c.description,
    event_date: c.eventDate,
    importance: c.importance,
    sort_order: i,
  }));
  const { error } = await db.from("analysis_catalysts").insert(rows);
  if (error) throw new Error(`Failed to persist catalysts for analysis ${analysisId}: ${error.message}`);
}

async function persistAssumptions(db: Db, analysisId: number, assumptions: string[]): Promise<void> {
  if (assumptions.length === 0) return;
  const rows: AssumptionInsert[] = assumptions.map((assumption, i) => ({
    analysis_id: analysisId,
    assumption,
    sort_order: i,
  }));
  const { error } = await db.from("analysis_assumptions").insert(rows);
  if (error) throw new Error(`Failed to persist assumptions for analysis ${analysisId}: ${error.message}`);
}

async function persistUnknowns(db: Db, analysisId: number, unknowns: string[]): Promise<void> {
  if (unknowns.length === 0) return;
  const rows: UnknownInsert[] = unknowns.map((description, i) => ({
    analysis_id: analysisId,
    description,
    sort_order: i,
  }));
  const { error } = await db.from("analysis_unknowns").insert(rows);
  if (error) throw new Error(`Failed to persist unknowns for analysis ${analysisId}: ${error.message}`);
}

export interface RecordAnalysisFailureInput {
  runId: number | null;
  marketId: string | null;
  stage: string;
  error: string;
  retryable: boolean;
}

export async function recordAnalysisFailure(db: Db, input: RecordAnalysisFailureInput): Promise<void> {
  const row: AnalysisFailureInsert = {
    run_id: input.runId,
    market_id: input.marketId,
    stage: input.stage,
    error: input.error,
    retryable: input.retryable,
  };
  const { error } = await db.from("analysis_failures").insert(row);
  if (error) throw new Error(`Failed to record analysis failure: ${error.message}`);
}
