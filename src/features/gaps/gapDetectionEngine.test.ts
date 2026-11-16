import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzePropertyOccupancyAndGaps,
  normalizePropertyReservations,
} from './gapDetectionEngine';
import { Property, Reservation } from '../../types/gapfill';

const SAMPLE_PROPERTY: Property = {
  id: 'prop_gap_test',
  name: 'Nice Promenade Loft',
  propertyType: 'Loft',
  city: 'Nice',
  country: 'France',
  timezone: 'Europe/Paris',
  currency: 'EUR',
  defaultNightlyRate: 240,
  minimumBookingLength: 3,
  minimumAcceptableNightlyPrice: 185,
  maximumAcceptableDiscount: 20,
  analysisHorizonDays: 90,
  status: 'active',
  createdAt: '2026-11-01T00:00:00Z',
};

test('normalizePropertyReservations merges nested and overlapping stays while keeping back-to-back turnovers distinct', () => {
  const reservations: Reservation[] = [
    {
      id: 'r_outer',
      propertyId: 'prop_gap_test',
      sourceUid: 'uid_1',
      checkInDate: '2026-11-16',
      checkOutDate: '2026-11-24',
      status: 'confirmed',
      summaryLabel: 'Outer 8-night stay',
      updatedAt: '2026-11-10T00:00:00Z',
    },
    {
      id: 'r_nested',
      propertyId: 'prop_gap_test',
      sourceUid: 'uid_2',
      checkInDate: '2026-11-18',
      checkOutDate: '2026-11-20',
      status: 'confirmed',
      summaryLabel: 'Nested duplicate sub-stay',
      updatedAt: '2026-11-10T00:00:00Z',
    },
    {
      id: 'r_turnover',
      propertyId: 'prop_gap_test',
      sourceUid: 'uid_3',
      checkInDate: '2026-11-24',
      checkOutDate: '2026-11-27',
      status: 'confirmed',
      summaryLabel: 'Same-day turnover stay',
      updatedAt: '2026-11-10T00:00:00Z',
    },
    {
      id: 'r_cancelled',
      propertyId: 'prop_gap_test',
      sourceUid: 'uid_4',
      checkInDate: '2026-11-27',
      checkOutDate: '2026-11-30',
      status: 'cancelled',
      summaryLabel: 'Cancelled booking',
      updatedAt: '2026-11-10T00:00:00Z',
    },
  ];

  const normalized = normalizePropertyReservations({
    propertyId: 'prop_gap_test',
    reservations,
  });

  assert.equal(normalized.ignoredCancelledCount, 1);
  assert.equal(normalized.mergedOverlapsCount, 1);
  assert.equal(normalized.normalizedBlocks.length, 2);
  assert.equal(normalized.normalizedBlocks[0]?.checkInDate, '2026-11-16');
  assert.equal(normalized.normalizedBlocks[0]?.checkOutDate, '2026-11-24');
  assert.equal(normalized.normalizedBlocks[0]?.hadOverlapMerged, true);
  assert.equal(normalized.normalizedBlocks[1]?.checkInDate, '2026-11-24');
  assert.equal(normalized.normalizedBlocks[1]?.checkOutDate, '2026-11-27');
});

test('analyzePropertyOccupancyAndGaps prevents false gaps from nested stays and classifies consecutive pairs', () => {
  const reservations: Reservation[] = [
    {
      id: 'r_1',
      propertyId: 'prop_gap_test',
      sourceUid: 'uid_1',
      checkInDate: '2026-11-16',
      checkOutDate: '2026-11-24',
      status: 'confirmed',
      summaryLabel: 'Primary 8-night stay',
      updatedAt: '2026-11-10T00:00:00Z',
    },
    {
      id: 'r_nested',
      propertyId: 'prop_gap_test',
      sourceUid: 'uid_nested',
      checkInDate: '2026-11-18',
      checkOutDate: '2026-11-20',
      status: 'confirmed',
      summaryLabel: 'Nested channel sync',
      updatedAt: '2026-11-10T00:00:00Z',
    },
    {
      id: 'r_2',
      propertyId: 'prop_gap_test',
      sourceUid: 'uid_2',
      checkInDate: '2026-11-26',
      checkOutDate: '2026-11-30',
      status: 'confirmed',
      summaryLabel: 'Next stay after 2-night gap',
      updatedAt: '2026-11-10T00:00:00Z',
    },
    {
      id: 'r_3',
      propertyId: 'prop_gap_test',
      sourceUid: 'uid_3',
      checkInDate: '2026-11-30',
      checkOutDate: '2026-12-04',
      status: 'confirmed',
      summaryLabel: 'Back-to-back stay',
      updatedAt: '2026-11-10T00:00:00Z',
    },
  ];

  const report = analyzePropertyOccupancyAndGaps({
    property: SAMPLE_PROPERTY,
    reservations,
    referenceDateStr: '2026-11-16',
    hoursSinceLastSync: 1,
  });

  // Only 1 true orphan gap (Nov 24 -> Nov 26, 2 nights)
  assert.equal(report.opportunities.length, 1);
  assert.equal(report.opportunities[0]?.gapStartDate, '2026-11-24');
  assert.equal(report.opportunities[0]?.gapEndDate, '2026-11-26');
  assert.equal(report.opportunities[0]?.emptyNights, 2);
  assert.equal(report.opportunities[0]?.isMinStayCompatible, false);

  // 2 consecutive pair evaluations: (Nov 24 -> Nov 26 orphan gap) and (Nov 30 -> Nov 30 turnover)
  assert.equal(report.pairEvaluations.length, 2);
  assert.equal(report.pairEvaluations[0]?.classification, 'orphan_gap_detected');
  assert.equal(report.pairEvaluations[1]?.classification, 'back_to_back_turnover');
});

test('analyzePropertyOccupancyAndGaps returns zero opportunities when property is inactive', () => {
  const inactiveProp: Property = { ...SAMPLE_PROPERTY, status: 'inactive' };
  const reservations: Reservation[] = [
    {
      id: 'r_1',
      propertyId: 'prop_gap_test',
      sourceUid: 'uid_1',
      checkInDate: '2026-11-16',
      checkOutDate: '2026-11-20',
      status: 'confirmed',
      summaryLabel: 'Stay 1',
      updatedAt: '2026-11-10T00:00:00Z',
    },
    {
      id: 'r_2',
      propertyId: 'prop_gap_test',
      sourceUid: 'uid_2',
      checkInDate: '2026-11-22',
      checkOutDate: '2026-11-26',
      status: 'confirmed',
      summaryLabel: 'Stay 2',
      updatedAt: '2026-11-10T00:00:00Z',
    },
  ];

  const report = analyzePropertyOccupancyAndGaps({
    property: inactiveProp,
    reservations,
    referenceDateStr: '2026-11-16',
    hoursSinceLastSync: 1,
  });

  assert.equal(report.opportunities.length, 0);
});
