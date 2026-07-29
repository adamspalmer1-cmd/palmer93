"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function RunAnalysisButton({
  marketId,
  hasAnalysis,
  isAuthenticated,
}: {
  marketId: string;
  hasAnalysis: boolean;
  isAuthenticated: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/markets/${marketId}/analysis`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        const message: string =
          data.reason ?? data.message ?? data.error ?? (Array.isArray(data.errors) ? data.errors.join("; ") : undefined) ?? "Analysis failed";
        throw new Error(message);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="secondary"
        onClick={run}
        disabled={loading || !isAuthenticated}
        title={isAuthenticated ? undefined : "Sign in to run AI analysis"}
      >
        {loading ? "Analyzing…" : hasAnalysis ? "Re-run analysis" : "Run analysis"}
      </Button>
      {error && <span className="max-w-xs text-right text-xs text-negative">{error}</span>}
    </div>
  );
}
