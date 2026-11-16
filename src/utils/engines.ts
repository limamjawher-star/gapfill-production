import {
  AIStrategyRecommendation,
  GapFinancialCalculation,
  GapOpportunity,
  OpportunityStatus,
  PriorityLabel,
  PriorityScoreBreakdown,
  Property,
  Reservation,
} from '../types/gapfill';

/**
 * Parse a YYYY-MM-DD string into UTC midnight timestamp in ms.
 * Deterministic and independent of browser timezone.
 */
export function parseIsoDateUtc(dateStr: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) {
    throw new Error(`Invalid ISO date format: ${dateStr}. Expected YYYY-MM-DD.`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  return Date.UTC(year, month, day);
}

/**
 * Calculate exact calendar night difference between two YYYY-MM-DD dates.
 * Respects RFC 5545 where DTSTART is inclusive and DTEND is exclusive.
 */
export function diffCalendarNights(startDate: string, endDate: string): number {
  const MS_PER_DAY = 86_400_000;
  const startUtc = parseIsoDateUtc(startDate);
  const endUtc = parseIsoDateUtc(endDate);
  return Math.round((endUtc - startUtc) / MS_PER_DAY);
}

/**
 * Add days to a YYYY-MM-DD date string deterministically in UTC.
 */
export function addCalendarDays(dateStr: string, daysToAdd: number): string {
  const utc = parseIsoDateUtc(dateStr) + daysToAdd * 86_400_000;
  const d = new Date(utc);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Returns today's YYYY-MM-DD calendar date in the given IANA timezone.
 * Used in live authenticated mode so gap horizons never rely on DEMO_REFERENCE_DATE.
 */
export function getTodayIsoDateInTimezone(
  timezone: string,
  now: Date = new Date()
): string {
  const safeTz = timezone && timezone.includes('/') ? timezone : 'UTC';
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: safeTz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(now);
    const map: Record<string, string> = {};
    for (const part of parts) {
      if (part.type !== 'literal') {
        map[part.type] = part.value;
      }
    }
    if (map.year && map.month && map.day) {
      return `${map.year}-${map.month}-${map.day}`;
    }
  } catch {
    // Fall back cleanly to UTC date below
  }
  return now.toISOString().slice(0, 10);
}

/**
 * Section 10: Deterministic Financial Engine
 * Uses integer minor currency units (cents) to avoid floating-point rounding drift.
 * Never suggests a price below the host's configured minimumAcceptableRate.
 */
export function calculateGapFinancials(params: {
  emptyNights: number;
  baseNightlyRate: number;
  maximumAcceptableDiscount: number;
  minimumAcceptableRate: number;
  daysUntilStart: number;
}): GapFinancialCalculation {
  const emptyNights = Math.max(0, Math.floor(params.emptyNights));
  const baseRate = Math.round(params.baseNightlyRate);
  const minFloor = Math.round(params.minimumAcceptableRate);
  const maxDiscount = Math.max(0, Math.min(80, params.maximumAcceptableDiscount));

  // Determine a practical recommended discount within the host's max discount cap
  let targetDiscountPct = maxDiscount;
  if (params.daysUntilStart > 30) {
    targetDiscountPct = Math.round(maxDiscount * 0.5);
  } else if (params.daysUntilStart > 14) {
    targetDiscountPct = Math.round(maxDiscount * 0.75);
  }
  if (emptyNights === 1) {
    targetDiscountPct = maxDiscount;
  }

  const boundedDiscountPct = Math.min(maxDiscount, Math.max(0, targetDiscountPct));
  const rawSuggestedRate = Math.round(baseRate * (1 - boundedDiscountPct / 100));

  // Enforce host minimum acceptable nightly rate
  const floorPriceEnforced = rawSuggestedRate < minFloor;
  const suggestedNightlyRate = Math.max(minFloor, rawSuggestedRate);

  // Recompute effective discount percentage
  const effectiveDiscountPct =
    baseRate > 0
      ? Math.max(
          0,
          Math.round(((baseRate - suggestedNightlyRate) / baseRate) * 100)
        )
      : 0;

  const baseGross = emptyNights * baseRate;
  const suggestedGross = emptyNights * suggestedNightlyRate;

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
  };
}

/**
 * Section 11: Opportunity Priority Scoring Engine (0 - 100 points)
 * Weights:
 * - Time until gap starts: 30 points
 * - Gap length: 25 points
 * - Estimated revenue: 20 points
 * - Minimum-stay compatibility: 15 points
 * - Calendar freshness: 10 points
 */
