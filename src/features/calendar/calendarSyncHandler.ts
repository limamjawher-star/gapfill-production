import {
  NormalizedIcalEvent,
  parseAndNormalizeIcalFeed,
  validateSafeIcalUrl,
} from './icalSyncEngine';
import { CalendarSyncStatus } from '../../types/gapfill';

export interface CalendarSyncRequestBody {
  propertyId?: string;
  propertyName?: string;
  propertyTimezone?: string;
  rawIcalUrl?: string;
  rawIcsPayload?: string;
  simulationMode?: unknown;
}

export interface CalendarSyncResponseBody {
  ok: boolean;
  syncStatus?: CalendarSyncStatus;
  errorCode?:
    | 'SIMULATION_NOT_ALLOWED'
    | 'BACKEND_NOT_CONFIGURED'
    | 'INVALID_INPUT'
    | 'UNSAFE_ICAL_URL'
    | 'REMOTE_FETCH_FAILED'
    | 'MALFORMED_ICAL'
    | 'INTERNAL_ERROR';
  errorMessage: string | null;
  events?: NormalizedIcalEvent[];
  eventsImportedCount?: number;
  flaggedAmbiguousCount?: number;
  cancelledCount?: number;
  lastSyncedAt?: string;
}

export interface CalendarSyncHandlerResult {
  status: number;
  body: CalendarSyncResponseBody;
}

export interface CalendarSyncHandlerDeps {
  fetchImpl?: typeof fetch;
  nowIso?: () => string;
}

/**
 * Production backend iCal sync processor for POST /api/calendar/sync.
 * - Never generates or substitutes sample/demo calendar feeds
 * - Rejects simulationMode requests with HTTP 400
 * - Fetches every valid HTTPS URL (including airbnb.com, vrbo.com, example.com) directly via fetch
 * - Returns an honest 503 BACKEND_NOT_CONFIGURED when no feed URL/payload is provided and secret vault lookup is not configured
 */
export async function processCalendarSyncRequest(
  body: CalendarSyncRequestBody,
  deps: CalendarSyncHandlerDeps = {}
): Promise<CalendarSyncHandlerResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());

  if (body.simulationMode !== undefined && body.simulationMode !== null) {
    return {
      status: 400,
      body: {
        ok: false,
        syncStatus: 'error',
        errorCode: 'SIMULATION_NOT_ALLOWED',
        errorMessage:
          'Simulated calendar feeds are restricted to local DEMO mode and disabled on /api/calendar/sync.',
        events: [],
        eventsImportedCount: 0,
        flaggedAmbiguousCount: 0,
        cancelledCount: 0,
        lastSyncedAt: nowIso(),
      },
    };
  }

  if (!body.propertyId || !String(body.propertyId).trim()) {
    return {
      status: 400,
      body: {
        ok: false,
        syncStatus: 'error',
        errorCode: 'INVALID_INPUT',
        errorMessage: 'propertyId is required.',
      },
    };
  }

  const propertyTimezone = body.propertyTimezone?.trim() || 'Europe/Paris';
  const trimmedUrl = body.rawIcalUrl?.trim() ?? '';
  let icsContent = body.rawIcsPayload?.trim() ?? '';

  if (trimmedUrl) {
    const urlCheck = validateSafeIcalUrl(trimmedUrl);
    if (!urlCheck.valid) {
      return {
        status: 400,
        body: {
          ok: false,
          syncStatus: 'error',
          errorCode: 'UNSAFE_ICAL_URL',
          errorMessage: urlCheck.reason ?? 'Rejected unsafe iCal URL.',
          events: [],
          eventsImportedCount: 0,
          flaggedAmbiguousCount: 0,
          cancelledCount: 0,
          lastSyncedAt: nowIso(),
        },
      };
    }
  }

  if (!icsContent && trimmedUrl) {
    try {
      const response = await fetchImpl(trimmedUrl, {
        method: 'GET',
        redirect: 'error', // Block SSRF open-redirect chains
        headers: {
          Accept: 'text/calendar, text/plain;q=0.9',
          'User-Agent': 'GapFill-iCal-Sync/1.0',
        },
        signal: AbortSignal.timeout(6000),
      });

      if (!response.ok) {
        return {
          status: 422,
          body: {
            ok: false,
            syncStatus: 'error',
            errorCode: 'REMOTE_FETCH_FAILED',
            errorMessage: `Remote calendar server returned HTTP ${response.status}.`,
            events: [],
            eventsImportedCount: 0,
            flaggedAmbiguousCount: 0,
            cancelledCount: 0,
            lastSyncedAt: nowIso(),
          },
        };
      }
      icsContent = await response.text();
    } catch (fetchErr) {
      const msg =
        fetchErr instanceof Error
          ? fetchErr.message
          : 'Network error fetching remote iCal feed.';
      return {
        status: 422,
        body: {
          ok: false,
          syncStatus: 'error',
          errorCode: 'REMOTE_FETCH_FAILED',
          errorMessage: `Backend iCal fetch failed: ${msg}`,
          events: [],
          eventsImportedCount: 0,
          flaggedAmbiguousCount: 0,
          cancelledCount: 0,
          lastSyncedAt: nowIso(),
        },
      };
    }
  }

  if (!icsContent) {
    return {
      status: 503,
      body: {
        ok: false,
        syncStatus: 'error',
        errorCode: 'BACKEND_NOT_CONFIGURED',
        errorMessage:
          'Live calendar sync is not configured: no HTTPS iCal feed URL was provided and server-side private.calendar_secrets retrieval requires Supabase backend setup.',
        events: [],
        eventsImportedCount: 0,
        flaggedAmbiguousCount: 0,
        cancelledCount: 0,
        lastSyncedAt: nowIso(),
      },
    };
  }

  const parsed = parseAndNormalizeIcalFeed(icsContent, propertyTimezone);
  const completedAt = nowIso();

  if (!parsed.ok) {
    return {
      status: 422,
      body: {
        ok: false,
        syncStatus: 'error',
        errorCode: 'MALFORMED_ICAL',
        errorMessage: parsed.errorMessage ?? 'Malformed iCal feed.',
        events: [],
        eventsImportedCount: 0,
        flaggedAmbiguousCount: 0,
        cancelledCount: 0,
        lastSyncedAt: completedAt,
      },
    };
  }

  return {
    status: 200,
    body: {
      ok: true,
      syncStatus: parsed.flaggedAmbiguousCount > 0 ? 'warning' : 'healthy',
      events: parsed.events,
      eventsImportedCount: parsed.events.length,
      flaggedAmbiguousCount: parsed.flaggedAmbiguousCount,
      cancelledCount: parsed.cancelledCount,
      lastSyncedAt: completedAt,
      errorMessage: null,
    },
  };
}
