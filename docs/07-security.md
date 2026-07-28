# 7. Security Considerations

## Secrets & credentials

- `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `CRON_SECRET` are
  server-only env vars (no `NEXT_PUBLIC_` prefix) — never bundled into
  client JS. Only `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` are exposed to the browser, which is safe
  by design since the anon key is meant to be public and all access is
  gated by RLS.
- `.env.example` documents every variable with placeholder values; `.env*`
  is git-ignored.
- The Supabase **service-role** client (`lib/supabase/admin.ts`, bypasses
  RLS) is imported only in server-only modules (`api/ingest/*`) — never in
  a Client Component or anything reachable from `app/**/page.tsx` client
  bundles. A lint rule / code-review note calls this out explicitly.

## Row Level Security (RLS)

- RLS is enabled on every table. `events`, `markets`, `price_snapshots`,
  `categories` are readable by anyone (`select` policy `using (true)`) since
  they're public research data, but writes are restricted to the
  service-role key (i.e., no `insert`/`update`/`delete` policy for
  `anon`/`authenticated` — only the service role, which bypasses RLS,
  performs writes from the ingestion job).
- `profiles`, `watchlist_items` are scoped with `using (auth.uid() = user_id)`
  (or `= id` for profiles) for both read and write.
- `ai_analyses` is public-read (it's research output tied to a public
  market) but service-role-only write (written by the trusted API route
  after validating Claude's output, not directly by the client).

## Input validation

- Every API route handler validates its input with `zod` before touching
  the database or an upstream API — including search/filter query params,
  not just POST bodies — to prevent malformed or oversized queries.
- Polymarket API responses are parsed through `zod` schemas
  (`lib/polymarket/types.ts`) before normalization, so an unexpected
  upstream shape fails loudly (logged, run marked `partial`/`failed`)
  instead of corrupting our DB.
- Claude's structured output is parsed/validated with `zod` before being
  persisted or shown to a user — never render raw model output as HTML
  (render as plain text/markdown through a sanitizing renderer only).

## Injection & XSS

- All DB access goes through the Supabase client (parameterized queries) —
  no raw string-interpolated SQL anywhere.
- Market questions/descriptions from Polymarket are user-generated-ish
  content (market creators) — rendered as plain text in React (which
  escapes by default); if markdown rendering is ever added for AI
  summaries, use a sanitizing markdown renderer, never `dangerouslySetInnerHTML`
  on raw text.

## Abuse / cost control

- The Claude analysis endpoint requires authentication and is cached by
  content hash (`ai_analyses`), sharply limiting duplicate spend; a
  per-user/hour rate limit is called out as a near-term hardening item
  (roadmap, Phase 2) once real usage patterns are known.
- The ingestion endpoint is not publicly invokable (shared-secret header),
  preventing third parties from triggering excess Polymarket API load or
  Supabase writes on our behalf.

## Transport & headers

- Vercel enforces HTTPS by default. `next.config.ts` sets standard security
  headers (`X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, `X-Frame-Options: DENY`) via
  `headers()`.
- Supabase auth cookies are HTTP-only and `Secure` (handled by
  `@supabase/ssr` in production).

## Explicitly out of scope (by product design, not an oversight)

- No custody of user funds, private keys, or wallets — MarketSignal never
  needs L1/L2 Polymarket trading credentials, which removes an entire class
  of key-management risk that a trading bot would otherwise carry.
- No execution of trades on the user's behalf, ever.

## Dependency & platform hygiene

- Dependabot/`npm audit` in CI (Phase 1 CI is minimal — lint/typecheck/test/
  build — but the hook point is established for this).
- Supabase migrations are version-controlled SQL (`supabase/migrations`),
  reviewed like any other code change, not applied ad hoc via the dashboard.
