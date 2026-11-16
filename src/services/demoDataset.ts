import {
  CalendarConnection,
  CalendarSyncStatus,
  GapOpportunity,
  HostActionLog,
  Property,
  Reservation,
  SyncRunLog,
} from '../types/gapfill';
import {
  buildSampleAirbnbIcsFeed,
  NormalizedIcalEvent,
  parseAndNormalizeIcalFeed,
} from '../features/calendar/icalSyncEngine';
import { buildRuleBasedStrategy, detectOrphanGaps } from '../utils/engines';

export const DEMO_REFERENCE_DATE = '2026-11-16';
export const DEMO_PREFIX = '[DEMO]';

export const INITIAL_DEMO_PROPERTIES: Property[] = [
  {
    id: 'demo_prop_1',
    name: '[DEMO] Canal Saint-Martin Design Loft',
    propertyType: 'Loft',
    city: 'Paris',
    country: 'France',
    timezone: 'Europe/Paris',
    currency: 'USD',
    defaultNightlyRate: 260,
    minimumBookingLength: 3,
    minimumAcceptableNightlyPrice: 195,
    maximumAcceptableDiscount: 22,
    analysisHorizonDays: 90,
    status: 'active',
    createdAt: '2026-10-01T09:00:00Z',
  },
  {
    id: 'demo_prop_2',
    name: '[DEMO] Sedona Red Rock Casita',
    propertyType: 'House',
    city: 'Sedona',
    country: 'United States',
    timezone: 'America/Phoenix',
    currency: 'USD',
    defaultNightlyRate: 320,
    minimumBookingLength: 2,
    minimumAcceptableNightlyPrice: 245,
    maximumAcceptableDiscount: 20,
    analysisHorizonDays: 90,
    status: 'active',
    createdAt: '2026-10-04T14:20:00Z',
  },
  {
    id: 'demo_prop_3',
    name: '[DEMO] Lisbon Alfama River Terrace',
    propertyType: 'Apartment',
    city: 'Lisbon',
    country: 'Portugal',
    timezone: 'Europe/Lisbon',
    currency: 'USD',
    defaultNightlyRate: 185,
    minimumBookingLength: 3,
    minimumAcceptableNightlyPrice: 140,
    maximumAcceptableDiscount: 25,
    analysisHorizonDays: 60,
    status: 'active',
    createdAt: '2026-10-12T11:15:00Z',
  },
];

export const INITIAL_DEMO_CALENDARS: CalendarConnection[] = [
  {
    id: 'demo_cal_1',
    propertyId: 'demo_prop_1',
    sourceName: '[DEMO] Sample Airbnb iCal Feed',
    maskedUrlPreview: 'https://www.airbnb.com/calendar/ical/4829••••••.ics',
    syncStatus: 'healthy',
    lastSyncedAt: '2026-11-16T05:30:00Z',
    lastErrorMessage: null,
    eventsImportedCount: 8,
    flaggedAmbiguousCount: 0,
  },
  {
    id: 'demo_cal_2',
    propertyId: 'demo_prop_2',
    sourceName: '[DEMO] Sample Airbnb + Vrbo Feed',
    maskedUrlPreview: 'https://www.airbnb.com/calendar/ical/9104••••••.ics',
    syncStatus: 'healthy',
    lastSyncedAt: '2026-11-16T04:15:00Z',
    lastErrorMessage: null,
    eventsImportedCount: 7,
    flaggedAmbiguousCount: 0,
  },
  {
    id: 'demo_cal_3',
    propertyId: 'demo_prop_3',
    sourceName: '[DEMO] Sample Host iCal Feed',
    maskedUrlPreview: 'https://www.airbnb.com/calendar/ical/7391••••••.ics',
    syncStatus: 'warning',
    lastSyncedAt: '2026-11-15T06:00:00Z',
    lastErrorMessage:
      '[DEMO] 1 recurring block event skipped expansion (flagged for review); 5 sample bookings imported cleanly.',
    eventsImportedCount: 5,
    flaggedAmbiguousCount: 1,
  },
];

