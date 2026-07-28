"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AiAnalysis } from "@/types/database.types";

const signalTone: Record<AiAnalysis["signal"], "positive" | "negative" | "neutral"> = {
  undervalued: "positive",
  overvalued: "negative",
  neutral: "neutral",
};

export function AiSignalPanel({ marketId, isAuthenticated }: { marketId: string; isAuthenticated: boolean }) {
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/markets/${marketId}/analyze`)
      .then((res) => res.json())
      .then((data) => setAnalysis(data.analysis))
      .catch(() => {});
  }, [marketId]);

  async function runAnalysis() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/markets/${marketId}/analyze`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      setAnalysis(data.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" /> AI Signal
        </CardTitle>
        <Button
          size="sm"
          variant="secondary"
          onClick={runAnalysis}
          disabled={loading || !isAuthenticated}
          title={isAuthenticated ? undefined : "Sign in to run AI analysis"}
        >
          {loading ? "Analyzing…" : "Run analysis"}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && <p className="text-sm text-negative">{error}</p>}
        {!analysis && !error && (
          <p className="text-sm text-muted">
            {isAuthenticated
              ? "No analysis yet — run one to get an AI-generated research signal for this market."
              : "Sign in to run an AI-generated research signal for this market."}
          </p>
        )}
        {analysis && (
          <>
            <div className="flex items-center gap-2">
              <Badge tone={signalTone[analysis.signal]}>{analysis.signal}</Badge>
              <span className="text-xs text-muted">
                Confidence {Math.round(analysis.confidence * 100)}%
              </span>
            </div>
            <p className="text-sm text-foreground">{analysis.summary}</p>
            <p className="text-sm text-muted">{analysis.reasoning}</p>
          </>
        )}
        <p className="text-xs text-muted">
          Research only — not financial advice. MarketSignal never places trades.
        </p>
      </CardContent>
    </Card>
  );
}
