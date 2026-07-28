import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronAuthorized } from "@/lib/sync/cron-auth";
import { syncMarkets } from "@/lib/services/sync.service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Fetches active events/markets from Polymarket's Gamma API and upserts
 * them into Supabase, one event at a time so a single bad event doesn't
 * abort the batch. See docs/10-data-pipeline.md § sync-markets.
 */
async function handle(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncMarkets(createAdminClient());
    return NextResponse.json({ status: result.marketsFailed > 0 ? "partial" : "success", ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync-markets error";
    return NextResponse.json({ status: "failed", error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
