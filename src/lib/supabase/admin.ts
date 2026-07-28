import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { env } from "@/lib/env";

/**
 * Service-role client that bypasses Row Level Security. Server-only —
 * imported exclusively by the ingestion route and other trusted background
 * jobs. Never import this module from a Client Component or anything that
 * ends up in a browser bundle.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
