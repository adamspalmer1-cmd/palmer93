import { Badge } from "@/components/ui/badge";
import type { RecommendationStatus, ResolutionRiskLevel } from "@/lib/ai/analysis-schema";

type Tone = "neutral" | "positive" | "negative" | "accent";

const recommendationTone: Record<RecommendationStatus, Tone> = {
  PASS: "neutral",
  WATCH: "accent",
  RESEARCH: "accent",
  "POSSIBLE EDGE": "positive",
  "INSUFFICIENT DATA": "negative",
};

const riskTone: Record<ResolutionRiskLevel, Tone> = {
  LOW: "positive",
  MEDIUM: "accent",
  HIGH: "negative",
  CRITICAL: "negative",
};

export function RecommendationBadge({ status }: { status: string }) {
  return <Badge tone={recommendationTone[status as RecommendationStatus] ?? "neutral"}>{status}</Badge>;
}

export function ResolutionRiskBadge({ level }: { level: string }) {
  return <Badge tone={riskTone[level as ResolutionRiskLevel] ?? "neutral"}>{level}</Badge>;
}
