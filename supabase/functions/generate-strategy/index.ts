/**
 * Supabase Edge Function: generate-strategy
 * Invokes Google Gemini free-tier model ('gemini-4-hydrogen') on anonymized gap metadata only.
 * Never receives guest PII, booking reference codes, or raw iCal URLs.
 */

export const EDGE_GEMINI_MODEL = 'gemini-4-hydrogen';

export type EdgeStrategyFocus = 'balanced' | 'guest_extension' | 'direct_promo';

export interface EdgeStrategyPayload {
  propertyType: string;
  city: string;
  currency: string;
  nightlyRate: number;
  minimumStay: number;
  minimumAcceptableRate: number;
  gapStartDate: string;
  gapEndDate: string;
  emptyNights: number;
  suggestedNightlyRate: number;
  suggestedGross: number;
  recommendedDiscountPercent: number;
  maxAllowedDiscountPercent: number;
  isMinStayCompatible: boolean;
  strategyFocus: EdgeStrategyFocus;
}

export function sanitizeStrategyPayload(
  input: Record<string, unknown>
): EdgeStrategyPayload {
  const focus =
    input.strategyFocus === 'guest_extension' ||
    input.strategyFocus === 'direct_promo'
      ? input.strategyFocus
      : 'balanced';

  const emptyNights = Number(input.emptyNights || 0);
  const minimumStay = Number(input.minimumStay || 1);

  // Whitelist strictly non-PII fields
  return {
    propertyType: String(input.propertyType || 'Apartment'),
    city: String(input.city || 'Unknown City'),
    currency: String(input.currency || 'USD'),
    nightlyRate: Number(input.nightlyRate || 0),
    minimumStay,
    minimumAcceptableRate: Number(input.minimumAcceptableRate || 0),
    gapStartDate: String(input.gapStartDate || ''),
    gapEndDate: String(input.gapEndDate || ''),
    emptyNights,
    suggestedNightlyRate: Number(input.suggestedNightlyRate || 0),
    suggestedGross: Number(input.suggestedGross || 0),
    recommendedDiscountPercent: Number(input.recommendedDiscountPercent || 0),
    maxAllowedDiscountPercent: Number(input.maxAllowedDiscountPercent || 20),
    isMinStayCompatible:
      typeof input.isMinStayCompatible === 'boolean'
        ? input.isMinStayCompatible
        : emptyNights >= minimumStay,
    strategyFocus: focus,
  };
}
