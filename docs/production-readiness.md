# GapFill — Production Readiness Audit & Architecture Map

**Repository:** GapFill (Short-Term Rental Orphan-Night Revenue Intelligence)  
**Stack:** Next.js `15.5.29` (App Router) · React `19.2.1` · TypeScript `5.9.3` · Tailwind CSS `4.1.11` · Bun `1.4.4` (`bun.lock`)  
**Audit Scope:** Foundation, tooling, security/correctness audit, dependency map, and implemented-vs-simulated inventory. No product features, billing, or deployment changes were performed in this phase.

---

## 1. Dependency Map

### 1.1 Runtime & Framework Layer
- **`app/layout.tsx`** -> Loads Google fonts (`Manrope`, `DM_Sans`, `JetBrains_Mono`), `./globals.css`, metadata.
- **`app/page.tsx`** (`'use client'`) -> Wraps `<ProtectedWorkspaceInner />` inside `<AuthProvider>` (`src/hooks/useAuth.tsx`). Coordinates:
  - Route/session gate via `canAccessProtectedWorkspace` (`src/utils/authValidation.ts`)
  - Demo vs. Live mode state (`demo*` React state initialized from `src/services/demoDataset.ts` vs. `liveTenantStore` in `src/services/supabaseDataService.ts`)
  - `AppShellLayout` (`src/layouts/AppShellLayout.tsx`) and 8 workspace views:
    - `src/views/OverviewView.tsx`
    - `src/views/PropertiesView.tsx`
    - `src/views/CalendarView.tsx`
    - `src/views/OpportunitiesView.tsx`
    - `src/views/AIStrategyCenterView.tsx`
    - `src/views/RevenueAnalyticsView.tsx`
    - `src/views/ActivityHistoryView.tsx`
    - `src/views/SettingsView.tsx`
  - Auth UIs: `src/views/AuthScreen.tsx`, `src/views/AuthPreviewModal.tsx`
  - Shared UI primitives: `src/components/LoadingSkeleton.tsx`, `src/components/PropertyThumbnail.tsx`, `lucide-react`, `recharts`, `motion`.

