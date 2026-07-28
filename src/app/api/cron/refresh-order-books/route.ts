import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronAuthorized } from "@/lib/sync/cron-auth";
import { refreshOrderBooks } from "@/lib/services/sync.service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 25;

/**
 * Refreshes best bid/ask/mid/spread from the live CLOB order book for the
 * highest-volume active markets, and records a deduplicated price
 * snapshot. See docs/10-data-pipeline.md § refresh-order-books.
 */
async function handle(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await refreshOrderBooks(createAdminClient(), BATCH_SIZE);
    return NextResponse.json({ status: result.failed > 0 ? "partial" : "success", ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown refresh-order-books error";
    return NextResponse.json({ status: "failed", error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
