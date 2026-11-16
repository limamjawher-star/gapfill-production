import { Property, CalendarSyncStatus } from '../../types/gapfill';
import { NormalizedIcalEvent } from './icalSyncEngine';

export interface LiveCalendarSyncPayload {
  propertyId: string;
  propertyName: string;
  propertyTimezone: string;
  rawIcalUrl?: string;
}

/**
 * Builds the live customer /api/calendar/sync request payload.
 * Strictly omits simulationMode so production sync never requests synthetic sample data.
 */
export function buildLiveCalendarSyncPayload(
  property: Pick<Property, 'id' | 'name' | 'timezone'>,
  rawIcalUrl?: string
): LiveCalendarSyncPayload {
  const payload: LiveCalendarSyncPayload = {
    propertyId: property.id,
    propertyName: property.name,
    propertyTimezone: property.timezone,
  };
  if (rawIcalUrl && rawIcalUrl.trim()) {
    payload.rawIcalUrl = rawIcalUrl.trim();
  }
  return payload;
}

export interface LiveCalendarSyncResponse {
  ok: boolean;
  syncStatus?: CalendarSyncStatus;
  errorCode?: string;
  events?: NormalizedIcalEvent[];
  eventsImportedCount?: number;
  flaggedAmbiguousCount?: number;
  cancelledCount?: number;
  lastSyncedAt?: string;
  errorMessage?: string | null;
}

/**
 * Executes a live calendar sync HTTP request without ever passing simulationMode
 * or invoking synthetic sample feed generators.
 */
export async function executeLiveCalendarSync(
  property: Pick<Property, 'id' | 'name' | 'timezone'>,
  fetchImpl: typeof fetch = fetch,
  rawIcalUrl?: string
): Promise<LiveCalendarSyncResponse> {
  const body = buildLiveCalendarSyncPayload(property, rawIcalUrl);

  const response = await fetchImpl('/api/calendar/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  try {
    return (await response.json()) as LiveCalendarSyncResponse;
  } catch {
    return {
      ok: false,
      syncStatus: 'error',
      events: [],
      eventsImportedCount: 0,
      flaggedAmbiguousCount: 0,
      cancelledCount: 0,
      lastSyncedAt: new Date().toISOString(),
      errorMessage: `Calendar sync failed with HTTP ${response.status}.`,
    };
  }
}
