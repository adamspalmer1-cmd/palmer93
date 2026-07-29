# Model & Prompt Versioning

Every analysis records exactly which model, which prompt, and which
scoring formula produced it — first-class, queryable, and never mutated
after the fact, so results stay reproducible and auditable as all three
evolve independently.

## The three version identifiers

| Column on `analyses` | Set from | Meaning |
|---|---|---|
| `model_version` | `ANALYSIS_MODEL` (`lib/ai/analysis-model.ts`) | The Claude model id used, e.g. `claude-opus-5`. Reads `ANTHROPIC_MODEL` env var, falls back to `claude-opus-5`. |
| `prompt_version` | `PROMPT_VERSION_ID` (`lib/ai/analyze-market.ts`), currently `"opportunity-analysis-v1"` | Identifies the system prompt template in use. |
| `scoring_version` | `SCORING_VERSION` (`lib/ai/opportunity-scoring.ts`), currently `"opportunity-score-v1"` | Identifies the deterministic scoring formula in use. |

## Registries

`model_versions` and `prompt_versions` are append-only registries —
`ensureModelVersion()`/`ensurePromptVersion()`
(`lib/services/analysis-persistence.service.ts`) insert a row the first
time an id is used and are a no-op on every call after that. `prompt_versions.template`
stores the actual system prompt text (`buildAnalysisSystemPrompt()`'s
output) at first use, so the exact wording behind any historical
`prompt_version` id is always recoverable, not just its id.

`scoring_version` has no registry table — it's a plain string column on
`analyses` and `analysis_scores`, since the formula itself lives in
version-controlled code (`lib/ai/opportunity-scoring.ts`) rather than
needing a database row to describe it.

## Bumping a version

None of the three should ever change meaning in place:

- **Model**: change `ANTHROPIC_MODEL` (or the `ANALYSIS_MODEL` fallback).
  A new model id automatically registers itself in `model_versions` on
  first use; old analyses keep the id of whatever model actually produced
  them.
- **Prompt**: editing `buildAnalysisSystemPrompt()`'s wording in a way
  that changes what's being asked should come with bumping
  `PROMPT_VERSION_ID` to a new string (e.g. `"opportunity-analysis-v2"`).
  Cosmetic-only changes that don't affect the model's task don't need a
  bump, but when in doubt, bump — the registry is append-only and cheap.
- **Scoring**: any change to the weights, thresholds, or structure in
  `lib/ai/opportunity-scoring.ts` should come with bumping
  `SCORING_VERSION`. Because scores are computed outside the model and
  never stored without their scoring version, re-scoring a market under a
  new formula is always a genuinely new analysis (new row), never a
  silent reinterpretation of an old one.

## Why this matters for immutability

`analyses` rows are insert-only (`ANALYSIS_SCHEMA.md`, the DB trigger).
Version columns are what make that safe to build on: comparing an old
analysis to a new one is meaningful precisely because you know whether
the model, prompt, or scoring formula changed between them, rather than
silently comparing apples to oranges.
