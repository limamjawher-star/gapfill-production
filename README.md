# GapFill — Orphan Night Revenue Intelligence

**Tagline:** Turn empty nights between bookings into booking opportunities.

GapFill is a multi-tenant SaaS application built for independent Airbnb and short-term rental hosts (1–10 properties). It detects empty orphan nights between confirmed reservations, calculates floor-price-protected gap pricing and priority scores, generates zero-PII action strategies using Gemini's free tier (`gemini-4-hydrogen`) with a deterministic rule-based fallback, and tracks host-confirmed recovered revenue separately from gross estimates.

## Free-Tier Stack ($0 Budget Compliant)
- **Frontend & Server Routes:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS v4, Lucide icons, Recharts
- **Calendar Engine:** Backend `ical.js` RFC 5545 parser with SSRF protection (`https:` + port `443` only, private/loopback IP blocking) and property IANA timezone normalization
- **Database & Auth:** Supabase Free Tier (PostgreSQL + Row-Level Security + Supabase Auth + Edge Functions)
- **AI Strategy Engine:** Server-side `@google/genai` (`gemini-4-hydrogen`) with zero-PII outbound scrubbing, 15 req/min rate limiting, strict JSON schema validation, and deterministic rule-based fallback
- **Zero Paid SaaS Dependencies:** No Stripe, paid email/SMS gateways, paid calendar connectors, or paid AI tiers required

## Environment Variables (`.env.example`)
Copy `.env.example` to `.env.local` and supply your free-tier credentials:
```bash
GEMINI_API_KEY="YOUR_SERVER_ONLY_GEMINI_API_KEY"
APP_URL="https://your-deployment-url.vercel.app"
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-supabase-publishable-anon-key"
SUPABASE_SERVICE_ROLE_KEY=""
```

## Database & Edge Function Deployment (Supabase Free Tier)
1. Apply schema and RLS triggers in your Supabase SQL Editor in order:
   - `supabase/migrations/001_initial_schema.sql` (7 RLS-enabled public tables + isolated `private.calendar_secrets`)
   - `supabase/migrations/002_rls_and_triggers.sql` (`auth.uid()` ownership trigger, composite filter indexes, and `upsert_property_calendar_connection` RPC)
2. Deploy Supabase Edge Functions (optional if hosting Next.js API routes directly):
   - `supabase functions deploy sync-calendar`
   - `supabase functions deploy generate-strategy`

## Local Verification & Build Commands (Bun)
This repository uses **Bun** (`bun.lock`) as its single package manager and lockfile, paired with Node's native test runner via `tsx`:
```bash
bun install
bun run typecheck
bun run lint
bun run test
bun run build
```

See `docs/production-readiness.md` for the full architecture dependency map, implemented vs. simulated audit, and prioritized hardening checklist.

## Health & Readiness Endpoint
Verify deployment configuration anytime via:
```
GET /api/health
```
Returns non-sensitive readiness indicators for iCal sync, Gemini free-tier strategy generation, Supabase configuration, and `$0` free-tier compliance.
