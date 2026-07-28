import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";

/**
 * Server Component / Route Handler client. Bound to the request's cookies so
 * `auth.getUser()` reflects the current session. Writing cookies from a
 * Server Component (not a Route Handler/Server Action) is a no-op; the
 * middleware/proxy is responsible for refreshing the session cookie there.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component during render — safe to ignore
            // because the proxy (middleware) refreshes the session cookie.
          }
        },
      },
    },
  );
}