export function calculateOpportunityPriority(params: {
  daysUntilStart: number;
  emptyNights: number;
  suggestedGross: number;
  baseNightlyRate: number;
  minimumBookingLength: number;
  hoursSinceLastSync: number | null;
}): PriorityScoreBreakdown {
  const explanations: string[] = [];

  // 1. Time until gap starts (max 30 points)
  let timeUntilGapPoints = 8;
  if (params.daysUntilStart <= 7 && params.daysUntilStart >= 0) {
    timeUntilGapPoints = 30;
    explanations.push(
      `Starts in ${params.daysUntilStart} days (urgent 7-day booking window: +30/30 pts)`
    );
  } else if (params.daysUntilStart <= 14) {
    timeUntilGapPoints = 25;
    explanations.push(
      `Starts in ${params.daysUntilStart} days (near-term 14-day window: +25/30 pts)`
    );
  } else if (params.daysUntilStart <= 30) {
    timeUntilGapPoints = 18;
    explanations.push(
      `Starts in ${params.daysUntilStart} days (30-day actionable window: +18/30 pts)`
    );
  } else {
    timeUntilGapPoints = 10;
    explanations.push(
      `Starts in ${params.daysUntilStart} days (advance planning horizon: +10/30 pts)`
    );
  }

  // 2. Gap length (max 25 points) - 2 to 4 nights are highest conversion orphan gaps
  let gapLengthPoints = 10;
  if (params.emptyNights >= 2 && params.emptyNights <= 3) {
    gapLengthPoints = 25;
    explanations.push(
      `${params.emptyNights}-night orphan gap (prime extension & weekend length: +25/25 pts)`
    );
  } else if (params.emptyNights === 4) {
    gapLengthPoints = 22;
    explanations.push(
      `4-night mid-length gap (strong short-break candidate: +22/25 pts)`
    );
  } else if (params.emptyNights === 1) {
    gapLengthPoints = 16;
    explanations.push(
      `Single-night gap (best filled via adjacent guest check-in/out extension: +16/25 pts)`
    );
  } else {
    gapLengthPoints = 14;
    explanations.push(
      `${params.emptyNights}-night extended gap (standard calendar availability: +14/25 pts)`
    );
  }

  // 3. Estimated revenue relative to nightly rate benchmark (max 20 points)
  const revenueRatio =
    params.baseNightlyRate > 0 ? params.suggestedGross / params.baseNightlyRate : 0;
  let estimatedRevenuePoints = 8;
  if (params.suggestedGross >= 600 || revenueRatio >= 2.5) {
    estimatedRevenuePoints = 20;
    explanations.push(
      `High gross recovery potential (${Math.round(params.suggestedGross)} gross value: +20/20 pts)`
    );
  } else if (params.suggestedGross >= 300 || revenueRatio >= 1.5) {
    estimatedRevenuePoints = 15;
    explanations.push(
      `Moderate gross recovery value (${Math.round(params.suggestedGross)} gross value: +15/20 pts)`
    );
  } else {
    estimatedRevenuePoints = 10;
    explanations.push(
      `Incremental single-night revenue opportunity (+10/20 pts)`
    );
  }

  // 4. Minimum-stay compatibility (max 15 points)
  const isCompatible = params.emptyNights >= params.minimumBookingLength;
  const minStayCompatibilityPoints = isCompatible ? 15 : 5;
  if (isCompatible) {
    explanations.push(
      `Bookable immediately under current ${params.minimumBookingLength}-night minimum stay (+15/15 pts)`
    );
  } else {
    explanations.push(
      `Blocked by ${params.minimumBookingLength}-night minimum stay rule; requires rule override or guest extension (+5/15 pts)`
    );
  }

  // 5. Calendar freshness (max 10 points)
  let calendarFreshnessPoints = 0;
  if (params.hoursSinceLastSync === null) {
    calendarFreshnessPoints = 2;
    explanations.push(`Calendar sync timestamp pending (+2/10 pts)`);
  } else if (params.hoursSinceLastSync <= 6) {
    calendarFreshnessPoints = 10;
    explanations.push(`Calendar synced within the last 6 hours (+10/10 pts)`);
  } else if (params.hoursSinceLastSync <= 24) {
    calendarFreshnessPoints = 7;
    explanations.push(`Calendar synced within the last 24 hours (+7/10 pts)`);
  } else {
    calendarFreshnessPoints = 3;
    explanations.push(`Calendar sync older than 24 hours; refresh recommended (+3/10 pts)`);
  }

  const totalScore = Math.min(
    100,
    Math.max(
      0,
      timeUntilGapPoints +
        gapLengthPoints +
        estimatedRevenuePoints +
        minStayCompatibilityPoints +
        calendarFreshnessPoints
    )
  );

  let label: PriorityLabel = 'Low priority';
  if (totalScore >= 75) {
    label = 'High priority';
  } else if (totalScore >= 55) {
    label = 'Medium priority';
  }

  return {
    totalScore,
    label,
    timeUntilGapPoints,
    gapLengthPoints,
    estimatedRevenuePoints,
    minStayCompatibilityPoints,
    calendarFreshnessPoints,
    explanations,
  };
}

