import {
  CurrencyCode,
  GapFinancialCalculation,
  GapOpportunity,
  PriorityScoreBreakdown,
  Property,
} from '../../types/gapfill';
import {
  calculateGapFinancials,
  calculateOpportunityPriority,
} from '../../utils/engines';
import { formatPropertyCurrency } from '../properties/propertyValidation';

export interface PriorityComponentMetric {
  id:
    | 'time_until_gap'
    | 'gap_length'
    | 'estimated_revenue'
    | 'min_stay_compatibility'
    | 'calendar_freshness';
  label: string;
  earnedPoints: number;
  maxPoints: number;
  explanation: string;
}

/**
 * Converts a PriorityScoreBreakdown into a structured 5-component list
 * with exact earned/max points (30 + 25 + 20 + 15 + 10 = 100) for UI inspection.
 */
export function getPriorityComponentBreakdownList(
  priority: PriorityScoreBreakdown
): PriorityComponentMetric[] {
  return [
    {
      id: 'time_until_gap',
      label: 'Lead Time Urgency',
      earnedPoints: priority.timeUntilGapPoints,
      maxPoints: 30,
      explanation:
        priority.explanations[0] ?? 'Urgency based on days until gap check-in.',
    },
    {
      id: 'gap_length',
      label: 'Orphan Gap Length',
      earnedPoints: priority.gapLengthPoints,
      maxPoints: 25,
      explanation:
        priority.explanations[1] ?? 'Conversion potential by empty night count.',
    },
    {
      id: 'estimated_revenue',
      label: 'Gross Revenue Potential',
      earnedPoints: priority.estimatedRevenuePoints,
      maxPoints: 20,
      explanation:
        priority.explanations[2] ??
        'Suggested gross package value relative to nightly benchmark.',
    },
    {
      id: 'min_stay_compatibility',
      label: 'Min-Stay Rule Compatibility',
      earnedPoints: priority.minStayCompatibilityPoints,
      maxPoints: 15,
      explanation:
        priority.explanations[3] ??
        'Whether the gap is bookable without overriding minimum stay rules.',
    },
    {
      id: 'calendar_freshness',
      label: 'iCal Sync Freshness',
      earnedPoints: priority.calendarFreshnessPoints,
      maxPoints: 10,
      explanation:
        priority.explanations[4] ??
        'Recency of the property iCal synchronization.',
    },
  ];
}

export interface CustomGapPricingSimulation extends GapFinancialCalculation {
  requestedDiscountPercent: number;
  grossConcessionAmount: number;
}

/**
 * Simulates a custom discount percentage on an orphan gap while strictly enforcing:
 * 1. 0 <= discount <= property.maximumAcceptableDiscount
 * 2. suggestedNightlyRate >= property.minimumAcceptableNightlyPrice (hard floor price)
 * 3. Integer minor-unit (cents) arithmetic with whole-unit nightly rounding
 */
export function simulateCustomGapPricing(params: {
  emptyNights: number;
  baseNightlyRate: number;
  requestedDiscountPercent: number;
  maximumAcceptableDiscount: number;
  minimumAcceptableRate: number;
}): CustomGapPricingSimulation {
  const emptyNights = Math.max(0, Math.floor(params.emptyNights));
  const baseRate = Math.round(params.baseNightlyRate);
  const minFloor = Math.round(params.minimumAcceptableRate);
  const maxDiscount = Math.max(
    0,
    Math.min(80, Math.round(params.maximumAcceptableDiscount))
  );

  const clampedRequestedDiscount = Math.max(
    0,
    Math.min(maxDiscount, Math.round(params.requestedDiscountPercent))
  );

  // Calculate using integer cents first to avoid floating-point drift
  const baseRateCents = baseRate * 100;
  const discountedCents = Math.round(
    (baseRateCents * (100 - clampedRequestedDiscount)) / 100
  );
  const rawSuggestedRate = Math.round(discountedCents / 100);

  const floorPriceEnforced = rawSuggestedRate < minFloor;
  const suggestedNightlyRate = Math.max(minFloor, rawSuggestedRate);

  const effectiveDiscountPct =
    baseRate > 0
      ? Math.max(
          0,
          Math.round(((baseRate - suggestedNightlyRate) / baseRate) * 100)
        )
      : 0;

  const baseGross = emptyNights * baseRate;
  const suggestedGross = emptyNights * suggestedNightlyRate;
  const grossConcessionAmount = Math.max(0, baseGross - suggestedGross);

  return {
    emptyNights,
    baseNightlyRate: baseRate,
    recommendedDiscountPercent: effectiveDiscountPct,
    maxAllowedDiscountPercent: maxDiscount,
    minimumAcceptableRate: minFloor,
    baseGross,
    suggestedNightlyRate,
    suggestedGross,
    floorPriceEnforced,
    requestedDiscountPercent: clampedRequestedDiscount,
    grossConcessionAmount,
  };
}

