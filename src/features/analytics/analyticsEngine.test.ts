import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMonthlyTrendSeries,
  buildPropertyAnalyticsBreakdown,
  computeActionFunnelMetrics,
  filterActivityLogs,
  filterSyncRuns,
  formatActivityAuditCsv,
} from './analyticsEngine';
import {
  GapOpportunity,
  HostActionLog,
  Property,
  SyncRunLog,
} from '../../types/gapfill';

const PROPS: Property[] = [
  {
    id: 'p1',
    name: 'Sedona Red Rock Casita',
    propertyType: 'House',
    city: 'Sedona',
    country: 'United States',
    timezone: 'America/Phoenix',
    currency: 'USD',
    defaultNightlyRate: 320,
    minimumBookingLength: 2,
    minimumAcceptableNightlyPrice: 240,
    maximumAcceptableDiscount: 20,
    analysisHorizonDays: 90,
    status: 'active',
    createdAt: '2026-10-01T00:00:00Z',
  },
  {
    id: 'p2',
    name: 'Marais Studio',
    propertyType: 'Studio',
    city: 'Paris',
    country: 'France',
    timezone: 'Europe/Paris',
    currency: 'EUR',
    defaultNightlyRate: 200,
    minimumBookingLength: 2,
    minimumAcceptableNightlyPrice: 150,
    maximumAcceptableDiscount: 20,
    analysisHorizonDays: 90,
    status: 'active',
    createdAt: '2026-10-01T00:00:00Z',
  },
];

function makeOpp(
  id: string,
  propertyId: string,
  gapStartDate: string,
  status: GapOpportunity['status'],
  suggestedGross: number,
  actualRecoveredRevenue: number | null
): GapOpportunity {
  return {
    id,
    propertyId,
    gapStartDate,
    gapEndDate: '2026-12-09',
    emptyNights: 2,
    daysUntilStart: 10,
    previousReservationId: 'r1',
    nextReservationId: 'r2',
    isMinStayCompatible: true,
    minStayRequired: 2,
    financials: {
      emptyNights: 2,
      baseNightlyRate: 300,
      recommendedDiscountPercent: 15,
      maxAllowedDiscountPercent: 20,
      minimumAcceptableRate: 220,
      baseGross: 600,
      suggestedNightlyRate: suggestedGross / 2,
      suggestedGross,
      floorPriceEnforced: false,
    },
    priority: {
      totalScore: 85,
      label: 'High priority',
      timeUntilGapPoints: 25,
      gapLengthPoints: 20,
      estimatedRevenuePoints: 15,
      minStayCompatibilityPoints: 15,
      calendarFreshnessPoints: 10,
      explanations: [],
    },
    status,
    actualRecoveredRevenue,
    filledAt: status === 'filled' ? '2026-11-16T00:00:00Z' : null,
  };
}

const OPPS: GapOpportunity[] = [
  makeOpp('o1', 'p1', '2026-11-21', 'new', 500, null),
  makeOpp('o2', 'p1', '2026-12-04', 'filled', 816, 810),
  makeOpp('o3', 'p2', '2026-12-10', 'actioned', 360, null),
];

const ACTIONS: HostActionLog[] = [
  {
    id: 'a1',
    opportunityId: 'o2',
    propertyId: 'p1',
    actionType: 'marked_filled',
    description: '=SUM(1,2) Confirmed booking $810',
    recoveredAmount: 810,
    createdAt: '2026-11-16T08:00:00Z',
  },
  {
    id: 'a2',
    opportunityId: 'o3',
    propertyId: 'p2',
    actionType: 'message_copied',
    description: 'Copied extension offer',
    createdAt: '2026-11-16T09:00:00Z',
  },
];

const SYNCS: SyncRunLog[] = [
  {
    id: 's1',
    propertyId: 'p1',
    calendarConnectionId: 'c1',
    startedAt: '2026-11-16T09:00:00Z',
    completedAt: '2026-11-16T09:00:01Z',
    status: 'success',
    reservationsUpserted: 4,
    gapsRecalculated: 2,
    message: 'Synced cleanly',
  },
  {
    id: 's2',
    propertyId: 'p2',
    calendarConnectionId: 'c2',
    startedAt: '2026-11-16T09:05:00Z',
    completedAt: '2026-11-16T09:05:01Z',
    status: 'error',
    reservationsUpserted: 0,
    gapsRecalculated: 0,
    message: 'Malformed VCALENDAR',
  },
];

test('computeActionFunnelMetrics separates filled baseline from recovered variance accurately', () => {
  const funnel = computeActionFunnelMetrics(OPPS, ACTIONS);
  assert.equal(funnel.totalDetected, 3);
  assert.equal(funnel.newCount, 1);
  assert.equal(funnel.actionedCount, 1);
  assert.equal(funnel.filledCount, 1);
  assert.equal(funnel.filledSuggestedBaseline, 816);
  assert.equal(funnel.filledActualRecovered, 810);
  assert.equal(funnel.filledVarianceNominal, -6);
  assert.equal(funnel.actionToFillRatePct, 50);
  assert.equal(funnel.totalActionsLogged, 2);
});

test('buildPropertyAnalyticsBreakdown & buildMonthlyTrendSeries separate open estimates vs recovered', () => {
  const byProp = buildPropertyAnalyticsBreakdown(PROPS, OPPS);
  assert.equal(byProp[0].estimatedOpportunity, 500);
  assert.equal(byProp[0].actualRecovered, 810);
  assert.equal(byProp[1].currency, 'EUR');
  assert.equal(byProp[1].estimatedOpportunity, 360);

  const monthly = buildMonthlyTrendSeries(OPPS);
  assert.equal(monthly.length, 2);
  assert.equal(monthly[0].yearMonth, '2026-11');
  assert.equal(monthly[0].estimatedOpportunity, 500);
  assert.equal(monthly[1].yearMonth, '2026-12');
  assert.equal(monthly[1].actualRecovered, 810);
  assert.equal(monthly[1].estimatedOpportunity, 360);
});

test('filterActivityLogs, filterSyncRuns, and formatActivityAuditCsv protect against CSV injection', () => {
  const filteredActions = filterActivityLogs({
    actions: ACTIONS,
    properties: PROPS,
    propertyId: 'p1',
    actionType: 'marked_filled',
    searchQuery: '810',
  });
  assert.equal(filteredActions.length, 1);

  const failedSyncs = filterSyncRuns({
    syncRuns: SYNCS,
    properties: PROPS,
    propertyId: 'all',
    syncStatus: 'error',
    searchQuery: 'malformed',
  });
  assert.equal(failedSyncs.length, 1);
  assert.equal(failedSyncs[0].id, 's2');

  const csv = formatActivityAuditCsv(ACTIONS, PROPS);
  assert.ok(csv.includes('"' + "'" + '=SUM(1,2) Confirmed booking $810"'));
});