/**
 * Section 9: Deterministic Gap Detection Engine
 * - Ignores inactive properties
 * - Sorts confirmed reservations by checkInDate ASC, checkOutDate DESC
 * - Ignores canceled/cancelled and non-confirmed holds
 * - Merges overlapping or nested reservations so nested sub-bookings never create false gaps
 * - Does not create gaps before first reservation or after last reservation
 * - Does not create gaps when bookings are back-to-back (empty_nights === 0)
 * - Preserves existing opportunity status & action history when recalculating
 */
export function detectOrphanGaps(params: {
  property: Property;
  reservations: Reservation[];
  referenceDateStr: string;
  hoursSinceLastSync: number | null;
  maxGapNightsThreshold?: number;
  existingOpportunities?: GapOpportunity[];
}): GapOpportunity[] {
  if (params.property.status === 'inactive') {
    return [];
  }

  const maxGapNights = params.maxGapNightsThreshold ?? 7;
  const rawConfirmed = params.reservations
    .filter((r) => {
      if (r.propertyId !== params.property.id) return false;
      if (r.status !== 'confirmed') return false;
      try {
        return diffCalendarNights(r.checkInDate, r.checkOutDate) > 0;
      } catch {
        return false;
      }
    })
    .slice()
    .sort((a, b) => {
      const diff = parseIsoDateUtc(a.checkInDate) - parseIsoDateUtc(b.checkInDate);
      if (diff !== 0) return diff;
      // Longer stay first when check-in dates match
      return parseIsoDateUtc(b.checkOutDate) - parseIsoDateUtc(a.checkOutDate);
    });

  // Merge strictly overlapping or nested intervals (where next.checkInDate < current.checkOutDate)
  const mergedConfirmed: Reservation[] = [];
  for (const res of rawConfirmed) {
    const last = mergedConfirmed[mergedConfirmed.length - 1];
    if (!last) {
      mergedConfirmed.push({ ...res });
      continue;
    }

    if (parseIsoDateUtc(res.checkInDate) < parseIsoDateUtc(last.checkOutDate)) {
      if (parseIsoDateUtc(res.checkOutDate) > parseIsoDateUtc(last.checkOutDate)) {
        last.checkOutDate = res.checkOutDate;
      }
    } else {
      mergedConfirmed.push({ ...res });
    }
  }

  if (mergedConfirmed.length < 2) {
    return [];
  }

  const existingByKey = new Map<string, GapOpportunity>();
  if (params.existingOpportunities) {
    for (const opp of params.existingOpportunities) {
      const key = `${opp.propertyId}:${opp.gapStartDate}:${opp.gapEndDate}`;
      existingByKey.set(key, opp);
    }
  }

  const opportunities: GapOpportunity[] = [];

  for (let i = 0; i < mergedConfirmed.length - 1; i++) {
    const currentBooking = mergedConfirmed[i];
    const nextBooking = mergedConfirmed[i + 1];

    const previousCheckout = currentBooking.checkOutDate;
    const nextCheckin = nextBooking.checkInDate;

    const emptyNights = diffCalendarNights(previousCheckout, nextCheckin);

    // Only valid positive orphan gaps within configurable orphan window
    if (emptyNights <= 0 || emptyNights > maxGapNights) {
      continue;
    }

    const daysUntilStart = diffCalendarNights(
      params.referenceDateStr,
      previousCheckout
    );

    // Skip gaps that are beyond the property's configured analysis horizon
    if (daysUntilStart > params.property.analysisHorizonDays) {
      continue;
    }

    const financials = calculateGapFinancials({
      emptyNights,
      baseNightlyRate: params.property.defaultNightlyRate,
      maximumAcceptableDiscount: params.property.maximumAcceptableDiscount,
      minimumAcceptableRate: params.property.minimumAcceptableNightlyPrice,
      daysUntilStart: Math.max(0, daysUntilStart),
    });

    const priority = calculateOpportunityPriority({
      daysUntilStart: Math.max(0, daysUntilStart),
      emptyNights,
      suggestedGross: financials.suggestedGross,
      baseNightlyRate: params.property.defaultNightlyRate,
      minimumBookingLength: params.property.minimumBookingLength,
      hoursSinceLastSync: params.hoursSinceLastSync,
    });

    const isMinStayCompatible =
      emptyNights >= params.property.minimumBookingLength;

    const dedupeKey = `${params.property.id}:${previousCheckout}:${nextCheckin}`;
    const existing = existingByKey.get(dedupeKey);

    let defaultStatus: OpportunityStatus = 'new';
    if (daysUntilStart < 0) {
      defaultStatus = 'expired';
    }

    opportunities.push({
      id: existing?.id ?? `opp_${params.property.id}_${previousCheckout}_${nextCheckin}`,
      propertyId: params.property.id,
      gapStartDate: previousCheckout,
      gapEndDate: nextCheckin,
      emptyNights,
      daysUntilStart,
      previousReservationId: currentBooking.id,
      nextReservationId: nextBooking.id,
      isMinStayCompatible,
      minStayRequired: params.property.minimumBookingLength,
      financials,
      priority,
      status: existing?.status ?? defaultStatus,
      actualRecoveredRevenue: existing?.actualRecoveredRevenue ?? null,
      filledAt: existing?.filledAt ?? null,
      strategy: existing?.strategy,
    });
  }

  return opportunities;
}

