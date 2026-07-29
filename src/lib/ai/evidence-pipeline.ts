import type { EvidenceItem } from "@/lib/ai/analysis-schema";
import { DEFAULT_SCORING_CONFIG, type OpportunityScoringConfig } from "@/lib/ai/opportunity-scoring";

/**
 * Post-processes the evidence Claude cites in a structured analysis output:
 * independently corroborates (rather than blindly trusts) its self-reported
 * duplicate flags, and scans evidence text for embedded instructions before
 * anything from the web ever reaches a scoring rule or a rendered page.
 *
 * Nothing in this module executes instructions found in evidence content —
 * `detectPromptInjectionAttempts` only classifies text for logging/flagging,
 * per the prompt-injection defense described in docs/PROMPT_SECURITY.md.
 */

function normalizeUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.hostname.toLowerCase()}${path.toLowerCase()}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

function tokenSet(title: string): Set<string> {
  return new Set(normalizeTitle(title).split(" ").filter((t) => t.length > 2));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const TITLE_SIMILARITY_DUPLICATE_THRESHOLD = 0.8;

export interface EvidenceWithDuplicateDetection extends EvidenceItem {
  /** duplicateOfTitle from Claude's own output, or independently detected — never both silently dropped. */
  effectiveDuplicateOfTitle: string | null;
  duplicateDetectionSource: "model" | "url-match" | "title-similarity" | null;
}

/**
 * Fills in duplicate detection Claude may have missed, by comparing each
 * item against every earlier item (in citation order) for an exact
 * normalized URL match or near-identical title. Never overrides a
 * duplicate Claude already flagged — only adds detections for items Claude
 * left as originals.
 */
export function detectDuplicateEvidence(evidence: EvidenceItem[]): EvidenceWithDuplicateDetection[] {
  const result: EvidenceWithDuplicateDetection[] = [];

  for (const item of evidence) {
    if (item.duplicateOfTitle) {
      result.push({ ...item, effectiveDuplicateOfTitle: item.duplicateOfTitle, duplicateDetectionSource: "model" });
      continue;
    }

    const normalizedUrl = normalizeUrl(item.url);
    const titleTokens = tokenSet(item.title);

    let matchTitle: string | null = null;
    let matchSource: "url-match" | "title-similarity" | null = null;

    for (const earlier of result) {
      if (normalizedUrl && normalizeUrl(earlier.url) === normalizedUrl) {
        matchTitle = earlier.title;
        matchSource = "url-match";
        break;
      }
      const similarity = jaccardSimilarity(titleTokens, tokenSet(earlier.title));
      if (similarity >= TITLE_SIMILARITY_DUPLICATE_THRESHOLD) {
        matchTitle = earlier.title;
        matchSource = "title-similarity";
        break;
      }
    }

    result.push({ ...item, effectiveDuplicateOfTitle: matchTitle, duplicateDetectionSource: matchSource });
  }

  return result;
}

/**
 * Text patterns indicating an attempt to redirect the model's behavior from
 * inside retrieved/external content — market descriptions, evidence
 * excerpts, fetched web pages. Detection only: matches are logged and
 * surfaced, never executed or allowed to change scoring, tool permissions,
 * or output schema. Kept intentionally narrow (favor false negatives over
 * flooding logs with false positives) since this only drives a warning
 * flag, not a hard block.
 */
export const SUSPICIOUS_INJECTION_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "instruction override", pattern: /ignore\s+(all|any|the)?\s*(previous|prior|above)?\s*(instructions|prompt|rules)/i },
  { label: "instruction override", pattern: /disregard (all|any|the)?\s*(previous|prior|above)/i },
  { label: "role hijack", pattern: /you are now (a|an)\b/i },
  { label: "system prompt probe", pattern: /(reveal|print|repeat|show)\s+(your|the)\s+(system prompt|instructions)/i },
  { label: "fake system directive", pattern: /^\s*(system|assistant)\s*:\s*/im },
  {
    label: "scoring/output manipulation",
    pattern: /(set|force|override)\s+(the\s+)?(opportunity\s?score|opportunityScore|recommendation\s?status|recommendationStatus|confidence\s?score|confidenceScore)/i,
  },
  { label: "resolution dictation", pattern: /this (market|question) (must|should|will) resolve (yes|no)/i },
  { label: "schema manipulation", pattern: /(respond|output|return)\s+(only\s+)?(in\s+)?(plain text|unstructured|without json)/i },
];

/** Scans a single piece of text and returns the human-readable labels of every suspicious pattern it matches. */
export function detectPromptInjectionAttempts(text: string): string[] {
  if (!text) return [];
  const matches = new Set<string>();
  for (const { label, pattern } of SUSPICIOUS_INJECTION_PATTERNS) {
    if (pattern.test(text)) matches.add(label);
  }
  return Array.from(matches);
}

export interface ProcessedEvidenceItem extends EvidenceWithDuplicateDetection {
  credibilityWeight: number;
  flaggedInjection: boolean;
  injectionNotes: string | null;
}

/**
 * Full pipeline pass over one analysis's cited evidence: independent
 * duplicate corroboration, credibility-tier weighting (shared with the
 * opportunity-scoring config so both stay in sync), and prompt-injection
 * scanning of title + excerpt. Output maps directly onto
 * `analysis_evidence` rows (duplicate_of_id is resolved by the persistence
 * layer once rows have ids; this pipeline only resolves duplicates by
 * title).
 */
export function runEvidencePipeline(
  evidence: EvidenceItem[],
  config: OpportunityScoringConfig = DEFAULT_SCORING_CONFIG,
): ProcessedEvidenceItem[] {
  return detectDuplicateEvidence(evidence).map((item) => {
    const flaggedTitle = detectPromptInjectionAttempts(item.title);
    const flaggedExcerpt = detectPromptInjectionAttempts(item.excerpt ?? "");
    const allFlags = Array.from(new Set([...flaggedTitle, ...flaggedExcerpt]));

    return {
      ...item,
      credibilityWeight: config.evidenceCredibilityWeights[item.credibilityTier as 1 | 2 | 3 | 4 | 5 | 6] ?? 0,
      flaggedInjection: allFlags.length > 0,
      injectionNotes: allFlags.length > 0 ? `Suspicious pattern(s) detected: ${allFlags.join(", ")}` : null,
    };
  });
}
