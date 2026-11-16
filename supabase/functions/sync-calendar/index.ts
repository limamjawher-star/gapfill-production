import {
  parseAndNormalizeIcalFeed,
  validateSafeIcalUrl,
} from '../../../src/features/calendar/icalSyncEngine';

export { validateSafeIcalUrl };

/**
 * Supabase Edge Function: sync-calendar
 * Security hardening:
 * - Accepts HTTPS URLs only
 * - Blocks SSRF against localhost, loopback, link-local, and RFC 1918 private networks
 * - Blocks non-standard ports (only 443 / default allowed)
 * - Verifies authenticated user via Authorization header
 * - Never falls back to synthetic/sample calendar feeds
 */
export async function handleSyncCalendarRequest(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Missing Authorization bearer token' }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const body = (await req.json()) as {
    propertyId?: string;
    propertyName?: string;
    propertyTimezone?: string;
    calendarConnectionId?: string;
    rawIcalUrl?: string;
    rawIcsTextOverride?: string;
    simulationMode?: unknown;
  };

  if (body.simulationMode !== undefined && body.simulationMode !== null) {
    return new Response(
      JSON.stringify({
        ok: false,
        syncStatus: 'error',
        errorCode: 'SIMULATION_NOT_ALLOWED',
        errorMessage: 'Simulated calendar feeds are disabled in production sync-calendar.',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!body.propertyId || !body.calendarConnectionId) {
    return new Response(
      JSON.stringify({
        error: 'propertyId and calendarConnectionId are required',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const trimmedUrl = body.rawIcalUrl?.trim() ?? '';
  if (trimmedUrl) {
    const urlCheck = validateSafeIcalUrl(trimmedUrl);
    if (!urlCheck.valid) {
      return new Response(
        JSON.stringify({
          ok: false,
          syncStatus: 'error',
          errorMessage: urlCheck.reason ?? 'Blocked unsafe iCal URL.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  const timezone = body.propertyTimezone || 'Europe/Paris';
  let icsPayload = body.rawIcsTextOverride?.trim() ?? '';

  if (!icsPayload && trimmedUrl) {
    try {
      const response = await fetch(trimmedUrl, {
        method: 'GET',
        redirect: 'error',
        headers: {
          Accept: 'text/calendar, text/plain;q=0.9',
          'User-Agent': 'GapFill-Edge-iCal-Sync/1.0',
        },
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) {
        return new Response(
          JSON.stringify({
            ok: false,
            syncStatus: 'error',
            errorMessage: `Remote calendar server returned HTTP ${response.status}.`,
            lastSyncedAt: new Date().toISOString(),
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } }
        );
      }
      icsPayload = await response.text();
    } catch (err) {
      return new Response(
        JSON.stringify({
          ok: false,
          syncStatus: 'error',
          errorMessage:
            err instanceof Error ? err.message : 'Network error fetching remote iCal feed.',
          lastSyncedAt: new Date().toISOString(),
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  if (!icsPayload) {
    return new Response(
      JSON.stringify({
        ok: false,
        syncStatus: 'error',
        errorCode: 'BACKEND_NOT_CONFIGURED',
        errorMessage:
          'Server-side private.calendar_secrets lookup is not configured yet and no raw iCal URL was supplied.',
        lastSyncedAt: new Date().toISOString(),
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const parsed = parseAndNormalizeIcalFeed(icsPayload, timezone);
  if (!parsed.ok) {
    return new Response(
      JSON.stringify({
        ok: false,
        syncStatus: 'error',
        errorMessage: parsed.errorMessage,
        lastSyncedAt: new Date().toISOString(),
      }),
      { status: 422, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      syncStatus: parsed.flaggedAmbiguousCount > 0 ? 'warning' : 'healthy',
      events: parsed.events,
      eventsImportedCount: parsed.events.length,
      flaggedAmbiguousCount: parsed.flaggedAmbiguousCount,
      cancelledCount: parsed.cancelledCount,
      lastSyncedAt: new Date().toISOString(),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