export const INITIAL_DEMO_RESERVATIONS: Reservation[] = [
  // Property 1: [DEMO] Canal Saint-Martin Design Loft
  {
    id: 'demo_res_101',
    propertyId: 'demo_prop_1',
    sourceUid: 'airbnb_uid_101@airbnb.com',
    checkInDate: '2026-11-16',
    checkOutDate: '2026-11-20',
    status: 'confirmed',
    summaryLabel: '[DEMO] Reserved (4 nights)',
    updatedAt: '2026-11-16T05:30:00Z',
  },
  // -> 2-night orphan gap: Nov 20 to Nov 22 (Blocked by 3-night min stay!)
  {
    id: 'demo_res_102',
    propertyId: 'demo_prop_1',
    sourceUid: 'airbnb_uid_102@airbnb.com',
    checkInDate: '2026-11-22',
    checkOutDate: '2026-11-27',
    status: 'confirmed',
    summaryLabel: '[DEMO] Reserved (5 nights)',
    updatedAt: '2026-11-16T05:30:00Z',
  },
  // -> 3-night orphan gap: Nov 27 to Nov 30 (Compatible with 3-night min stay)
  {
    id: 'demo_res_103',
    propertyId: 'demo_prop_1',
    sourceUid: 'airbnb_uid_103@airbnb.com',
    checkInDate: '2026-11-30',
    checkOutDate: '2026-12-05',
    status: 'confirmed',
    summaryLabel: '[DEMO] Reserved (5 nights)',
    updatedAt: '2026-11-16T05:30:00Z',
  },
  // -> Back-to-back turnover Dec 05 to Dec 05 (0 empty nights)
  {
    id: 'demo_res_104',
    propertyId: 'demo_prop_1',
    sourceUid: 'airbnb_uid_104@airbnb.com',
    checkInDate: '2026-12-05',
    checkOutDate: '2026-12-10',
    status: 'confirmed',
    summaryLabel: '[DEMO] Reserved (5 nights)',
    updatedAt: '2026-11-16T05:30:00Z',
  },

  // Property 2: [DEMO] Sedona Red Rock Casita
  {
    id: 'demo_res_201',
    propertyId: 'demo_prop_2',
    sourceUid: 'airbnb_uid_201@airbnb.com',
    checkInDate: '2026-11-17',
    checkOutDate: '2026-11-21',
    status: 'confirmed',
    summaryLabel: '[DEMO] Reserved (4 nights)',
    updatedAt: '2026-11-16T04:15:00Z',
  },
  // -> 2-night orphan gap: Nov 21 to Nov 23 (Compatible with 2-night min stay)
  {
    id: 'demo_res_202',
    propertyId: 'demo_prop_2',
    sourceUid: 'airbnb_uid_202@airbnb.com',
    checkInDate: '2026-11-23',
    checkOutDate: '2026-11-29',
    status: 'confirmed',
    summaryLabel: '[DEMO] Reserved (6 nights)',
    updatedAt: '2026-11-16T04:15:00Z',
  },
  // -> 1-night orphan gap: Nov 29 to Nov 30 (Blocked by 2-night min stay)
  {
    id: 'demo_res_203',
    propertyId: 'demo_prop_2',
    sourceUid: 'airbnb_uid_203@airbnb.com',
    checkInDate: '2026-11-30',
    checkOutDate: '2026-12-04',
    status: 'confirmed',
    summaryLabel: '[DEMO] Reserved (4 nights)',
    updatedAt: '2026-11-16T04:15:00Z',
  },
  // -> 3-night gap Dec 04 to Dec 07 (Already filled in demo history to demonstrate Actual Recovered Revenue vs Estimated Opportunity!)
  {
    id: 'demo_res_204',
    propertyId: 'demo_prop_2',
    sourceUid: 'airbnb_uid_204@airbnb.com',
    checkInDate: '2026-12-07',
    checkOutDate: '2026-12-13',
    status: 'confirmed',
    summaryLabel: '[DEMO] Reserved (6 nights)',
    updatedAt: '2026-11-16T04:15:00Z',
  },

  // Property 3: [DEMO] Lisbon Alfama River Terrace
  {
    id: 'demo_res_301',
    propertyId: 'demo_prop_3',
    sourceUid: 'airbnb_uid_301@airbnb.com',
    checkInDate: '2026-11-19',
    checkOutDate: '2026-11-24',
    status: 'confirmed',
    summaryLabel: '[DEMO] Reserved (5 nights)',
    updatedAt: '2026-11-15T06:00:00Z',
  },
  // -> 2-night orphan gap: Nov 24 to Nov 26 (Blocked by 3-night min stay)
  {
    id: 'demo_res_302',
    propertyId: 'demo_prop_3',
    sourceUid: 'airbnb_uid_302@airbnb.com',
    checkInDate: '2026-11-26',
    checkOutDate: '2026-12-01',
    status: 'confirmed',
    summaryLabel: '[DEMO] Reserved (5 nights)',
    updatedAt: '2026-11-15T06:00:00Z',
  },
  // -> 4-night orphan gap: Dec 01 to Dec 05 (Compatible with 3-night min stay, already filled!)
  {
    id: 'demo_res_303',
    propertyId: 'demo_prop_3',
    sourceUid: 'airbnb_uid_303@airbnb.com',
    checkInDate: '2026-12-05',
    checkOutDate: '2026-12-11',
    status: 'confirmed',
    summaryLabel: '[DEMO] Reserved (6 nights)',
    updatedAt: '2026-11-15T06:00:00Z',
  },
];

