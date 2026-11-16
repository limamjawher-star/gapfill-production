export interface DeploymentCheckItem {
  id:
    | 'ical_sync_engine'
    | 'gemini_free_tier'
    | 'supabase_auth_rls'
    | 'app_url_config'
    | 'zero_paid_dependencies';
  label: string;
  status: 'ready' | 'fallback_active' | 'pending_env';
  detail: string;
}

export interface DeploymentReadinessReport {
  overallStatus: 'ready_for_host_pilot' | 'ready_with_local_fallbacks';
  freeTierCompliant: true;
  checks: DeploymentCheckItem[];
}

function isRealValue(val: string | undefined, placeholders: string[]): boolean {
  if (!val) return false;
  const trimmed = val.trim();
  if (!trimmed) return false;
  return !placeholders.includes(trimmed);
}

/**
 * Evaluates GapFill environment readiness for $0 free-tier deployment and host pilot testing.
 */
export function evaluateDeploymentReadiness(env: {
  geminiApiKey?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  appUrl?: string;
}): DeploymentReadinessReport {
  const geminiReady = isRealValue(env.geminiApiKey, ['MY_GEMINI_API_KEY']);
  const supabaseReady =
    isRealValue(env.supabaseUrl, ['']) &&
    isRealValue(env.supabaseAnonKey, ['']) &&
    (env.supabaseUrl?.startsWith('https://') ?? false);
  const appUrlReady = isRealValue(env.appUrl, ['MY_APP_URL']);

  const checks: DeploymentCheckItem[] = [
    {
      id: 'ical_sync_engine',
      label: 'RFC 5545 iCal Sync & Gap Engine',
      status: 'ready',
      detail:
        'Backend /api/calendar/sync route active with SSRF checks and ical.js parser.',
    },
    {
      id: 'gemini_free_tier',
      label: 'Gemini Free-Tier Strategy API (gemini-4-hydrogen)',
      status: geminiReady ? 'ready' : 'fallback_active',
      detail: geminiReady
        ? 'Server-side GEMINI_API_KEY configured for zero-PII strategy generation.'
        : 'GEMINI_API_KEY unset; deterministic rule-based strategy engine active cleanly.',
    },
    {
      id: 'supabase_auth_rls',
      label: 'Supabase Free-Tier PostgreSQL, Auth & RLS',
      status: supabaseReady ? 'ready' : 'pending_env',
      detail: supabaseReady
        ? 'NEXT_PUBLIC_SUPABASE_URL & anon key configured with auth.uid() isolation.'
        : 'Optional local Stage 2–3 vault & isolated DEMO mode active until Supabase keys are set.',
    },
    {
      id: 'app_url_config',
      label: 'Production APP_URL Origin',
      status: appUrlReady ? 'ready' : 'pending_env',
      detail: appUrlReady
        ? 'Public origin configured for OAuth/password reset redirects.'
        : 'Configure APP_URL in hosting environment secrets before public host invites.',
    },
    {
      id: 'zero_paid_dependencies',
      label: '$0 Budget / Zero Paid SaaS Dependencies',
      status: 'ready',
      detail:
        'No Stripe, paid APIs, paid email providers, or paid calendar connectors required.',
    },
  ];

  const allLiveConfigured = geminiReady && supabaseReady && appUrlReady;

  return {
    overallStatus: allLiveConfigured
      ? 'ready_for_host_pilot'
      : 'ready_with_local_fallbacks',
    freeTierCompliant: true,
    checks,
  };
}