### 1.2 Auth, Data & Domain Modules (`src/`)
- **`src/lib/supabase.ts`** -> `@supabase/supabase-js` singleton (`getSupabaseClient`), gated by `isSupabaseConfigured()` (`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- **`src/hooks/useAuth.tsx`** -> Uses `src/lib/supabase.ts`; falls back to browser `localStorage`/`sessionStorage` vault when Supabase env vars are missing or `?autostart=1` is present.
- **`src/utils/authValidation.ts`** -> Pure form validation (`validateAuthForm`) and route guard (`canAccessProtectedWorkspace`).
- **`src/utils/engines.ts`** -> Core UTC calendar date math (`parseIsoDateUtc`, `diffCalendarNights`, `addCalendarDays`), deterministic financial engine, orphan-gap detector (`detectOrphanGaps`), and 0–100 priority scorer.
- **`src/services/demoDataset.ts`** -> Isolated demo fixtures anchored to `DEMO_REFERENCE_DATE = '2026-11-16'`.
- **`src/services/supabaseDataService.ts`** -> Row mappers (`mapPropertyToDbInsert`, `mapPropertyFromDb`, etc.), `maskCalendarUrl`, and in-memory `MultiTenantRlsStore` (`liveTenantStore`) calling `detectOrphanGaps` (`src/utils/engines.ts`) and `reconcileReservationsByUid` (`src/features/calendar/icalSyncEngine.ts`).
- **`src/features/`** -> Domain engines & view barrel exports:
  - `calendar/icalSyncEngine.ts` -> `ical.js` RFC 5545 parser, `Intl.DateTimeFormat` IANA timezone normalizer, `validateSafeIcalUrl` SSRF check, `reconcileReservationsByUid`, `buildSampleAirbnbIcsFeed`
  - `strategy/strategyService.ts` -> `GEMINI_FREE_TIER_MODEL = 'gemini-4-hydrogen'`, `buildAnonymizedStrategyPayload`, `detectPiiOrDisallowedKeys`, `validateAndNormalizeStrategyResponse`, `classifyGeminiApiError`, `buildRuleBasedStrategy`
  - `deployment/readinessCheck.ts` -> `evaluateDeploymentReadiness`
  - `properties/propertyValidation.ts` -> `validatePropertyInput`, IANA timezone & currency formatters (currently imports `validateSafeIcalUrl` from `../../../supabase/functions/sync-calendar/index`)
  - `financials/financialAndPriorityEngine.ts` -> Custom gap pricing simulation & priority breakdown
  - `gaps/gapDetectionEngine.ts` -> Reservation interval merging & occupancy analysis
  - `opportunities/opportunityWorkflow.ts` -> Filtering, sorting, CSV export
  - `analytics/analyticsEngine.ts` -> Multi-currency aggregation & conversion funnel
  - `messaging/hostMessageHelpers.ts` -> Contextual Airbnb guest/promo copy templates
  - Barrel re-exports: `src/features/ai/index.ts`, `src/features/calendars/index.ts` (imports from `supabase/functions/sync-calendar/index`), `src/features/reservations/index.ts`
- **`src/types/`** -> `gapfill.ts` (domain models), `database.ts` (PostgreSQL row types).
- **Unused / Template Scaffolding:** `hooks/use-mobile.ts`, `lib/utils.ts`, `src/hooks/useWorkspaceMode.ts`.

### 1.3 Server Routes & Supabase Backend
- **`app/api/health/route.ts`** (`GET`) -> Calls `evaluateDeploymentReadiness` (`src/features/deployment/readinessCheck.ts`) and returns non-sensitive booleans.
- **`app/api/calendar/sync/route.ts`** (`POST`) -> Calls `validateSafeIcalUrl`, `buildSampleAirbnbIcsFeed`, `parseAndNormalizeIcalFeed` (`src/features/calendar/icalSyncEngine.ts`); executes backend `fetch` (`redirect: 'error'`, 6s timeout) for non-intercepted URLs.
- **`app/api/strategy/route.ts`** (`POST`) -> Calls `@google/genai` (`GEMINI_FREE_TIER_MODEL`) using server `process.env.GEMINI_API_KEY` after `detectPiiOrDisallowedKeys`, rate-limit check, and schema validation (`validateAndNormalizeStrategyResponse`).
- **`supabase/migrations/001_initial_schema.sql`** -> Defines `private` schema + `private.calendar_secrets`, and 7 RLS-enabled tables (`profiles`, `properties`, `calendar_connections`, `reservations`, `gap_opportunities`, `gap_actions`, `sync_runs`).
- **`supabase/migrations/002_rls_and_triggers.sql`** -> `handle_updated_at`, `enforce_authenticated_owner_id`, `handle_new_user`, cross-table `calendar_connections` policy, `upsert_property_calendar_connection` RPC, and composite indexes.
- **`supabase/functions/sync-calendar/index.ts`** -> Exports `handleSyncCalendarRequest` and `validateSafeIcalUrl` (no Deno HTTP server or live DB/fetch integration yet).
- **`supabase/functions/generate-strategy/index.ts`** -> Exports `sanitizeStrategyPayload` helper only (no Deno HTTP handler or Gemini invocation yet).

---

## 2. Implemented vs. Simulated Matrix

| Subsystem | Implemented (Real Code) | Simulated / Stubbed / Fallback |
|---|---|---|
| **Workspace UI & Analytics** | 8-tab Next.js App Router dashboard (`src/views/*`), Recharts visualizations, responsive shell, loading skeletons, accessible modals. | Demo sandbox (`src/services/demoDataset.ts`) uses static fixtures pinned to `DEMO_REFERENCE_DATE = '2026-11-16'`. |
| **Authentication** | Supabase Auth client flows (`signInWithPassword`, `signUp`, `resetPasswordForEmail`, `updateUser`, `onAuthStateChange`) in `src/hooks/useAuth.tsx` + pure form/route checks in `src/utils/authValidation.ts`. | When `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` are unset, `useAuth.tsx` stores plaintext credentials in `localStorage` (`gapfill_stage2_registered_hosts_v1`), sessions in `sessionStorage`, seeds `clara@horizonstays.com` / `GapFill2026!`, and allows `?autostart=1` to enter demo mode without login. |
| **Database Persistence & RLS** | Complete PostgreSQL migrations (`001_initial_schema.sql`, `002_rls_and_triggers.sql`), strict TypeScript DB types (`src/types/database.ts`), `maskCalendarUrl`, and row mappers. | **`live_supabase` mode in `app/page.tsx` does NOT query Supabase.** All reads/writes go to the in-memory JS `Map` singleton `liveTenantStore` (`MultiTenantRlsStore` in `src/services/supabaseDataService.ts`), so all data is lost on browser refresh. |
| **Calendar iCal Sync** | Real RFC 5545 parsing (`ical.js`), IANA timezone normalization (`Intl.DateTimeFormat`), UID reconciliation/cancellation (`reconcileReservationsByUid`), syntax SSRF validation (`validateSafeIcalUrl`), backend `fetch` with `redirect: 'error'` and 6s timeout in `/api/calendar/sync`. | 1. `app/page.tsx` (`handleTriggerSyncProperty`) defaults to `simulationMode: 'standard'` and does not retrieve/pass real `private.calendar_secrets` URLs.<br>2. `/api/calendar/sync/route.ts` intercepts any URL containing `airbnb.com/calendar/ical/`, `vrbo.com/icalendar/`, or `example.com/` and returns `buildSampleAirbnbIcsFeed` instead of fetching the live feed.<br>3. `supabase/functions/sync-calendar/index.ts` has no `Deno.serve` entrypoint, no real JWT verification, no `private.calendar_secrets` read, and no remote `fetch`. |
| **AI Strategy Engine** | Real server-side `@google/genai` call in `app/api/strategy/route.ts` (`gemini-4-hydrogen`), strict PII outbound scrubber (`detectPiiOrDisallowedKeys`), JSON schema validation, transient retry, and deterministic `buildRuleBasedStrategy` fallback. | `supabase/functions/generate-strategy/index.ts` only sanitizes payloads and does not serve HTTP requests or call Gemini. |
| **Core Deterministic Engines** | UTC date math, orphan-gap detection, floor-price-protected financials, 0–100 priority scoring, ISO-currency portfolio aggregation, funnel analytics, formula-safe CSV export, and host outreach templates (covered by 42 unit tests). | None in core calculation logic; note `app/page.tsx` passes `DEMO_REFERENCE_DATE` (`'2026-11-16'`) even in `live_supabase` sync calls. |
| **Health Endpoint** | `GET /api/health` runs real environment readiness checks (`evaluateDeploymentReadiness`). | Does not probe live Supabase DB connectivity or execute a live Gemini ping (env presence checks only). |

---

## 3. Prioritized Production-Readiness Issue Checklist

### Critical (Security, Auth & Data Integrity)
- [ ] **Unauthenticated Next.js API Routes:** `POST /api/calendar/sync` and `POST /api/strategy` do not verify a Supabase user JWT or server session. Anyone on the internet can invoke Gemini calls (consuming quota) or trigger outbound backend iCal fetches.
- [ ] **Live Mode Uses In-Memory Store Instead of Supabase:** `app/page.tsx` reads/writes `liveTenantStore` (`MultiTenantRlsStore`) rather than `@supabase/supabase-js` / PostgREST queries + RPCs. Real accounts lose all properties, syncs, and recovered revenue on reload.
- [ ] **Production Airbnb/Vrbo URLs Intercepted as Demo Previews:** `app/api/calendar/sync/route.ts` (lines 65–78) treats URLs containing `airbnb.com/calendar/ical/` or `vrbo.com/icalendar/` as synthetic preview URLs and returns mock `.ics` data instead of fetching the real Airbnb/Vrbo feed.
- [ ] **Hardcoded Test Credentials & Query-String Bypass:** `src/hooks/useAuth.tsx` (`DEFAULT_SEEDED_HOST`, plaintext `passwordPlainForLocalStage2Only` in `localStorage`) and `src/views/AuthScreen.tsx` (`handleFillTestAccount`) expose hardcoded demo credentials, and `?autostart=1` bypasses the auth gate into demo mode. Local fallback credentials must be strictly isolated from production builds/live mode.
- [ ] **Database Schema & RPC Mismatches (`001_initial_schema.sql` / `002_rls_and_triggers.sql` / `src/types/database.ts`):**
  - `sync_runs.status` `CHECK` constraint only allows `('success', 'error')`, omitting `'warning'` used by the UI and `SyncRunLog` (`DbSyncRunRow` has the same omission).
  - `reservations.status` `CHECK` constraint only allows `('confirmed', 'canceled')`, while `icalSyncEngine.ts` emits `'cancelled'` (double `l`), `'blocked'`, and `'ambiguous_block'`.
  - `upsert_property_calendar_connection` in `002_rls_and_triggers.sql` always `INSERT`s a new row into `calendar_connections` rather than updating an existing connection for the same `property_id` (missing unique constraint + `ON CONFLICT`).
- [ ] **DNS-Rebinding SSRF Gap in `validateSafeIcalUrl`:** URL validation inspects literal hostname/IP strings only; a public domain resolving via DNS to `127.0.0.1`, `169.254.169.254`, or RFC 1918 space can still pass syntax validation unless DNS resolution is checked server-side before connecting.

### High (Architecture, Scalability & Operational Reliability)
- [ ] **Single-Instance Rate Limiter in `/api/strategy`:** `requestLog` is a global in-memory array shared across all callers (not keyed by user/IP) and resets across serverless cold starts. `/api/calendar/sync` has no rate limiting at all.
- [ ] **Live Mode Reference Date Hardcoded:** `app/page.tsx:351` passes `DEMO_REFERENCE_DATE` (`'2026-11-16'`) into `liveTenantStore.applyCalendarSyncResult` instead of the current date in the property's IANA timezone.
- [ ] **Incomplete Supabase Edge Functions:** `supabase/functions/sync-calendar/index.ts` and `supabase/functions/generate-strategy/index.ts` lack `Deno.serve` entrypoints, Supabase Admin client reads of `private.calendar_secrets`, JWT validation via `supabase.auth.getUser()`, and live upstream calls.
- [ ] **Cross-Boundary Imports into Edge Functions:** `src/features/properties/propertyValidation.ts` and `src/features/calendars/index.ts` import `validateSafeIcalUrl` from `supabase/functions/sync-calendar/index` instead of `src/features/calendar/icalSyncEngine.ts`.
- [ ] **No SSR Session Cookie Integration:** Uses client-only `localStorage` Supabase auth without `@supabase/ssr` middleware/cookie propagation for Next.js Route Handlers.

### Medium (Tooling, Hygiene & Consistency)
- [x] **ESLint / Next.js Version Alignment & Build Enforcement:** Aligned `eslint-config-next` (`^15.5.29`) with `next` (`^15.4.9` / `15.5.29`), added `@eslint/eslintrc` FlatCompat config (`eslint.config.mjs`), removed duplicate `.eslintrc.json`, and enabled `eslint.ignoreDuringBuilds: false` in `next.config.ts`.
- [x] **Single Package Manager & Reproducible Scripts:** Standardized on `bun` (`bun.lock`), added `typecheck` and `test` (`tsx --test "src/**/*.test.ts"`) scripts in `package.json`, expanded `.gitignore` and `.env.example` (`SUPABASE_SERVICE_ROLE_KEY`, `DISABLE_HMR`).
- [ ] **Shell `NODE_ENV=development` Build Hazard:** Running `next build` when `NODE_ENV=development` is pre-exported in the shell triggers Next.js 15 `<Html> should not be imported outside of pages/_document` on `/500`; CI/deploy scripts must ensure `NODE_ENV` is unset or `production`.
- [ ] **Leftover Unused Packages & Template Files:** `firebase-tools` (`^15.0.0`) remains in `devDependencies`; `hooks/use-mobile.ts`, `lib/utils.ts`, and `src/hooks/useWorkspaceMode.ts` are unused.

### Low (Maintainability & Polish)
- [ ] **Duplicate Strategy Payload Sanitization:** `detectPiiOrDisallowedKeys` / `buildAnonymizedStrategyPayload` (`src/features/strategy/strategyService.ts`) and `sanitizeStrategyPayload` (`supabase/functions/generate-strategy/index.ts`) duplicate field whitelisting.
- [ ] **Bundle Size on `/` (`367 kB` First Load JS):** Single client page (`app/page.tsx`) eagerly bundles all 8 views and `recharts`. Code-splitting heavy views (`RevenueAnalyticsView`, `CalendarView`) via `next/dynamic` will improve initial load latency.
- [ ] **Postinstall Scripts Blocked by Bun:** `@google/genai`, `@tailwindcss/oxide`, and `protobufjs` had lifecycle scripts skipped by Bun's trust filter (no observed runtime/build failure; verify `bun pm untrusted` if native oxide bindings differ on target OS).

---

## 4. Verification Results (Recorded Verbatim)

| Check | Command | Outcome | Notes |
|---|---|---|---|
| **Clean Install (Frozen Lockfile)** | `rm -rf node_modules && bun install --frozen-lockfile` | **PASS** (exit `0`) | Installed via `bun.lock` (`897` packages on initial lock update). Note: Bun blocked 3 lifecycle scripts (`@google/genai`, `@tailwindcss/oxide`, `protobufjs`). |
| **TypeScript Typecheck** | `bun run typecheck` (`tsc --noEmit`) | **PASS** (exit `0`) | 0 type errors across Next.js app, feature engines, routes, and tests. |
| **Linter** | `bun run lint` (`eslint .`) | **PASS** (exit `0`) | 0 ESLint errors or warnings under Next 15 `next/core-web-vitals` + `next/typescript`. |
| **Unit Tests** | `bun run test` (`tsx --test "src/**/*.test.ts"`) | **PASS** (exit `0`) | **42 / 42 tests passed** across 13 test files (`0` failed, `0` skipped, ~`2.1s`). |
| **Production Build (Inherited Shell Env)** | `bun run build` (with container `NODE_ENV=development`) | **FAIL** (exit `1`) | Compiled & linted cleanly, but failed prerendering `/500` with `Error: <Html> should not be imported outside of pages/_document` due to shell `NODE_ENV=development`. |
| **Production Build (`NODE_ENV=production`)** | `NODE_ENV=production bun run build` | **PASS** (exit `0`) | Compiled in `5.1s`, ESLint (`ignoreDuringBuilds: false`) & TypeScript (`ignoreBuildErrors: false`) passed, `7/7` static/dynamic pages built (`/` `367 kB` First Load JS). |
