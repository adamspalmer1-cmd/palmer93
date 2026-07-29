# Testing

```bash
npm test           # Vitest — unit + component tests
npm run typecheck   # tsc --noEmit
npm run lint         # ESLint
npm run build         # production build (also type-checks)
```

## No live services in the unit suite

The unit test suite never touches a real database, a real Polymarket API,
or a real Anthropic API — every test in `tests/unit/*.test.ts` runs
against fakes/mocks. This is a hard requirement for the AI Opportunity
Engine specifically: **no paid API calls in the unit test suite.**

## The `Db`-injection pattern

Every function under `lib/services/*.service.ts` and `lib/ai/*.ts` that
touches the database takes its Supabase client as a parameter
(`db: Db`, `Db = SupabaseClient<Database>`) instead of constructing one
internally. That's what makes them testable without a request context or
a live database — tests pass `tests/helpers/fake-supabase.ts`'s
`createFakeDb()`, an in-memory stand-in covering exactly the query-builder
operations the codebase actually issues (`eq`, `is`, `not`, `lt`/`gt`/
`gte`, `in`, `ilike`, `order`, `limit`, `range`, `maybeSingle`/`single`,
`insert`/`update`/`upsert`, plus `select(..., {count, head})`). It is not
a general PostgREST reimplementation — if a new service needs an
operation the fake doesn't support, extend the fake rather than reaching
for a real database in a unit test.

`tableRows(db, "tableName")` reads a fake table back for assertions,
properly typed as `Row[]` rather than `any[]`.

`lib/queries/*.ts` are the thin, request-scoped wrappers (construct the
real cookie-bound Supabase client, call the service) that Server
Components/Route Handlers actually import. They're intentionally
untested directly — there's no logic in them beyond "get a client, call
the service" — the service function underneath is what's tested.

## `"server-only"` modules

Any module that imports `"server-only"` throws immediately if imported
outside Next's react-server condition — which includes plain Vitest.
Two patterns handle this, and the choice between them isn't arbitrary:

1. **Extract the pure logic out of the `server-only` module** when the
   thing being tested doesn't actually need the server-only guarantee —
   e.g. `lib/polymarket/order-book-math.ts`'s `computeMidAndSpread()` is
   pure math, pulled out of `clob.ts` (which owns the actual HTTP calls
   and rightly stays `server-only`) specifically so it's directly
   importable in tests. Prefer this when most of a module's value is a
   pure function.
2. **Mock `"server-only"` itself** (`vi.mock("server-only", () => ({}))`
   at the top of the test file, before any other import) when the module
   under test genuinely needs to be server-only in production but its
   logic is what you're testing — e.g. `lib/ai/analysis-model.ts`,
   `lib/ai/analyze-market.ts`, `lib/ai/batch-engine.ts`. This makes the
   import a no-op for the test process only; production behavior is
   unaffected since the mock never ships.

## Mocking the Anthropic client

`lib/ai/analysis-model.ts::runAnalysisModelCall` accepts an optional
`client` in its options — tests construct a fake
`{ messages: { parse: vi.fn(...) } }` cast as `Anthropic` and pass it
directly, so `new Anthropic(...)` (which would require a real API key) is
never called. See `tests/unit/analysis-model.test.ts` for the full
pattern, including simulating `pause_turn` resumption, `refusal`
stop-reason, invalid-output retry exhaustion, and transient
(429/5xx-classified) API-error retry via a real `Anthropic.APIError`
instance (constructing the error class is free — no network call).

Modules one layer up (`lib/ai/analyze-market.ts`,
`lib/ai/batch-engine.ts`) mock their dependencies wholesale with
`vi.mock("@/lib/...", () => ({ ... }))` — the same "mock the whole module"
pattern the Phase 1.5 sync-service tests use for `gamma.ts`/`clob.ts` —
rather than re-mocking the Anthropic client at every layer.

## What isn't unit-tested, and why

- **UI components** beyond the trivial (`ProbabilityPill` is the one
  existing example, `tests/components/`). Everything else — pages, the
  analysis panel, the scanner table, the price chart — is verified by
  starting the dev server and checking auth-gating/rendering/build output
  directly, and by the production build's type-checking + static
  generation. This matches the pre-existing Phase 1/1.5 convention; there
  was no component-testing pattern established for this project to
  extend.
- **API route handlers** (`app/api/**/route.ts`). No route-level test
  harness exists in this codebase; routes are thin (auth check, call a
  service/pipeline function, map the result to a status code) and are
  verified live (curl against the dev server for auth gating and error
  shapes) plus by the production build successfully registering them.
- **The immutability trigger and the rest of migration 0007** were
  verified against a real local Postgres instance during development
  (valid inserts, the probability-ordering check constraint, and UPDATE/
  DELETE rejection on `analyses`) rather than as an automated Vitest
  test — migrations in this codebase are schema, not application logic,
  and there's no existing precedent for a live-database test in the unit
  suite.

## Coverage map (AI Opportunity Engine)

Every non-trivial `lib/ai/*` and Phase-2 `lib/services/*` file has a
directly corresponding `tests/unit/*.test.ts`:

`analysis-schema` · `opportunity-scoring` · `evidence-pipeline` ·
`cost-controls` · `analysis-model` · `analysis-eligibility-service` ·
`reanalysis-service` · `analysis-context-service` ·
`analysis-persistence-service` · `analyze-market` · `analysis-runs-service` ·
`batch-engine` · `opportunity-scanner-service` · `scanner-filters` ·
`analysis-detail-service` · `ai-engine-metrics-service`.
