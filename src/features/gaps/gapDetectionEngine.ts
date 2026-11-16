import {
  GapOpportunity,
  OpportunityStatus,
  Property,
  Reservation,
} from '../../types/gapfill';
import {
  calculateGapFinancials,
  calculateOpportunityPriority,
  diffCalendarNights,
  parseIsoDateUtc,
} from '../../utils/engines';

export interface NormalizedOccupancyBlock {
  representativeReservationId: string;
  mergedReservationIds: string[];
  sourceUids: string[];
  checkInDate: string; // YYYY-MM-DD (RFC 5545 DTSTART inclusive)
  checkOutDate: string; // YYYY-MM-DD (RFC 5545 DTEND exclusive)
  occupiedNights: number;
  summaryLabel: string;
  hadOverlapMerged: boolean;
}

export type ConsecutivePairClassification =
  | 'orphan_gap_detected'
  | 'back_to_back_turnover'
  | 'exceeds_orphan_threshold'
  | 'beyond_analysis_horizon'
  | 'past_expired_window';

export interface ConsecutivePairEvaluation {
  previousReservationId: string;
  nextReservationId: string;
  previousCheckOutDate: string;
  nextCheckInDate: string;
  emptyNights: number;
  daysUntilStart: number;
  classification: ConsecutivePairClassification;
  isMinStayCompatible: boolean;
  explanation: string;
  opportunityId?: string;
}

export interface PropertyGapAnalysisReport {
  propertyId: string;
  rawReservationCount: number;
  ignoredCancelledCount: number;
  normalizedBlocks: NormalizedOccupancyBlock[];
  mergedOverlapsCount: number;
  pairEvaluations: ConsecutivePairEvaluation[];
  opportunities: GapOpportunity[];
}

/**
 * Normalizes a property's reservations per RFC 5545:
 * 1. Filters to the target propertyId.
 * 2. Excludes canceled/cancelled reservations and invalid ranges (checkOutDate <= checkInDate).
 * 3. Sorts deterministically by checkInDate ASC, then checkOutDate DESC.
 * 4. Merges overlapping or nested reservations (where next.checkInDate < current.checkOutDate)
 *    so nested sub-bookings never create false interior gaps.
 *    Note: Back-to-back turnovers (next.checkInDate === current.checkOutDate) are kept as
 *    distinct consecutive stays so turnover dates remain visible on the calendar.
 */
export function normalizePropertyReservations(params: {
  propertyId: string;
  reservations: Reservation[];
  includeBlockedHolds?: boolean;
}): {
  normalizedBlocks: NormalizedOccupancyBlock[];
  ignoredCancelledCount: number;
  mergedOverlapsCount: number;
} {
  const { propertyId, reservations, includeBlockedHolds = false } = params;

  const propReservations = reservations.filter((r) => r.propertyId === propertyId);

  let ignoredCancelledCount = 0;
  const activeReservations: Reservation[] = [];

  for (const r of propReservations) {
    if (r.status === 'canceled' || r.status === 'cancelled') {
      ignoredCancelledCount += 1;
      continue;
    }
    if (
      !includeBlockedHolds &&
      (r.status === 'blocked' || r.status === 'ambiguous_block')
    ) {
      continue;
    }

    try {
      const nights = diffCalendarNights(r.checkInDate, r.checkOutDate);
      if (nights <= 0) {
        continue;
      }
      activeReservations.push(r);
    } catch {
      // Ignore malformed ISO date strings
      continue;
    }
  }

  activeReservations.sort((a, b) => {
    const startDiff =
      parseIsoDateUtc(a.checkInDate) - parseIsoDateUtc(b.checkInDate);
    if (startDiff !== 0) return startDiff;
    // Longer stay first if check-in dates are identical
    return parseIsoDateUtc(b.checkOutDate) - parseIsoDateUtc(a.checkOutDate);
  });

  const normalizedBlocks: NormalizedOccupancyBlock[] = [];
  let mergedOverlapsCount = 0;

  for (const res of activeReservations) {
    const lastBlock = normalizedBlocks[normalizedBlocks.length - 1];

    if (!lastBlock) {
      normalizedBlocks.push({
        representativeReservationId: res.id,
        mergedReservationIds: [res.id],
        sourceUids: [res.sourceUid],
        checkInDate: res.checkInDate,
        checkOutDate: res.checkOutDate,
        occupiedNights: diffCalendarNights(res.checkInDate, res.checkOutDate),
        summaryLabel: res.summaryLabel,
        hadOverlapMerged: false,
      });
      continue;
    }

    // Strict overlap: next reservation starts BEFORE current block checks out
    // (RFC 5545: if res.checkInDate === lastBlock.checkOutDate, that is a same-day turnover, NOT an overlap)
    if (parseIsoDateUtc(res.checkInDate) < parseIsoDateUtc(lastBlock.checkOutDate)) {
      mergedOverlapsCount += 1;
      const extendedCheckOut =
        parseIsoDateUtc(res.checkOutDate) > parseIsoDateUtc(lastBlock.checkOutDate)
          ? res.checkOutDate
          : lastBlock.checkOutDate;

      lastBlock.checkOutDate = extendedCheckOut;
      lastBlock.occupiedNights = diffCalendarNights(
        lastBlock.checkInDate,
        extendedCheckOut
      );
      lastBlock.mergedReservationIds.push(res.id);
      lastBlock.sourceUids.push(res.sourceUid);
      lastBlock.hadOverlapMerged = true;
    } else {
      normalizedBlocks.push({
        representativeReservationId: res.id,
        mergedReservationIds: [res.id],
        sourceUids: [res.sourceUid],
        checkInDate: res.checkInDate,
        checkOutDate: res.checkOutDate,
        occupiedNights: diffCalendarNights(res.checkInDate, res.checkOutDate),
        summaryLabel: res.summaryLabel,
        hadOverlapMerged: false,
      });
    }
  }

  return {
    normalizedBlocks,
    ignoredCancelledCount,
    mergedOverlapsCount,
  };
}

