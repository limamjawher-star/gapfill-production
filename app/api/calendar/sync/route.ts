import { NextRequest, NextResponse } from 'next/server';
import {
  CalendarSyncRequestBody,
  processCalendarSyncRequest,
} from '../../../../src/features/calendar/calendarSyncHandler';

/**
 * Production Backend iCal Synchronization Endpoint (/api/calendar/sync)
 * - Validates SSRF & HTTPS port 443 constraints on supplied URLs
 * - Fetches live external .ics feeds safely on the backend (redirect: 'error', timeout: 6000ms)
 * - Never generates or substitutes sample/demo calendar feeds
 * - Returns honest 503 BACKEND_NOT_CONFIGURED if no live feed URL/payload is available
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CalendarSyncRequestBody;
    const result = await processCalendarSyncRequest(body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unexpected iCal sync error.';
    return NextResponse.json(
      {
        ok: false,
        syncStatus: 'error',
        errorCode: 'INTERNAL_ERROR',
        errorMessage: message,
        events: [],
        eventsImportedCount: 0,
        flaggedAmbiguousCount: 0,
        cancelledCount: 0,
        lastSyncedAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