/**
 * Deterministic rule-based strategy fallback when Gemini API is offline or rate-limited.
 */
export function buildRuleBasedStrategy(
  property: Property,
  opportunity: GapOpportunity
): AIStrategyRecommendation {
  const { emptyNights, gapStartDate, gapEndDate, financials, isMinStayCompatible } =
    opportunity;
  const currencySymbol =
    property.currency === 'EUR'
      ? '€'
      : property.currency === 'GBP'
      ? '£'
      : '$';

  const shortOpportunityExplanation = isMinStayCompatible
    ? `This ${emptyNights}-night window (${gapStartDate} to ${gapEndDate}) in ${property.city} is bookable under your current ${property.minimumBookingLength}-night minimum stay, representing ${currencySymbol}${financials.suggestedGross.toLocaleString()} in potential gross booking recovery.`
    : `This ${emptyNights}-night orphan gap (${gapStartDate} to ${gapEndDate}) is currently unbookable on public calendars because your property minimum stay is set to ${property.minimumBookingLength} nights.`;

  const pricingStrategy = `Apply a ${financials.recommendedDiscountPercent}% targeted gap adjustment, reducing your nightly rate from ${currencySymbol}${financials.baseNightlyRate} to ${currencySymbol}${financials.suggestedNightlyRate}/night (above your ${currencySymbol}${financials.minimumAcceptableRate} floor). Total gross package: ${currencySymbol}${financials.suggestedGross}.`;

  const minimumStayRecommendation = isMinStayCompatible
    ? `Keep your ${property.minimumBookingLength}-night minimum stay intact for ${gapStartDate}–${gapEndDate}, or offer a 1-night extension to the preceding or succeeding guest first to avoid an extra turnover.`
    : `Temporarily lower the minimum stay requirement from ${property.minimumBookingLength} nights to ${emptyNights} ${emptyNights === 1 ? 'night' : 'nights'} specifically for ${gapStartDate}–${gapEndDate}, or pitch a single-night late checkout / early check-in extension to adjacent guests.`;

  const guestExtensionMessage = `Hi there! Because we have a ${emptyNights}-night window right next to your stay (${gapStartDate} to ${gapEndDate}), we'd love to offer you the option to extend your trip at a preferred guest rate of ${currencySymbol}${financials.suggestedNightlyRate}/night (${financials.recommendedDiscountPercent}% off our standard rate) with no extra cleaning fee. Let us know if you'd like us to reserve those dates for you!`;

  const socialMediaCaption = `Last-minute ${emptyNights}-night opening in ${property.city} (${gapStartDate} – ${gapEndDate}). Enjoy our ${property.propertyType.toLowerCase()} at a special orphan-gap rate of ${currencySymbol}${financials.suggestedNightlyRate}/night. Direct message or check our calendar link to book.`;

  const marketingRecommendation =
    emptyNights === 1
      ? `Prioritize messaging the departing guest on ${gapStartDate} or the arriving guest on ${gapEndDate}. Filling a 1-night gap via an existing guest extension eliminates additional housekeeping turnover costs.`
      : `First message both adjacent reservation holders with the zero-cleaning-fee extension offer. After 24 hours, update date-specific minimum stay to ${emptyNights} nights and apply the ${currencySymbol}${financials.suggestedNightlyRate}/night rule on your booking channel.`;

  const relevantCautions = [
    `Estimated gross revenue (${currencySymbol}${financials.suggestedGross}) does not deduct platform host service fees, local occupancy taxes, or additional turnover cleaning costs.`,
    financials.floorPriceEnforced
      ? `Your minimum acceptable nightly rate (${currencySymbol}${financials.minimumAcceptableRate}) capped the discount at ${financials.recommendedDiscountPercent}%.`
      : `Discount is within your configured ${financials.maxAllowedDiscountPercent}% maximum discount threshold.`,
  ];

  return {
    generatedAt: new Date().toISOString(),
    source: 'rule-based-fallback',
    shortOpportunityExplanation,
    pricingStrategy,
    minimumStayRecommendation,
    guestExtensionMessage,
    socialMediaCaption,
    marketingRecommendation,
    relevantCautions,
  };
}
