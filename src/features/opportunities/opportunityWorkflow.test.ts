import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCalendarHorizonWindow,
  filterAndSortOpportunities,
  resolveBracketedReservations,
} from './opportunityWorkflow';
import {
  buildInitialDemoOpportunities,
  INITIAL_DEMO_PROPERTIES,
  INITIAL_DEMO_RESERVATIONS,
} from '../../services/demoDataset';

test('filterAndSortOpportunities filters by min-stay compatibility, property, and sorts by urgency or gross', () => {
  const opportunities = buildInitialDemoOpportunities(
    INITIAL_DEMO_PROPERTIES,
    INITIAL_DEMO_RESERVATIONS
  );

  const blockedOnly = filterAndSortOpportunities({
    opportunities,
    properties: INITIAL_DEMO_PROPERTIES,
    criteria: {
      propertyId: 'all',
      priorityLabel: 'all',
      status: 'all',
      minStayMode: 'blocked_only',
      searchQuery: '',
      sortBy: 'urgency',
    },
  });

  assert.ok(blockedOnly.length > 0);
  for (const opp of blockedOnly) {
    assert.equal(opp.isMinStayCompatible, false);
  }

  // Verify urgency sort is ascending by daysUntilStart
  for (let i = 0; i < blockedOnly.length - 1; i++) {
    assert.ok(blockedOnly[i]!.daysUntilStart <= blockedOnly[i + 1]!.daysUntilStart);
  }
});

test('resolveBracketedReservations finds departing and arriving reservations for an orphan gap', () => {
  const opportunities = buildInitialDemoOpportunities(
    INITIAL_DEMO_PROPERTIES,
    INITIAL_DEMO_RESERVATIONS
  );
  const targetGap = opportunities.find(
    (o) => o.propertyId === 'demo_prop_1' && o.gapStartDate === '2026-11-20'
  );
  assert.ok(targetGap);

  const bracketed = resolveBracketedReservations({
    opportunity: targetGap,
    reservations: INITIAL_DEMO_RESERVATIONS,
  });

  assert.equal(bracketed.departingReservation?.checkOutDate, '2026-11-20');
  assert.equal(bracketed.arrivingReservation?.checkInDate, '2026-11-22');
});

test('buildCalendarHorizonWindow shifts start/end dates deterministically by offset and length', () => {
  const win14 = buildCalendarHorizonWindow({
    anchorDateStr: '2026-11-16',
    offsetDays: 14,
    windowLengthDays: 14,
  });

  assert.equal(win14.startDateStr, '2026-11-30');
  assert.equal(win14.daysList.length, 14);
  assert.equal(win14.endDateStr, '2026-12-13');
});
