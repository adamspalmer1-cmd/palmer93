import "server-only";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";

/**
 * Shared authorization check for every cron/ingestion route. Vercel Cron
 * invokes routes with `GET` and an `Authorization: Bearer <CRON_SECRET>`
 * header (when the env var is literally named `CRON_SECRET`); the
 * `x-ingest-secret` header is also accepted for manual/local triggering
 * with either verb.
 */
export function isCronAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const bearerMatch = authHeader?.match(/^Bearer (.+)$/);
  const provided = bearerMatch?.[1] ?? request.headers.get("x-ingest-secret");
  return Boolean(provided) && provided === env.cronSecret();
}
