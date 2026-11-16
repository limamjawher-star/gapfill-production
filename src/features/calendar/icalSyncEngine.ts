import ICAL from 'ical.js';
import { Property, Reservation, ReservationStatus } from '../../types/gapfill';

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^169\.254\./,
  /^0\./,
  /^\[?::1\]?$/,
  /^\[?fe80:/i,
  /^\[?fc00:/i,
  /^\[?fd00:/i,
  /^metadata\.google\.internal$/i,
  /\.internal$/i,
  /\.local$/i,
];

/**
 * Validates that an iCal URL is safe to fetch from the backend:
 * - Strictly HTTPS protocol
 * - Standard port 443 (or default empty port)
 * - Blocks localhost, loopback, link-local (169.254.169.254), RFC 1918 private IPs, and internal hostnames
 */
export function validateSafeIcalUrl(rawUrl: string): {
  valid: boolean;
  reason?: string;
} {
  if (!rawUrl || !rawUrl.trim()) {
    return { valid: false, reason: 'iCal URL is required.' };
  }

  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:') {
      return {
        valid: false,
        reason: 'Only HTTPS iCal feed URLs are permitted.',
      };
    }
    if (parsed.port && parsed.port !== '443') {
      return {
        valid: false,
        reason: 'Non-standard ports are blocked for security (only port 443 allowed).',
      };
    }
    if (parsed.username || parsed.password) {
      return {
        valid: false,
        reason: 'Embedded credentials in iCal URLs are not permitted.',
      };
    }

    const hostname = parsed.hostname.toLowerCase();
    for (const pattern of PRIVATE_HOST_PATTERNS) {
      if (pattern.test(hostname)) {
        return {
          valid: false,
          reason:
            'Private, loopback, link-local, or reserved network addresses are blocked (SSRF protection).',
        };
      }
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: 'Malformed URL syntax.' };
  }
}

export interface NormalizedIcalEvent {
  sourceUid: string;
  checkInDate: string; // YYYY-MM-DD (inclusive)
  checkOutDate: string; // YYYY-MM-DD (exclusive)
  status: ReservationStatus;
  summaryLabel: string;
  isAmbiguous: boolean;
}

export interface IcalParseResult {
  ok: boolean;
  events: NormalizedIcalEvent[];
  flaggedAmbiguousCount: number;
  cancelledCount: number;
  errorMessage: string | null;
}

/**
 * Normalizes an ICAL.Time instance into a property-timezone YYYY-MM-DD date string.
 * - For RFC 5545 VALUE=DATE events (isDate === true), uses the literal calendar date
 *   (Airbnb and Vrbo export check-in/check-out as all-day VALUE=DATE values).
 * - For DATE-TIME events, converts the UTC/floating instant into the property's IANA timezone
 *   so browser/server local timezone never distorts the reservation date.
 */
function normalizeIcalTimeToPropertyDate(
  icalTime: ICAL.Time,
  propertyTimezone: string
): string {
  if (icalTime.isDate) {
    const y = String(icalTime.year).padStart(4, '0');
    const m = String(icalTime.month).padStart(2, '0');
    const d = String(icalTime.day).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const jsDate = icalTime.toJSDate();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: propertyTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(jsDate);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }
  return `${map.year}-${map.month}-${map.day}`;
}

/**
 * Classifies an iCalendar VEVENT into GapFill's ReservationStatus:
 * - 'cancelled': VEVENT STATUS:CANCELLED or summary explicitly marked Canceled/Cancelled
 * - 'blocked': Summary indicates host/platform block ("Not available", "Blocked", "Owner Hold")
 * - 'ambiguous_block': Missing summary or unrecognized non-reservation hold
 * - 'confirmed': Confirmed guest reservation
 */
function classifyIcalEventStatus(
  rawStatus: string | null,
  summary: string
): { status: ReservationStatus; isAmbiguous: boolean } {
  const upperStatus = (rawStatus ?? '').toUpperCase().trim();
  const lowerSummary = summary.toLowerCase().trim();

  if (
    upperStatus === 'CANCELLED' ||
    lowerSummary.includes('cancelled') ||
    lowerSummary.includes('canceled')
  ) {
    return { status: 'cancelled', isAmbiguous: false };
  }

  if (!lowerSummary) {
    return { status: 'ambiguous_block', isAmbiguous: true };
  }

  if (
    lowerSummary.includes('not available') ||
    lowerSummary.includes('blocked') ||
    lowerSummary.includes('owner hold') ||
    lowerSummary.includes('maintenance')
  ) {
    const isPlatformGenericBlock =
      lowerSummary === 'not available' ||
      lowerSummary === 'airbnb (not available)';
    return {
      status: isPlatformGenericBlock ? 'ambiguous_block' : 'blocked',
      isAmbiguous: isPlatformGenericBlock,
    };
  }

  return { status: 'confirmed', isAmbiguous: false };
}

/**
 * Parses a raw RFC 5545 iCalendar (.ics) string using ical.js,
 * normalizes reservation dates in the property's IANA timezone,
 * and handles malformed feeds and canceled events gracefully.
 */
