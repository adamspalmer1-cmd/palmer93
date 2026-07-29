# Analysis Schema

Two schemas, kept intentionally distinct:

1. **The structured LLM output** — `opportunityAnalysisOutputSchema` in
   `lib/ai/analysis-schema.ts`, a Zod schema passed to
   `zodOutputFormat()` and enforced by Claude's structured-output feature.
   This is what the model returns.
2. **The database schema** — `supabase/migrations/0007_ai_opportunity_engine.sql`
   / `src/types/database.types.ts`. This is what gets persisted, and it is
   not a 1:1 copy of the output schema (see "Design decisions" below).

## Structured output fields

| Field | Type | Notes |
|---|---|---|
| `analyzedOutcome` | string | e.g. "Yes" |
| `marketProbabilityObserved` | decimal 0–1 | Echoed from supplied data, cross-checked against it — not restated from memory |
| `fairProbabilityLow/Base/High` | decimal 0–1 each | `low <= base <= high` enforced; must widen under uncertainty (see below) |
| `confidenceScore` | 0–100 | Model's own confidence, post-self-critique |
| `marketSummary` | string | |
| `bullCase` / `bearCase` | string[] | |
| `keyEvidence` / `contraryEvidence` | evidence item[] | title, publisher, url, publishedAt, eventDate, sourceType, credibilityTier (1–6), excerpt, supportsThesis, duplicateOfTitle |
| `assumptions` / `unknowns` | string[] | |
| `catalysts` | catalyst item[] | kind (`catalyst` \| `important_date`), description, eventDate, importance |
| `invalidationConditions` | string[] | |
| `liquidityAssessment` / `spreadAssessment` | string | |
| `resolutionCriteriaAssessment` | string | |
| `resolutionRiskLevel` | `LOW`\|`MEDIUM`\|`HIGH`\|`CRITICAL` | |
| `resolutionAmbiguityFlags` | string[] | Specific ambiguity types found |
| `evidenceAssessment` | string | |
| `selfCritique` | object | Answers to the 5 mandatory questions (see `PROMPT_SECURITY.md`... see below) plus `materiallyWeakensThesis` and `adjustmentsMade` |
| `recommendationStatus` | enum, exactly 5 values | `PASS`, `WATCH`, `RESEARCH`, `POSSIBLE EDGE`, `INSUFFICIENT DATA` |
| `promptInjectionFlags` | string[] | Instructions the model noticed embedded in external content and disregarded |
| `dataFreshnessNotes` | string \| null | |
| `sourceDataAsOf` | ISO timestamp | |

Deliberately **absent**: `liquidityScore`, `spreadScore`,
`evidenceQualityScore`, `resolutionRiskScore`, `catalystScore`,
`estimatedEdge*`, `opportunityScore`. See `OPPORTUNITY_SCORING.md` — those
are computed, never asked of the model.

## Validation beyond field-level Zod checks

`validateAnalysisOutput()` (same file) enforces cross-field rules Zod's
shape-checking can't express, returning every violation rather than
failing on the first:

- `fairProbabilityLow <= fairProbabilityBase <= fairProbabilityHigh`.
- `marketProbabilityObserved` must match the market probability supplied
  in context within a tolerance (default 2 points) — catches stale/
  hallucinated data.
- **Range must widen under uncertainty**: minimum `fairProbabilityHigh -
  fairProbabilityLow` scales up for `resolutionRiskLevel` HIGH/CRITICAL,
  for `confidenceScore` below 40, and — most strictly — for
  `recommendationStatus === "INSUFFICIENT DATA"`.
- `INSUFFICIENT DATA` also caps `confidenceScore` at 20 — you can't claim
  the data is insufficient and also claim confidence.
- If `selfCritique.materiallyWeakensThesis` is true, `confidenceScore`
  must actually be lowered (capped at 70) and `adjustmentsMade` must be
  non-empty — the critique has to have actually changed something.
- No banned overconfident language anywhere in any free-text field or
  nested evidence excerpt: "guaranteed", "lock", "sure thing", "can't
  miss", "risk-free" (and close variants).

`runAnalysisModelCall` (`lib/ai/analysis-model.ts`) re-prompts Claude with
the specific validation errors up to `maxValidationRetries` (default 2)
times before giving up and returning `status: "invalid_output"` — bounded,
never indefinite.

## Database schema (migration 0007)

Ten tables plus a view, all immutable except `analysis_runs` and
`analysis_failures` (ops/telemetry, not part of the historical record):

| Table | Purpose |
|---|---|
| `analyses` | One row per analysis. All the scalar fields above, plus the computed scores, `bull_case`/`bear_case`/`key_evidence`/`contrary_evidence`/`invalidation_conditions` as `jsonb` array snapshots, `self_critique` as formatted text, `market_snapshot` (raw market+pricing data at analysis time), `scoring_version`, `model_version`, `prompt_version`. |
| `analysis_evidence` | One row per cited evidence item (both key and contrary — distinguished by `supports_thesis`), with `credibility_tier`, `duplicate_of_id` (resolved during persistence, see `EVIDENCE_PIPELINE.md`), `flagged_injection`/`injection_notes`. |
| `analysis_scores` | The Opportunity Score audit trail — see `OPPORTUNITY_SCORING.md`. |
| `analysis_catalysts` | Catalysts and important dates, `kind` discriminates the two. |
| `analysis_assumptions` / `analysis_unknowns` | Simple ordered string lists. |
| `model_versions` / `prompt_versions` | Registries — see `MODEL_VERSIONING.md`. |
| `analysis_runs` / `analysis_failures` | Batch-run bookkeeping — see `COST_CONTROLS.md`. |
| `latest_analyses` (view) | `select distinct on (market_id) * from analyses order by market_id, analyzed_at desc` — the current record per market, `security_invoker` so it respects the underlying RLS. |

### Design decision: why both `analyses.key_evidence` (jsonb) and `analysis_evidence` (table)

The jsonb array on `analyses` is the verbatim snapshot of what Claude
returned — cheap to read alongside the rest of the analysis, no join. The
`analysis_evidence` table is the pipeline-processed version: independently
corroborated duplicates, credibility weights, injection flags — the
structured, queryable, auditable form the scoring engine and admin
tooling actually use. They're expected to agree in content but serve
different readers.

### Why `assumptions`/`unknowns`/`catalysts` are tables but `bullCase`/`bearCase` aren't

Assumptions, unknowns, and catalysts are explicitly-named, orderable lists
with their own semantics (catalysts have a kind/date/importance).
`bullCase`, `bearCase`, `keyEvidence` (duplicated per above),
`contraryEvidence`, and `invalidationConditions` are flat string/object
arrays with no additional structure worth a table — they're stored as
`jsonb` directly on `analyses`.

### Immutability

`reject_analysis_mutation()` — a `BEFORE UPDATE OR DELETE` trigger applied
to `analyses`, `analysis_evidence`, `analysis_scores`,
`analysis_catalysts`, `analysis_assumptions`, and `analysis_unknowns` —
raises an exception on any attempted mutation, including from the
service-role client (stronger than RLS alone, which the service role
bypasses). Verified empirically against a real Postgres instance: valid
inserts succeed, the probability-ordering check constraint rejects bad
data, and both UPDATE and DELETE are rejected with a descriptive error.