/**
 * Performs complete RFC 5545 reservation normalization, consecutive-pair evaluation,
 * and orphan-gap detection for a single property.
 */
export function analyzePropertyOccupancyAndGaps(params: {
  property: Property;
  reservations: Reservation[];
  referenceDateStr: string;
  hoursSinceLastSync: number | null;
  maxGapNightsThreshold?: number;
  existingOpportunities?: GapOpportunity[];
}): PropertyGapAnalysisReport {
  const {
    property,
    reservations,
    referenceDateStr,
    hoursSinceLastSync,
    maxGapNightsThreshold = 7,
    existingOpportunities = [],
  } = params;

  const rawReservationCount = reservations.filter(
    (r) => r.propertyId === property.id
  ).length;

  const { normalizedBlocks, ignoredCancelledCount, mergedOverlapsCount } =
    normalizePropertyReservations({
      propertyId: property.id,
      reservations,
    });

  if (property.status === 'inactive' || normalizedBlocks.length < 2) {
    return {
      propertyId: property.id,
      rawReservationCount,
      ignoredCancelledCount,
      normalizedBlocks,
      mergedOverlapsCount,
      pairEvaluations: [],
      opportunities: [],
    };
  }

  const existingByKey = new Map<string, GapOpportunity>();
  for (const opp of existingOpportunities) {
    const key = `${opp.propertyId}:${opp.gapStartDate}:${opp.gapEndDate}`;
    existingByKey.set(key, opp);
  }

  const pairEvaluations: ConsecutivePairEvaluation[] = [];
  const opportunities: GapOpportunity[] = [];

  for (let i = 0; i < normalizedBlocks.length - 1; i++) {
    const currentBlock = normalizedBlocks[i];
    const nextBlock = normalizedBlocks[i + 1];

    const previousCheckout = currentBlock.checkOutDate;
    const nextCheckin = nextBlock.checkInDate;
    const emptyNights = diffCalendarNights(previousCheckout, nextCheckin);
    const daysUntilStart = diffCalendarNights(referenceDateStr, previousCheckout);
    const isMinStayCompatible = emptyNights >= property.minimumBookingLength;

    if (emptyNights === 0) {
      pairEvaluations.push({
        previousReservationId: currentBlock.representativeReservationId,
        nextReservationId: nextBlock.representativeReservationId,
        previousCheckOutDate: previousCheckout,
        nextCheckInDate: nextCheckin,
        emptyNights: 0,
        daysUntilStart,
        classification: 'back_to_back_turnover',
        isMinStayCompatible: false,
        explanation: `Same-day turnover on ${previousCheckout} (0 empty nights).`,
      });
      continue;
    }

    if (emptyNights > maxGapNightsThreshold) {
      pairEvaluations.push({
        previousReservationId: currentBlock.representativeReservationId,
        nextReservationId: nextBlock.representativeReservationId,
        previousCheckOutDate: previousCheckout,
        nextCheckInDate: nextCheckin,
        emptyNights,
        daysUntilStart,
        classification: 'exceeds_orphan_threshold',
        isMinStayCompatible,
        explanation: `${emptyNights} open nights exceeds ${maxGapNightsThreshold}-night orphan gap threshold (treated as standard open availability).`,
      });
      continue;
    }

    if (daysUntilStart > property.analysisHorizonDays) {
      pairEvaluations.push({
        previousReservationId: currentBlock.representativeReservationId,
        nextReservationId: nextBlock.representativeReservationId,
        previousCheckOutDate: previousCheckout,
        nextCheckInDate: nextCheckin,
        emptyNights,
        daysUntilStart,
        classification: 'beyond_analysis_horizon',
        isMinStayCompatible,
        explanation: `Starts in ${daysUntilStart} days, beyond property's ${property.analysisHorizonDays}-day analysis horizon.`,
      });
      continue;
    }

    const financials = calculateGapFinancials({
      emptyNights,
      baseNightlyRate: property.defaultNightlyRate,
      maximumAcceptableDiscount: property.maximumAcceptableDiscount,
      minimumAcceptableRate: property.minimumAcceptableNightlyPrice,
      daysUntilStart: Math.max(0, daysUntilStart),
    });

    const priority = calculateOpportunityPriority({
      daysUntilStart: Math.max(0, daysUntilStart),
      emptyNights,
      suggestedGross: financials.suggestedGross,
      baseNightlyRate: property.defaultNightlyRate,
      minimumBookingLength: property.minimumBookingLength,
      hoursSinceLastSync,
    });

    const dedupeKey = `${property.id}:${previousCheckout}:${nextCheckin}`;
    const existing = existingByKey.get(dedupeKey);

    let defaultStatus: OpportunityStatus = 'new';
    if (daysUntilStart < 0) {
      defaultStatus = 'expired';
    }

    const oppId =
      existing?.id ?? `opp_${property.id}_${previousCheckout}_${nextCheckin}`;

    opportunities.push({
      id: oppId,
      propertyId: property.id,
      gapStartDate: previousCheckout,
      gapEndDate: nextCheckin,
      emptyNights,
      daysUntilStart,
      previousReservationId: currentBlock.representativeReservationId,
      nextReservationId: nextBlock.representativeReservationId,
      isMinStayCompatible,
      minStayRequired: property.minimumBookingLength,
      financials,
      priority,
      status: existing?.status ?? defaultStatus,
      actualRecoveredRevenue: existing?.actualRecoveredRevenue ?? null,
      filledAt: existing?.filledAt ?? null,
      strategy: existing?.strategy,
    });

    pairEvaluations.push({
      previousReservationId: currentBlock.representativeReservationId,
      nextReservationId: nextBlock.representativeReservationId,
      previousCheckOutDate: previousCheckout,
      nextCheckInDate: nextCheckin,
      emptyNights,
      daysUntilStart,
      classification:
        daysUntilStart < 0 ? 'past_expired_window' : 'orphan_gap_detected',
      isMinStayCompatible,
      explanation: isMinStayCompatible
        ? `${emptyNights}-night orphan gap (${previousCheckout} → ${nextCheckin}) bookable under ${property.minimumBookingLength}-night minimum stay.`
        : `${emptyNights}-night orphan gap (${previousCheckout} → ${nextCheckin}) blocked by ${property.minimumBookingLength}-night minimum stay; requires rule override or adjacent guest extension.`,
      opportunityId: oppId,
    });
  }

  return {
    propertyId: property.id,
    rawReservationCount,
    ignoredCancelledCount,
    normalizedBlocks,
    mergedOverlapsCount,
    pairEvaluations,
    opportunities,
  };
}
