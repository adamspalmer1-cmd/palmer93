import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getAiEngineMetrics } from "@/lib/services/ai-engine-metrics.service";
import type { CostControlsConfig } from "@/lib/ai/cost-controls";

export async function getAiEngineMetricsForRequest(config?: CostControlsConfig) {
  const supabase = await createClient();
  return getAiEngineMetrics(supabase, config);
}
