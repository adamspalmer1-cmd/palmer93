import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronAuthorized } from "@/lib/sync/cron-auth";
import { archiveMarkets } from "@/lib/services/sync.service";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const GRACE_DAYS = 3;

/**
 * Retires markets that have been closed for at least `GRACE_DAYS` from the
 * active sync/order-book set. See docs/10-data-pipeline.md § archive-markets.
 */
async function handle(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await archiveMarkets(createAdminClient(), GRACE_DAYS);
    return NextResponse.json({ status: "success", ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown archive-markets error";
    return NextResponse.json({ status: "failed", error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
