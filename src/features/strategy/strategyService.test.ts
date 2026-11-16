import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAnonymizedStrategyPayload,
  classifyGeminiApiError,
  detectPiiOrDisallowedKeys,
  GEMINI_FREE_TIER_MODEL,
  validateAndNormalizeStrategyResponse,
} from './strategyService';
import { GapOpportunity, Property } from '../../types/gapfill';

const SAMPLE_PROP: Property = {
  id: 'prop_paris_1',
  name: 'Canal Saint-Martin Design Loft',
  propertyType: 'Loft',
  city: 'Paris',
  country: 'France',
  timezone: 'Europe/Paris',
  currency: 'EUR',
  defaultNightlyRate: 240,
  minimumBookingLength: 3,
  minimumAcceptableNightlyPrice: 180,
  maximumAcceptableDiscount: 25,
  analysisHorizonDays: 90,
  status: 'active',
  createdAt: '2026-10-01T00:00:00Z',
};

const SAMPLE_OPP: GapOpportunity = {
  id: 'opp_1',
  propertyId: 'prop_paris_1',
  gapStartDate: '2026-11-27',
  gapEndDate: '2026-11-30',
  emptyNights: 3,
  daysUntilStart: 11,
  previousReservationId: 'res_1',
  nextReservationId: 'res_2',
  isMinStayCompatible: true,
  minStayRequired: 3,
  financials: {
    emptyNights: 3,
    baseNightlyRate: 240,
    recommendedDiscountPercent: 20,
    maxAllowedDiscountPercent: 25,
    minimumAcceptableRate: 180,
    baseGross: 720,
    suggestedNightlyRate: 192,
    suggestedGross: 576,
    floorPriceEnforced: false,
  },
  priority: {
    totalScore: 95,
    label: 'High priority',
    timeUntilGapPoints: 25,
    gapLengthPoints: 25,
    estimatedRevenuePoints: 20,
    minStayCompatibilityPoints: 15,
    calendarFreshnessPoints: 10,
    explanations: [],
  },
  status: 'new',
  actualRecoveredRevenue: null,
  filledAt: null,
};

test('buildAnonymizedStrategyPayload strips PII keys and passes zero-PII audit', () => {
  const payload = buildAnonymizedStrategyPayload(
    SAMPLE_PROP,
    SAMPLE_OPP,
    'guest_extension'
  );
  assert.equal(payload.city, 'Paris');
  assert.equal(payload.currency, 'EUR');
  assert.equal(payload.strategyFocus, 'guest_extension');
  assert.equal('name' in payload, false);
  const audit = detectPiiOrDisallowedKeys(payload as unknown as Record<string, unknown>);
  assert.equal(audit.safe, true);
  assert.deepEqual(audit.violations, []);
});

test('detectPiiOrDisallowedKeys flags disallowed PII keys, emails, phones, and iCal URLs', () => {
  const dirtyPayload = {
    city: 'Paris',
    guestName: 'Jane Doe',
    note: 'Contact jane@example.com or https://airbnb.com/calendar/ical/secret.ics',
    contactNumber: '+33 6 12 34 56 78',
  };
  const audit = detectPiiOrDisallowedKeys(dirtyPayload);
  assert.equal(audit.safe, false);
  assert.ok(audit.violations.length >= 3);
});

test('validateAndNormalizeStrategyResponse validates all 7 required strategy fields', () => {
  const validRaw = {
    shortOpportunityExplanation: 'A 3-night orphan window exists between confirmed stays.',
    pricingStrategy: 'Offer €192/night (20% below base rate €240) respecting the €180 floor.',
    minimumStayRecommendation: 'Keep 3-night minimum or pitch extension to adjacent stay.',
    guestExtensionMessage: 'Hi! Extend your Paris stay 3 extra nights at €192/night.',
    socialMediaCaption: '3-night canal-side loft opening in Paris at €192/night.',
    marketingRecommendation: 'Message adjacent guests first, then update channel rate.',
    relevantCautions: ['Gross figure excludes Airbnb host fees and local tax.'],
  };

  const ok = validateAndNormalizeStrategyResponse(validRaw, {
    modelUsed: GEMINI_FREE_TIER_MODEL,
    strategyFocus: 'balanced',
  });
  assert.equal(ok.valid, true);
  if (ok.valid) {
    assert.equal(ok.strategy.source, 'gemini-free-tier');
    assert.equal(ok.strategy.modelUsed, GEMINI_FREE_TIER_MODEL);
    assert.equal(ok.strategy.relevantCautions.length, 1);
  }

  const invalid = validateAndNormalizeStrategyResponse(
    { shortOpportunityExplanation: 'Too short' },
    { modelUsed: GEMINI_FREE_TIER_MODEL, strategyFocus: 'balanced' }
  );
  assert.equal(invalid.valid, false);
});

test('classifyGeminiApiError maps 429 quota exhaustion and 403 invalid key accurately', () => {
  const quotaErr = classifyGeminiApiError({
    status: 429,
    message: 'RESOURCE_EXHAUSTED: Free tier quota exceeded',
  });
  assert.equal(quotaErr.code, 'QUOTA_EXHAUSTED');
  assert.equal(quotaErr.httpStatus, 429);

  const keyErr = classifyGeminiApiError({
    status: 403,
    message: 'PERMISSION_DENIED: API key not valid',
  });
  assert.equal(keyErr.code, 'API_KEY_INVALID');
  assert.equal(keyErr.httpStatus, 403);
});
