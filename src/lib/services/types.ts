import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * Every service in `lib/services` takes its Supabase client as a parameter
 * instead of constructing one internally. That's what makes them
 * independently testable: a test can pass a fake/mock client without
 * needing Next.js request context, cookies, or a live database.
 */
export type Db = SupabaseClient<Database>;