export function buildInitialDemoOpportunities(
  properties: Property[],
  reservations: Reservation[]
): GapOpportunity[] {
  const allOpportunities: GapOpportunity[] = [];

  for (const prop of properties) {
    const hoursSinceSync = prop.id === 'demo_prop_3' ? 23 : 2;
    const detected = detectOrphanGaps({
      property: prop,
      reservations,
      referenceDateStr: DEMO_REFERENCE_DATE,
      hoursSinceLastSync: hoursSinceSync,
    });

    for (const opp of detected) {
      // Seed realistic statuses & pre-generated strategy on specific demo gaps
      if (
        opp.propertyId === 'demo_prop_2' &&
        opp.gapStartDate === '2026-12-04'
      ) {
        opp.status = 'filled';
        opp.actualRecoveredRevenue = 810; // Sample confirmed booking revenue
        opp.filledAt = '2026-11-14T16:40:00Z';
        opp.strategy = buildRuleBasedStrategy(prop, opp);
      } else if (
        opp.propertyId === 'demo_prop_3' &&
        opp.gapStartDate === '2026-12-01'
      ) {
        opp.status = 'filled';
        opp.actualRecoveredRevenue = 620;
        opp.filledAt = '2026-11-13T11:20:00Z';
        opp.strategy = buildRuleBasedStrategy(prop, opp);
      } else if (
        opp.propertyId === 'demo_prop_1' &&
        opp.gapStartDate === '2026-11-20'
      ) {
        opp.status = 'actioned';
        opp.strategy = buildRuleBasedStrategy(prop, opp);
      } else if (
        opp.propertyId === 'demo_prop_2' &&
        opp.gapStartDate === '2026-11-21'
      ) {
        opp.status = 'viewed';
        opp.strategy = buildRuleBasedStrategy(prop, opp);
      }
      allOpportunities.push(opp);
    }
  }

  return allOpportunities.sort(
    (a, b) => b.priority.totalScore - a.priority.totalScore
  );
}

