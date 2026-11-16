import { NextResponse } from 'next/server';
import { GEMINI_FREE_TIER_MODEL } from '../../../src/features/strategy/strategyService';
import { evaluateDeploymentReadiness } from '../../../src/features/deployment/readinessCheck';

/**
 * Production Health & Free-Tier Readiness Endpoint (/api/health)
 * Returns non-sensitive boolean readiness checks for host testing & deployment monitors.
 * Never exposes secret keys, database URLs, or internal configuration values.
 */
export async function GET() {
  const report = evaluateDeploymentReadiness({
    geminiApiKey: process.env.GEMINI_API_KEY,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    appUrl: process.env.APP_URL,
  });

  return NextResponse.json(
    {
      status: 'ok',
      service: 'gapfill',
      timestamp: new Date().toISOString(),
      freeTierModel: GEMINI_FREE_TIER_MODEL,
      icalParser: 'ical.js',
      summary: report,
    },
    { status: 200 }
  );
}
