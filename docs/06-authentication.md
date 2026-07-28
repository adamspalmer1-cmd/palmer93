# 6. Authentication Strategy

## Provider: Supabase Auth

- Email/password + magic link for Phase 1. OAuth (Google) is a low-effort
  Phase 2 add-on (Supabase supports it natively) but not required for the
  foundation.
- Supabase issues a JWT session stored in HTTP-only cookies via
  `@supabase/ssr`, which is the current (2026) recommended package for
  Next.js App Router integration (replacing the deprecated
  `@supabase/auth-helpers-nextjs`).

## Session handling in Next.js App Router

- `middleware.ts` runs on every request, using `createServerClient` from
  `@supabase/ssr` to read/refresh the session cookie and re-issue it if
  near expiry — this keeps server components' `getUser()` calls fast and
  correct without a client-side round trip.
- Server Components use `lib/supabase/server.ts` (cookie-bound client) to
  call `supabase.auth.getUser()` for the authoritative, revalidated user —
  never trust `getSession()` alone in server contexts, since it doesn't
  re-verify the JWT against Supabase.
- Client Components (auth forms, user menu) use `lib/supabase/client.ts`
  (browser client) for sign-in/sign-up/sign-out calls, which write the
  session cookie via the `@supabase/ssr` cookie adapter.

## Route protection

- Dashboard route group `(dashboard)` is guarded in its `layout.tsx`: no
  authenticated user → `redirect('/login')`.
- Landing page, market list, category pages, and individual market detail
  pages are **publicly viewable** (read-only research is the product's core
  value — we don't want to gate discovery behind a login wall). Auth is
  required for anything user-specific (future watchlists, saved analyses).
- `/api/ingest/markets` is protected by a server-only shared secret, not
  Supabase Auth (it's a machine-to-machine cron call, not a user).
- `/api/markets/[id]/analyze` requires a logged-in user (checked via
  `getUser()` in the route handler) to prevent anonymous abuse of the
  Claude API budget.

## Identity model

- `auth.users` (Supabase-managed) is the source of truth for credentials.
- A Postgres trigger (`handle_new_user`) inserts a matching `profiles` row
  on signup, so app code always joins against `profiles` rather than
  reaching into the `auth` schema directly.

## What Phase 1 does NOT include

- No wallet-connect / Web3 login (MarketSignal doesn't need users' Polygon
  wallets — it never trades on their behalf).
- No roles/permissions system beyond "authenticated" vs "anonymous" — an
  admin role for managing ingestion is a future-phase concern.
