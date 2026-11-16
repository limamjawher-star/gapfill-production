import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregatePortfolioRevenueByCurrency,
  calculateOpportunityPriority,
  getPriorityComponentBreakdownList,
  simulateCustomGapPricing,
} from './financialAndPriorityEngine';
import { GapOpportunity, Property } from '../../types/gapfill';

test('simulateCustomGapPricing enforces floor price and max discount cap', () => {
  // Base $260, floor $215, max discount 25%, request 25% -> 260 * 0.75 = 195 -> clamped to $215
  const clamped = simulateCustomGapPricing({
    emptyNights: 3,
    baseNightlyRate: 260,
    requestedDiscountPercent: 25,
    maximumAcceptableDiscount: 25,
    minimumAcceptableRate: 215,
  });

  assert.equal(clamped.floorPriceEnforced, true);
  assert.equal(clamped.suggestedNightlyRate, 215);
  assert.equal(clamped.baseGross, 780);
  assert.equal(clamped.suggestedGross, 645);
  assert.equal(clamped.grossConcessionAmount, 135);

  // Within floor: Base $300, floor $200, max discount 20%, request 10% -> $270/nt
  const normal = simulateCustomGapPricing({
    emptyNights: 2,
    baseNightlyRate: 300,
    requestedDiscountPercent: 10,
    maximumAcceptableDiscount: 20,
    minimumAcceptableRate: 200,
  });

  assert.equal(normal.floorPriceEnforced, false);
  assert.equal(normal.suggestedNightlyRate, 270);
  assert.equal(normal.suggestedGross, 540);
  assert.equal(normal.grossConcessionAmount, 60);
});

test('getPriorityComponentBreakdownList returns 5 weighted components summing to totalScore', () => {
  const priority = calculateOpportunityPriority({
    daysUntilStart: 4,
    emptyNights: 3,
    suggestedGross: 645,
    baseNightlyRate: 260,
    minimumBookingLength: 3,
    hoursSinceLastSync: 2,
  });

  const components = getPriorityComponentBreakdownList(priority);
  assert.equal(components.length, 5);

  const maxSum = components.reduce((acc, c) => acc + c.maxPoints, 0);
  const earnedSum = components.reduce((acc, c) => acc + c.earnedPoints, 0);

  assert.equal(maxSum, 100);
  assert.equal(earnedSum, priority.totalScore);
  assert.equal(priority.totalScore, 100);
});

test('aggregatePortfolioRevenueByCurrency separates estimated open gross from actual recovered revenue per currency', () => {
  const properties: Property[] = [
    {
      id: 'p_usd',
      name: 'Sedona Casita',
      propertyType: 'House',
      city: 'Sedona',
      country: 'US',
      timezone: 'America/Phoenix',
      currency: 'USD',
      defaultNightlyRate: 300,
      minimumBookingLength: 2,
      minimumAcceptableNightlyPrice: 220,
      maximumAcceptableDiscount: 20,
      analysisHorizonDays: 90,
      status: 'active',
      createdAt: '2026-11-01T00:00:00Z',
    },
    {
      id: 'p_eur',
      name: 'Nice Loft',
      propertyType: 'Loft',
      city: 'Nice',
      country: 'France',
      timezone: 'Europe/Paris',
      currency: 'EUR',
      defaultNightlyRate: 200,
      minimumBookingLength: 2,
      minimumAcceptableNightlyPrice: 150,
      maximumAcceptableDiscount: 20,
      analysisHorizonDays: 90,
      status: 'active',
      createdAt: '2026-11-01T00:00:00Z',
    },
  ];

  const basePriority = calculateOpportunityPriority({
    daysUntilStart: 5,
    emptyNights: 2,
    suggestedGross: 500,
    baseNightlyRate: 250,
    minimumBookingLength: 2,
    hoursSinceLastSync: 1,
  });

  const opportunities: GapOpportunity[] = [
    {
      id: 'o_1',
      propertyId: 'p_usd',
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
        baseNightlyRate: 300,
        recommendedDiscountPercent: 15,
        maxAllowedDiscountPercent: 20,
        minimumAcceptableRate: 220,
        baseGross: 600,
        suggestedNightlyRate: 255,
        suggestedGross: 510,
        floorPriceEnforced: false,
      },
      priority: basePriority,
      status: 'new',
      actualRecoveredRevenue: null,
      filledAt: null,
    },
    {
      id: 'o_2',
      propertyId: 'p_eur',
      gapStartDate: '2026-11-24',
      gapEndDate: '2026-11-27',
      emptyNights: 3,
      daysUntilStart: 8,
      previousReservationId: 'r3',
      nextReservationId: 'r4',
      isMinStayCompatible: true,
      minStayRequired: 2,
      financials: {
        emptyNights: 3,
        baseNightlyRate: 200,
        recommendedDiscountPercent: 10,
        maxAllowedDiscountPercent: 20,
        minimumAcceptableRate: 150,
        baseGross: 600,
        suggestedNightlyRate: 180,
        suggestedGross: 540,
        floorPriceEnforced: false,
      },
      priority: basePriority,
      status: 'filled',
      actualRecoveredRevenue: 525,
      filledAt: '2026-11-16T08:00:00Z',
    },
  ];

  const summary = aggregatePortfolioRevenueByCurrency({
    properties,
    opportunities,
  });

  assert.equal(summary.hasMultipleCurrencies, true);
  assert.equal(summary.buckets.length, 2);

  const usdBucket = summary.buckets.find((b) => b.currency === 'USD');
  const eurBucket = summary.buckets.find((b) => b.currency === 'EUR');

  assert.equal(usdBucket?.estimatedOpenGross, 510);
  assert.equal(usdBucket?.actualRecoveredGross, 0);
  assert.equal(eurBucket?.estimatedOpenGross, 0);
  assert.equal(eurBucket?.actualRecoveredGross, 525);
});
