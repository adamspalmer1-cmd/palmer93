import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMarketById } from "@/lib/services/markets.service";
import { getLatestAnalysis } from "@/lib/services/reanalysis.service";
import { runSingleMarketAnalysis } from "@/lib/ai/analyze-market";

/**
 * On-demand AI Opportunity Engine analysis for a single market (distinct
 * from the legacy `/api/markets/[id]/analyze` Phase 1 signal route, which
 * writes to the old `ai_analyses` cache table). POST triggers a new
 * analysis through the full pipeline; GET returns the latest immutable
 * record without triggering one.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  try {
    const market = await getMarketById(admin, id);
    if (!market) {
      return NextResponse.json({ error: "Market not found" }, { status: 404 });
    }

    const forceReanalysis = request.nextUrl.searchParams.get("force") === "true";

    const outcome = await runSingleMarketAnalysis(admin, market, { forceReanalysis });

    switch (outcome.status) {
      case "ok":
        return NextResponse.json({ status: "ok", analysis: outcome.analysis });
      case "skipped":
        return NextResponse.json({ status: "skipped", reason: outcome.reason }, { status: 409 });
      case "refused":
        return NextResponse.json({ status: "refused", message: outcome.message }, { status: 422 });
      case "invalid_output":
        return NextResponse.json({ status: "invalid_output", errors: outcome.errors }, { status: 502 });
      case "error":
        return NextResponse.json({ status: "error", error: outcome.error }, { status: 500 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed";
    return NextResponse.json({ status: "error", error: message }, { status: 500 });
  }
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createClient();

  try {
    const latest = await getLatestAnalysis(supabase, id);
    return NextResponse.json({ analysis: latest ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load analysis";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
