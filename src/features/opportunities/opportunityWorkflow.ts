import {
  GapOpportunity,
  OpportunityStatus,
  PriorityLabel,
  Property,
  Reservation,
} from '../../types/gapfill';
import { addCalendarDays } from '../../utils/engines';

export type MinStayFilterMode = 'all' | 'compatible_only' | 'blocked_only';
export type OpportunitySortMode = 'score' | 'urgency' | 'gross' | 'nights';

export interface OpportunityFilterCriteria {
  propertyId: string; // 'all' or property.id
  priorityLabel: string; // 'all' or PriorityLabel
  status: string; // 'all' or OpportunityStatus
  minStayMode: MinStayFilterMode;
  searchQuery: string;
  sortBy: OpportunitySortMode;
}

/**
 * Deterministically filters and sorts gap opportunities for the Opportunities view.
 */
export function filterAndSortOpportunities(params: {
  opportunities: GapOpportunity[];
  properties: Property[];
  criteria: OpportunityFilterCriteria;
}): GapOpportunity[] {
  const { opportunities, properties, criteria } = params;
  const propMap = new Map<string, Property>();
  for (const p of properties) {
    propMap.set(p.id, p);
  }

  const query = criteria.searchQuery.trim().toLowerCase();

  return opportunities
    .filter((opp) => {
      if (criteria.propertyId !== 'all' && opp.propertyId !== criteria.propertyId) {
        return false;
      }
      if (
        criteria.priorityLabel !== 'all' &&
        opp.priority.label !== (criteria.priorityLabel as PriorityLabel)
      ) {
        return false;
      }
      if (
        criteria.status !== 'all' &&
        opp.status !== (criteria.status as OpportunityStatus)
      ) {
        return false;
      }
      if (
        criteria.minStayMode === 'compatible_only' &&
        !opp.isMinStayCompatible
      ) {
        return false;
      }
      if (
        criteria.minStayMode === 'blocked_only' &&
        opp.isMinStayCompatible
      ) {
        return false;
      }

      if (query) {
        const prop = propMap.get(opp.propertyId);
        const hay = `${prop?.name ?? ''} ${prop?.city ?? ''} ${
          opp.gapStartDate
        } ${opp.gapEndDate} ${opp.status} ${opp.priority.label}`.toLowerCase();
        if (!hay.includes(query)) {
          return false;
        }
      }

      return true;
    })
    .slice()
    .sort((a, b) => {
      if (criteria.sortBy === 'urgency') {
        if (a.daysUntilStart !== b.daysUntilStart) {
          return a.daysUntilStart - b.daysUntilStart;
        }
        return b.priority.totalScore - a.priority.totalScore;
      }
      if (criteria.sortBy === 'gross') {
        if (b.financials.suggestedGross !== a.financials.suggestedGross) {
          return b.financials.suggestedGross - a.financials.suggestedGross;
        }
        return b.priority.totalScore - a.priority.totalScore;
      }
      if (criteria.sortBy === 'nights') {
        if (b.emptyNights !== a.emptyNights) {
          return b.emptyNights - a.emptyNights;
        }
        return b.priority.totalScore - a.priority.totalScore;
      }
      return b.priority.totalScore - a.priority.totalScore;
    });
}

export interface BracketedReservationContext {
  departingReservation: Reservation | null;
  arrivingReservation: Reservation | null;
}

/**
 * Resolves the preceding (departing on gapStartDate) and succeeding (arriving on gapEndDate)
 * reservations that bracket an orphan gap so hosts can pitch targeted stay extensions.
 */
export function resolveBracketedReservations(params: {
  opportunity: GapOpportunity;
  reservations: Reservation[];
}): BracketedReservationContext {
  const { opportunity, reservations } = params;
  const propConfirmed = reservations.filter(
    (r) => r.propertyId === opportunity.propertyId && r.status === 'confirmed'
  );

  const departingReservation =
    propConfirmed.find((r) => r.id === opportunity.previousReservationId) ??
    propConfirmed.find((r) => r.checkOutDate === opportunity.gapStartDate) ??
    null;

  const arrivingReservation =
    propConfirmed.find((r) => r.id === opportunity.nextReservationId) ??
    propConfirmed.find((r) => r.checkInDate === opportunity.gapEndDate) ??
    null;

  return {
    departingReservation,
    arrivingReservation,
  };
}

/**
 * Builds a deterministic list of YYYY-MM-DD dates for the Calendar horizon view
 * given an anchor date, day offset, and window length (14, 28, or 42 days).
 */
export function buildCalendarHorizonWindow(params: {
  anchorDateStr: string;
  offsetDays: number;
  windowLengthDays: 14 | 28 | 42;
}): {
  startDateStr: string;
  endDateStr: string;
  daysList: string[];
} {
  const startDateStr = addCalendarDays(params.anchorDateStr, params.offsetDays);
  const daysList = Array.from({ length: params.windowLengthDays }, (_, idx) =>
    addCalendarDays(startDateStr, idx)
  );
  const endDateStr = daysList[daysList.length - 1] ?? startDateStr;

  return {
    startDateStr,
    endDateStr,
    daysList,
  };
}
