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
  performs writes from the sync jobs).
- `profiles`, `watchlist_items` are scoped with `using (auth.uid() = user_id)`
  (or `= id` for profiles) for both read and write.
- `ai_analyses` is public-read (it's research output tied to a public
  market) but service-role-only write (written by the trusted API route
  after validating Claude's output, not directly by the client).
- **Phase 1.5 RLS tightening:** `ingestion_runs` was public-read in Phase 1;
  it's now restricted to `using (auth.uid() is not null)` (any signed-in
  user), since sync run metadata and error messages are operational data,
  not research data, and shouldn't be exposed to anonymous visitors.
  `sync_failures` (new) uses the same signed-in-only read policy. Both
  remain service-role-only for writes.
- **Admin surface has no role system yet.** The `/admin/health` dashboard
  (Phase 1.5) is gated only by "is signed in", the same as `ingestion_runs`/
  `sync_failures` RLS — Phase 1's authentication doc explicitly scoped out
  an admin/role system, and Phase 1.5 doesn't add one. Any authenticated
  user can currently view pipeline health and error history. Restricting
  this to a real admin role is a near-term hardening item (roadmap).

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
- Every ingestion/cron endpoint (`/api/ingest/markets` and the three
  `/api/cron/*` routes) shares the same `CRON_SECRET`-gated authorization
  check (`lib/sync/cron-auth.ts`) and is not publicly invokable, preventing
  third parties from triggering excess Polymarket API load or Supabase
  writes on our behalf.

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

## Database review (Phase 1.5)

- **Foreign keys reviewed, no changes needed.** `markets.event_id ->
  events.id` (`on delete cascade`), `price_snapshots.market_id ->
  markets.id` (`cascade`), `watchlist_items.market_id`/`ai_analyses.market_id
  -> markets.id` (`cascade`), and the new `sync_failures.market_id`/`event_id`
  (`on delete set null`, so a failure record survives the market/event
  it referenced being deleted) all already had correct, intentional
  `on delete` behavior. This also means "broken event links" — a market
  pointing at a nonexistent event — cannot occur through normal writes; the
  data-quality check for it exists as a defensive, cheap canary rather than
  a check expected to ever fire (see `lib/services/data-quality.service.ts`).
- **Query performance reviewed.** The indexes added in migration
  `0006_data_integrity.sql` target the queries introduced by the health
  dashboard and background jobs specifically (staleness checks, archival
  filters, per-job run history) rather than being added speculatively —
  see `04-database-schema.md` for the full list.

## Dependency & platform hygiene

- Dependabot/`npm audit` in CI (Phase 1 CI is minimal — lint/typecheck/test/
  build — but the hook point is established for this).
- Supabase migrations are version-controlled SQL (`supabase/migrations`),
  reviewed like any other code change, not applied ad hoc via the dashboard.
