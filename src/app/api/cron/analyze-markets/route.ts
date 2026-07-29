import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronAuthorized } from "@/lib/sync/cron-auth";
import { runBatchAnalysis } from "@/lib/ai/batch-engine";

/**
 * Batch-triggers the AI Opportunity Engine across eligible markets. Same
 * auth model as the other cron/ingestion jobs (docs/10-data-pipeline.md):
 * `CRON_SECRET` via `Authorization: Bearer` (Vercel Cron) or
 * `x-ingest-secret` (manual/local triggering). Optional query params:
 * `category`, `resumeFromRunId` (retry just a prior run's failures).
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const category = params.get("category") ?? undefined;

  let resumeFromRunId: number | undefined;
  const resumeParam = params.get("resumeFromRunId");
  if (resumeParam !== null) {
    const parsed = Number(resumeParam);
    if (!Number.isFinite(parsed)) {
      return NextResponse.json({ error: "resumeFromRunId must be a number" }, { status: 400 });
    }
    resumeFromRunId = parsed;
  }

  try {
    const summary = await runBatchAnalysis(createAdminClient(), {
      filters: category ? { category } : undefined,
      resumeFromRunId,
    });
    return NextResponse.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown batch analysis error";
    return NextResponse.json({ status: "failed", error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