export interface CurrencyRevenueBucket {
  currency: CurrencyCode;
  estimatedOpenGross: number;
  actualRecoveredGross: number;
  openOpportunityCount: number;
  filledOpportunityCount: number;
  formattedEstimatedOpen: string;
  formattedActualRecovered: string;
}

/**
 * Strictly separates Estimated Gross Opportunity (open/unbooked gaps) from
 * Actual Recovered Revenue (host-confirmed filled bookings), grouped by property ISO currency.
 */
export function aggregatePortfolioRevenueByCurrency(params: {
  properties: Property[];
  opportunities: GapOpportunity[];
}): {
  buckets: CurrencyRevenueBucket[];
  totalEstimatedOpenNominal: number;
  totalActualRecoveredNominal: number;
  hasMultipleCurrencies: boolean;
} {
  const propMap = new Map<string, Property>();
  for (const p of params.properties) {
    propMap.set(p.id, p);
  }

  const bucketMap = new Map<CurrencyCode, CurrencyRevenueBucket>();

  for (const opp of params.opportunities) {
    const prop = propMap.get(opp.propertyId);
    const currency: CurrencyCode = prop?.currency ?? 'USD';

    let bucket = bucketMap.get(currency);
    if (!bucket) {
      bucket = {
        currency,
        estimatedOpenGross: 0,
        actualRecoveredGross: 0,
        openOpportunityCount: 0,
        filledOpportunityCount: 0,
        formattedEstimatedOpen: formatPropertyCurrency(0, currency),
        formattedActualRecovered: formatPropertyCurrency(0, currency),
      };
      bucketMap.set(currency, bucket);
    }

    if (
      opp.status === 'new' ||
      opp.status === 'viewed' ||
      opp.status === 'actioned'
    ) {
      bucket.estimatedOpenGross += opp.financials.suggestedGross;
      bucket.openOpportunityCount += 1;
    } else if (opp.status === 'filled') {
      bucket.actualRecoveredGross += opp.actualRecoveredRevenue ?? 0;
      bucket.filledOpportunityCount += 1;
    }
  }

  const buckets = Array.from(bucketMap.values()).map((b) => ({
    ...b,
    formattedEstimatedOpen: formatPropertyCurrency(
      b.estimatedOpenGross,
      b.currency
    ),
    formattedActualRecovered: formatPropertyCurrency(
      b.actualRecoveredGross,
      b.currency
    ),
  }));

  const totalEstimatedOpenNominal = buckets.reduce(
    (sum, b) => sum + b.estimatedOpenGross,
    0
  );
  const totalActualRecoveredNominal = buckets.reduce(
    (sum, b) => sum + b.actualRecoveredGross,
    0
  );

  return {
    buckets,
    totalEstimatedOpenNominal,
    totalActualRecoveredNominal,
    hasMultipleCurrencies: buckets.length > 1,
  };
}

export { calculateGapFinancials, calculateOpportunityPriority };
