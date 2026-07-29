import "server-only";
import { createClient } from "@/lib/supabase/server";
import * as analysisDetailService from "@/lib/services/analysis-detail.service";

export async function getLatestFullAnalysis(marketId: string) {
  const supabase = await createClient();
  return analysisDetailService.getLatestFullAnalysis(supabase, marketId);
}

export async function getAnalysisHistory(marketId: string, limit?: number) {
  const supabase = await createClient();
  return analysisDetailService.getAnalysisHistory(supabase, marketId, limit);
}
