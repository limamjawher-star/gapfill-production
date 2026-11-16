import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateGapFinancials,
  calculateOpportunityPriority,
  detectOrphanGaps,
  diffCalendarNights,
} from './engines';
import { Property, Reservation } from '../types/gapfill';

const sampleProperty: Property = {
  id: 'prop_1',
  name: 'Le Marais Courtyard Loft',
  propertyType: 'Loft',
  city: 'Paris',
  country: 'France',
  timezone: 'Europe/Paris',
  currency: 'EUR',
  defaultNightlyRate: 240,
  minimumBookingLength: 3,
  minimumAcceptableNightlyPrice: 185,
  maximumAcceptableDiscount: 20,
  analysisHorizonDays: 90,
  status: 'active',
  createdAt: '2026-11-01T10:00:00Z',
};

test('RFC 5545 date difference calculates exact empty nights (DTSTART inclusive, DTEND exclusive)', () => {
  // Booking A checkout June 9, Booking B check-in June 12 -> June 9, 10, 11 = 3 empty nights
  assert.equal(diffCalendarNights('2026-06-09', '2026-06-12'), 3);
  // Same-day turnover -> 0 empty nights
  assert.equal(diffCalendarNights('2026-06-09', '2026-06-09'), 0);
});

test('Financial engine calculates gross estimates and enforces floor price', () => {
  // 3 nights @ 200, max discount 15%, floor 160, 5 days out -> 15% discount = 170/night
  const res1 = calculateGapFinancials({
    emptyNights: 3,
    baseNightlyRate: 200,
    maximumAcceptableDiscount: 15,
    minimumAcceptableRate: 160,
    daysUntilStart: 5,
  });
  assert.equal(res1.baseGross, 600);
  assert.equal(res1.suggestedNightlyRate, 170);
  assert.equal(res1.suggestedGross, 510);
  assert.equal(res1.floorPriceEnforced, false);

  // Floor price clamping: 240 base, 30% max discount would be 168, but floor is 195
  const res2 = calculateGapFinancials({
    emptyNights: 2,
    baseNightlyRate: 240,
    maximumAcceptableDiscount: 30,
    minimumAcceptableRate: 195,
    daysUntilStart: 4,
  });
  assert.equal(res2.suggestedNightlyRate, 195);
  assert.equal(res2.suggestedGross, 390);
  assert.equal(res2.floorPriceEnforced, true);
});

test('Gap detection finds only true orphan gaps between confirmed reservations', () => {
  const reservations: Reservation[] = [
    {
      id: 'res_a',
      propertyId: 'prop_1',
      sourceUid: 'uid_1',
      checkInDate: '2026-11-18',
      checkOutDate: '2026-11-22',
      status: 'confirmed',
      summaryLabel: 'Reservation A',
      updatedAt: '2026-11-15T10:00:00Z',
    },
    {
      // 2-night gap: Nov 22 to Nov 24 (blocked by 3-night min stay)
      id: 'res_b',
      propertyId: 'prop_1',
      sourceUid: 'uid_2',
      checkInDate: '2026-11-24',
      checkOutDate: '2026-11-28',
      status: 'confirmed',
      summaryLabel: 'Reservation B',
      updatedAt: '2026-11-15T10:00:00Z',
    },
    {
      // Back-to-back turnover: Nov 28 to Nov 28 -> 0 nights (must not generate gap)
      id: 'res_c',
      propertyId: 'prop_1',
      sourceUid: 'uid_3',
      checkInDate: '2026-11-28',
      checkOutDate: '2026-12-02',
      status: 'confirmed',
      summaryLabel: 'Reservation C',
      updatedAt: '2026-11-15T10:00:00Z',
    },
    {
      // Canceled booking must be ignored
      id: 'res_canceled',
      propertyId: 'prop_1',
      sourceUid: 'uid_4',
      checkInDate: '2026-12-03',
      checkOutDate: '2026-12-04',
      status: 'canceled',
      summaryLabel: 'Canceled Booking',
      updatedAt: '2026-11-15T10:00:00Z',
    },
    {
      // 3-night gap from Dec 02 to Dec 05 (compatible with 3-night min stay)
      id: 'res_d',
      propertyId: 'prop_1',
      sourceUid: 'uid_5',
      checkInDate: '2026-12-05',
      checkOutDate: '2026-12-10',
      status: 'confirmed',
      summaryLabel: 'Reservation D',
      updatedAt: '2026-11-15T10:00:00Z',
    },
  ];

  const gaps = detectOrphanGaps({
    property: sampleProperty,
    reservations,
    referenceDateStr: '2026-11-16',
    hoursSinceLastSync: 2,
  });

  assert.equal(gaps.length, 2);

  // First gap: Nov 22 -> Nov 24 (2 nights, min-stay incompatible)
  assert.equal(gaps[0].gapStartDate, '2026-11-22');
  assert.equal(gaps[0].gapEndDate, '2026-11-24');
  assert.equal(gaps[0].emptyNights, 2);
  assert.equal(gaps[0].isMinStayCompatible, false);

  // Second gap: Dec 02 -> Dec 05 (3 nights, min-stay compatible)
  assert.equal(gaps[1].gapStartDate, '2026-12-02');
  assert.equal(gaps[1].gapEndDate, '2026-12-05');
  assert.equal(gaps[1].emptyNights, 3);
  assert.equal(gaps[1].isMinStayCompatible, true);
});

test('Priority score engine respects 0-100 bounds and component weights', () => {
  const priority = calculateOpportunityPriority({
    daysUntilStart: 5, // 30 pts
    emptyNights: 3, // 25 pts
    suggestedGross: 650, // 20 pts
    baseNightlyRate: 240,
    minimumBookingLength: 3, // 15 pts
    hoursSinceLastSync: 1, // 10 pts
  });

  assert.equal(priority.totalScore, 100);
  assert.equal(priority.label, 'High priority');
  assert.equal(priority.explanations.length, 5);
});
