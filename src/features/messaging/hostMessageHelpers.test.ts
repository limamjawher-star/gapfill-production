import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAirbnbHostOutreachDraft,
  sanitizeEditableDraft,
} from './hostMessageHelpers';
import { GapOpportunity, Property } from '../../types/gapfill';

const SAMPLE_PROP: Property = {
  id: 'prop_paris',
  name: 'Canal Saint-Martin Loft',
  propertyType: 'Loft',
  city: 'Paris',
  country: 'France',
  timezone: 'Europe/Paris',
  currency: 'EUR',
  defaultNightlyRate: 240,
  minimumBookingLength: 2,
  minimumAcceptableNightlyPrice: 180,
  maximumAcceptableDiscount: 25,
  analysisHorizonDays: 90,
  status: 'active',
  createdAt: '2026-10-01T00:00:00Z',
};

const SAMPLE_OPP: GapOpportunity = {
  id: 'opp_1',
  propertyId: 'prop_paris',
  gapStartDate: '2026-11-20',
  gapEndDate: '2026-11-22',
  emptyNights: 2,
  daysUntilStart: 4,
  previousReservationId: 'r1',
  nextReservationId: 'r2',
  isMinStayCompatible: true,
  minStayRequired: 2,
  financials: {
    emptyNights: 2,
    baseNightlyRate: 240,
    recommendedDiscountPercent: 20,
    maxAllowedDiscountPercent: 25,
    minimumAcceptableRate: 180,
    baseGross: 480,
    suggestedNightlyRate: 192,
    suggestedGross: 384,
    floorPriceEnforced: false,
  },
  priority: {
    totalScore: 88,
    label: 'High priority',
    timeUntilGapPoints: 25,
    gapLengthPoints: 20,
    estimatedRevenuePoints: 18,
    minStayCompatibilityPoints: 15,
    calendarFreshnessPoints: 10,
    explanations: [],
  },
  status: 'new',
  actualRecoveredRevenue: null,
  filledAt: null,
};

test('buildAirbnbHostOutreachDraft crafts distinct contextual messages with property currency', () => {
  const departing = buildAirbnbHostOutreachDraft({
    target: 'departing_extension',
    property: SAMPLE_PROP,
    opportunity: SAMPLE_OPP,
  });
  const arriving = buildAirbnbHostOutreachDraft({
    target: 'arriving_early',
    property: SAMPLE_PROP,
    opportunity: SAMPLE_OPP,
    overrideNightlyRate: 200,
  });
  const promo = buildAirbnbHostOutreachDraft({
    target: 'direct_promo',
    property: SAMPLE_PROP,
    opportunity: SAMPLE_OPP,
  });

  assert.match(departing, /Canal Saint-Martin Loft/);
  assert.match(departing, /€192\/night/);
  assert.match(departing, /alteration request/i);

  assert.match(arriving, /€200\/night/);
  assert.match(arriving, /€400 total/);
  assert.match(arriving, /settle in early/i);

  assert.match(promo, /Paris/);
});

test('sanitizeEditableDraft trims whitespace and removes control characters', () => {
  const cleaned = sanitizeEditableDraft('  Hello\u0007 world  \n');
  assert.equal(cleaned, 'Hello world');
});