export function parseAndNormalizeIcalFeed(
  rawIcsText: string,
  propertyTimezone: string
): IcalParseResult {
  if (!rawIcsText || !rawIcsText.trim()) {
    return {
      ok: false,
      events: [],
      flaggedAmbiguousCount: 0,
      cancelledCount: 0,
      errorMessage: 'Empty iCal feed response.',
    };
  }

  const trimmed = rawIcsText.trim();
  if (
    !trimmed.includes('BEGIN:VCALENDAR') ||
    !trimmed.includes('END:VCALENDAR')
  ) {
    return {
      ok: false,
      events: [],
      flaggedAmbiguousCount: 0,
      cancelledCount: 0,
      errorMessage:
        'Malformed iCal feed: missing BEGIN:VCALENDAR / END:VCALENDAR envelope.',
    };
  }

  try {
    const jcalData = ICAL.parse(trimmed);
    const vcalendar = new ICAL.Component(jcalData);

    if (vcalendar.name !== 'vcalendar') {
      return {
        ok: false,
        events: [],
        flaggedAmbiguousCount: 0,
        cancelledCount: 0,
        errorMessage: 'Malformed iCal feed: root component is not VCALENDAR.',
      };
    }

    const vevents = vcalendar.getAllSubcomponents('vevent');
    const normalizedEvents: NormalizedIcalEvent[] = [];
    let flaggedAmbiguousCount = 0;
    let cancelledCount = 0;

    for (const veventComp of vevents) {
      const event = new ICAL.Event(veventComp);
      const rawUid = (event.uid ?? '').trim();
      const dtStart = event.startDate;
      const dtEnd = event.endDate;

      if (!rawUid || !dtStart || !dtEnd) {
        flaggedAmbiguousCount += 1;
        continue;
      }

      const checkInDate = normalizeIcalTimeToPropertyDate(
        dtStart,
        propertyTimezone
      );
      const checkOutDate = normalizeIcalTimeToPropertyDate(
        dtEnd,
        propertyTimezone
      );

      // RFC 5545: DTEND must be strictly after DTSTART for a valid multi-night stay
      if (checkOutDate <= checkInDate) {
        flaggedAmbiguousCount += 1;
        continue;
      }

      const rawStatusProp = veventComp.getFirstPropertyValue('status');
      const rawStatus =
        typeof rawStatusProp === 'string' ? rawStatusProp : null;
      const rawSummary = (event.summary ?? '').trim();

      const classification = classifyIcalEventStatus(rawStatus, rawSummary);
      if (classification.isAmbiguous) {
        flaggedAmbiguousCount += 1;
      }
      if (classification.status === 'cancelled') {
        cancelledCount += 1;
      }

      normalizedEvents.push({
        sourceUid: rawUid,
        checkInDate,
        checkOutDate,
        status: classification.status,
        summaryLabel: rawSummary || 'Unnamed Calendar Hold',
        isAmbiguous: classification.isAmbiguous,
      });
    }

    return {
      ok: true,
      events: normalizedEvents,
      flaggedAmbiguousCount,
      cancelledCount,
      errorMessage: null,
    };
  } catch (err) {
    const detail =
      err instanceof Error ? err.message : 'Unrecognized RFC 5545 syntax.';
    return {
      ok: false,
      events: [],
      flaggedAmbiguousCount: 0,
      cancelledCount: 0,
      errorMessage: `Malformed iCal feed could not be parsed by ical.js: ${detail}`,
    };
  }
}

export interface ReconcileReservationsResult {
  reservations: Reservation[];
  upsertedCount: number;
  insertedCount: number;
  updatedCount: number;
  cancelledCount: number;
}

/**
 * Idempotently deduplicates and merges normalized iCal events into the reservation store
 * using the composite key (propertyId + sourceUid):
 * - Updates existing reservations matching (propertyId, sourceUid)
 * - Inserts new reservations when (propertyId, sourceUid) is not yet present
 * - Preserves reservations belonging to other properties untouched
 * - If an event within the same .ics feed appears multiple times with the same UID,
 *   the latest occurrence in the feed wins.
 */
