# Evidence Pipeline

`lib/ai/evidence-pipeline.ts` post-processes the evidence Claude cites
(`keyEvidence` + `contraryEvidence` from `lib/ai/analysis-schema.ts`)
before anything from the web reaches a scoring rule or a rendered page.
Called once, on the concatenation of both lists, by
`runSingleMarketAnalysis` (`lib/ai/analyze-market.ts`) — so a "contrary"
item that repeats a "key" item's source is still caught as a duplicate.

## Independent duplicate detection

Claude is asked to set `duplicateOfTitle` on evidence items itself, but
`detectDuplicateEvidence()` doesn't just trust that. For every item Claude
left unflagged, it checks earlier items (in citation order) for:

1. An exact normalized URL match (hostname + path, query string and
   trailing slash ignored), or
2. Token-Jaccard title similarity ≥ 0.8 (near-identical headlines with
   different outlets/punctuation).

A match Claude already flagged (`duplicateOfTitle` present) is trusted as-
is and recorded with source `"model"`; an independently-found match is
recorded as `"url-match"` or `"title-similarity"`. This matters for
`evidenceQualityScore` (`OPPORTUNITY_SCORING.md`), which excludes
duplicates from the "unique corroborating sources" count — five outlets
republishing the same wire story shouldn't score like five independent
confirmations.

## Credibility weighting

Claude tiers each evidence item 1 (most credible) through 6, per a fixed
rubric it's given in the system prompt (`CREDIBILITY_TIERS` in
`lib/ai/analysis-schema.ts`):

1. Primary source (official filings, government data, direct statements,
   court records)
2. Major wire services / primary financial data providers
3. Established, editorially-reviewed news organizations
4. Trade publications and specialist/industry press
5. Opinion/analysis from credentialed but non-primary sources
6. Blogs, social media, forums, anonymous/unverified sources

`runEvidencePipeline()` maps each tier to a weight (`evidenceCredibilityWeights`
in `lib/ai/cost-controls.ts`'s `OpportunityScoringConfig`, shared with the
scoring engine so both stay in sync) and attaches it to every item as
`credibilityWeight` for downstream use.

## Prompt-injection detection (evidence-level)

`detectPromptInjectionAttempts()` scans an evidence item's `title` and
`excerpt` for text patterns indicating an attempt to redirect the model's
behavior from inside retrieved content — instruction overrides ("ignore
previous instructions"), role hijacks ("you are now a..."), system-prompt
probes, fake system/assistant directives, attempts to dictate the
resolution outcome, or attempts to directly manipulate scoring/output
fields. See `PROMPT_SECURITY.md` for the full defense-in-depth picture;
this is one layer of it, specifically for evidence text.

Matches are **detection and logging only** — `flaggedInjection` and
`injectionNotes` are attached to the item and persisted
(`analysis_evidence.flagged_injection`/`injection_notes`), surfaced as a
warning badge on the market detail page, and folded into the analysis's
top-level `prompt_injection_flags`. Nothing here blocks persistence,
executes instructions, or changes the pipeline's own output shape — a
flagged item still gets a `credibilityWeight`, still participates in
duplicate detection, and is still stored exactly like any other item,
just with the flag attached.

## Output

`ProcessedEvidenceItem` (the pipeline's output type) extends the raw
`EvidenceItem` with `effectiveDuplicateOfTitle`, `duplicateDetectionSource`,
`credibilityWeight`, `flaggedInjection`, and `injectionNotes`. This is
exactly what `persistAnalysis()` (`lib/services/analysis-persistence.service.ts`)
maps onto `analysis_evidence` rows — inserted one at a time, in citation
order, so a later duplicate's `duplicate_of_id` can resolve to an earlier
row's real (already-immutable) id.