export const INITIAL_DEMO_ACTIONS: HostActionLog[] = [
  {
    id: 'act_1',
    opportunityId: 'opp_demo_prop_1_2026-11-20_2026-11-22',
    propertyId: 'demo_prop_1',
    actionType: 'offer_sent',
    description:
      '[DEMO] Sent 2-night extension offer ($203/night, 0 cleaning fee) to departing guest for Nov 20–22 gap.',
    createdAt: '2026-11-15T18:12:00Z',
  },
  {
    id: 'act_2',
    opportunityId: 'opp_demo_prop_2_2026-12-04_2026-12-07',
    propertyId: 'demo_prop_2',
    actionType: 'marked_filled',
    description:
      '[DEMO] Confirmed 3-night gap recovery booking for Dec 04–07 at Sedona Red Rock Casita ($810 sample gross).',
    recoveredAmount: 810,
    createdAt: '2026-11-14T16:40:00Z',
  },
  {
    id: 'act_3',
    opportunityId: 'opp_demo_prop_3_2026-12-01_2026-12-05',
    propertyId: 'demo_prop_3',
    actionType: 'marked_filled',
    description:
      '[DEMO] Recorded 4-night gap recovery booking for Dec 01–05 at Lisbon Alfama River Terrace ($620 sample gross).',
    recoveredAmount: 620,
    createdAt: '2026-11-13T11:20:00Z',
  },
  {
    id: 'act_4',
    opportunityId: 'opp_demo_prop_2_2026-11-21_2026-11-23',
    propertyId: 'demo_prop_2',
    actionType: 'strategy_generated',
    description:
      '[DEMO] Generated sample pricing & minimum-stay strategy for Nov 21–23 orphan window (2 nights).',
    createdAt: '2026-11-15T09:45:00Z',
  },
];

export const INITIAL_DEMO_SYNC_RUNS: SyncRunLog[] = [
  {
    id: 'sync_1',
    propertyId: 'demo_prop_1',
    calendarConnectionId: 'demo_cal_1',
    startedAt: '2026-11-16T05:29:58Z',
    completedAt: '2026-11-16T05:30:00Z',
    status: 'success',
    reservationsUpserted: 4,
    gapsRecalculated: 2,
    message: '[DEMO] Sample RFC 5545 iCal feed parsed locally in sandbox.',
  },
  {
    id: 'sync_2',
    propertyId: 'demo_prop_2',
    calendarConnectionId: 'demo_cal_2',
    startedAt: '2026-11-16T04:14:57Z',
    completedAt: '2026-11-16T04:15:00Z',
    status: 'success',
    reservationsUpserted: 4,
    gapsRecalculated: 3,
    message: '[DEMO] Sample merged iCal feed synchronized with zero duplicate UIDs.',
  },
  {
    id: 'sync_3',
    propertyId: 'demo_prop_3',
    calendarConnectionId: 'demo_cal_3',
    startedAt: '2026-11-15T05:59:56Z',
    completedAt: '2026-11-15T06:00:00Z',
    status: 'success',
    reservationsUpserted: 3,
    gapsRecalculated: 2,
    message: '[DEMO] Sample import: 3 bookings; 1 ambiguous RRULE flagged.',
  },
];

/**
 * Runs simulated RFC 5545 calendar sync strictly locally in DEMO mode.
 * Never touches /api/calendar/sync or live customer records.
 */
export function runLocalDemoCalendarSync(
  property: Pick<Property, 'id' | 'name' | 'timezone'>,
  simulationMode: 'standard' | 'with_cancellation' | 'malformed' = 'standard'
): {
  ok: boolean;
  syncStatus: CalendarSyncStatus;
  events: NormalizedIcalEvent[];
  flaggedAmbiguousCount: number;
  cancelledCount: number;
  lastSyncedAt: string;
  errorMessage: string | null;
} {
  const icsContent = buildSampleAirbnbIcsFeed(property, simulationMode);
  const parsed = parseAndNormalizeIcalFeed(icsContent, property.timezone);
  const nowIso = new Date().toISOString();

  if (!parsed.ok) {
    return {
      ok: false,
      syncStatus: 'error',
      events: [],
      flaggedAmbiguousCount: 0,
      cancelledCount: 0,
      lastSyncedAt: nowIso,
      errorMessage: parsed.errorMessage ?? 'Malformed demo iCal feed.',
    };
  }

  return {
    ok: true,
    syncStatus: parsed.flaggedAmbiguousCount > 0 ? 'warning' : 'healthy',
    events: parsed.events,
    flaggedAmbiguousCount: parsed.flaggedAmbiguousCount,
    cancelledCount: parsed.cancelledCount,
    lastSyncedAt: nowIso,
    errorMessage: null,
  };
}