export function reconcileReservationsByUid(params: {
  existingReservations: Reservation[];
  parsedEvents: NormalizedIcalEvent[];
  propertyId: string;
  syncTimestampIso: string;
}): ReconcileReservationsResult {
  const {
    existingReservations,
    parsedEvents,
    propertyId,
    syncTimestampIso,
  } = params;

  // Deduplicate within the incoming feed itself by sourceUid (last write wins)
  const deduplicatedFeedMap = new Map<string, NormalizedIcalEvent>();
  for (const ev of parsedEvents) {
    deduplicatedFeedMap.set(ev.sourceUid, ev);
  }

  const otherPropertyReservations = existingReservations.filter(
    (r) => r.propertyId !== propertyId
  );
  const currentPropertyReservations = existingReservations.filter(
    (r) => r.propertyId === propertyId
  );

  const existingByUid = new Map<string, Reservation>();
  for (const r of currentPropertyReservations) {
    existingByUid.set(r.sourceUid, r);
  }

  let insertedCount = 0;
  let updatedCount = 0;
  let cancelledCount = 0;

  for (const [sourceUid, incoming] of deduplicatedFeedMap.entries()) {
    const existing = existingByUid.get(sourceUid);
    if (incoming.status === 'cancelled') {
      cancelledCount += 1;
    }

    if (existing) {
      updatedCount += 1;
      existingByUid.set(sourceUid, {
        ...existing,
        checkInDate: incoming.checkInDate,
        checkOutDate: incoming.checkOutDate,
        status: incoming.status,
        summaryLabel: incoming.summaryLabel,
        updatedAt: syncTimestampIso,
      });
    } else {
      insertedCount += 1;
      const sanitizedUid = sourceUid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 36);
      existingByUid.set(sourceUid, {
        id: `res_${propertyId}_${sanitizedUid}`,
        propertyId,
        sourceUid,
        checkInDate: incoming.checkInDate,
        checkOutDate: incoming.checkOutDate,
        status: incoming.status,
        summaryLabel: incoming.summaryLabel,
        updatedAt: syncTimestampIso,
      });
    }
  }

  const mergedPropertyReservations = Array.from(existingByUid.values()).sort(
    (a, b) => a.checkInDate.localeCompare(b.checkInDate)
  );

  return {
    reservations: [...otherPropertyReservations, ...mergedPropertyReservations],
    upsertedCount: insertedCount + updatedCount,
    insertedCount,
    updatedCount,
    cancelledCount,
  };
}

/**
 * DEMO / TEST-ONLY helper: generates a synthetic RFC 5545 iCalendar (.ics) feed
 * for local DEMO sandbox testing and unit tests.
 * MUST NEVER be called in live authenticated customer flows or /api/calendar/sync.
 */
export function buildSampleAirbnbIcsFeed(
  property: Pick<Property, 'id' | 'name' | 'timezone'>,
  mode: 'standard' | 'with_cancellation' | 'malformed' = 'standard'
): string {
  if (mode === 'malformed') {
    return 'INVALID_ICAL_HEADER\nDTSTART:NOT_A_DATE\nSUMMARY:Broken Feed';
  }

  if (property.id === 'demo_prop_1') {
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//GapFill DEMO//Hosting Calendar 1.0//EN',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      'UID:airbnb_uid_101@airbnb.com',
      'DTSTART;VALUE=DATE:20261116',
      'DTEND;VALUE=DATE:20261120',
      'SUMMARY:[DEMO] Reserved (4 nights)',
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:airbnb_uid_102@airbnb.com',
      'DTSTART;VALUE=DATE:20261122',
      'DTEND;VALUE=DATE:20261127',
      'SUMMARY:[DEMO] Reserved (5 nights)',
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:airbnb_uid_103@airbnb.com',
      'DTSTART;VALUE=DATE:20261130',
      'DTEND;VALUE=DATE:20261205',
      'SUMMARY:[DEMO] Reserved (5 nights)',
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:airbnb_uid_104@airbnb.com',
      'DTSTART;VALUE=DATE:20261205',
      'DTEND;VALUE=DATE:20261210',
      'SUMMARY:[DEMO] Reserved (5 nights)',
      'STATUS:CONFIRMED',
      'END:VEVENT',
      ...(mode === 'with_cancellation'
        ? [
            'BEGIN:VEVENT',
            'UID:airbnb_uid_102@airbnb.com',
            'DTSTART;VALUE=DATE:20261122',
            'DTEND;VALUE=DATE:20261127',
            'SUMMARY:[DEMO] Canceled — Direct Repeat Guest',
            'STATUS:CANCELLED',
            'END:VEVENT',
          ]
        : []),
      'END:VCALENDAR',
    ].join('\r\n');
  }

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//GapFill DEMO//${property.name}//EN`,
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:uid_${property.id}_201@airbnb.com`,
    'DTSTART;VALUE=DATE:20261118',
    'DTEND;VALUE=DATE:20261122',
    'SUMMARY:[DEMO] Reserved — Sample Airbnb Booking',
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'BEGIN:VEVENT',
    `UID:uid_${property.id}_202@airbnb.com`,
    'DTSTART;VALUE=DATE:20261125',
    'DTEND;VALUE=DATE:20261130',
    'SUMMARY:[DEMO] Reserved — Sample Direct Stay',
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'BEGIN:VEVENT',
    `UID:uid_${property.id}_203@airbnb.com`,
    'DTSTART;VALUE=DATE:20261202',
    'DTEND;VALUE=DATE:20261207',
    'SUMMARY:Airbnb (Not available)',
    'STATUS:CONFIRMED',
    'END:VEVENT',
    ...(mode === 'with_cancellation'
      ? [
          'BEGIN:VEVENT',
          `UID:uid_${property.id}_202@airbnb.com`,
          'DTSTART;VALUE=DATE:20261125',
          'DTEND;VALUE=DATE:20261130',
          'SUMMARY:[DEMO] Cancelled — Sample Direct Stay',
          'STATUS:CANCELLED',
          'END:VEVENT',
        ]
      : []),
    'END:VCALENDAR',
  ].join('\r\n');
}
