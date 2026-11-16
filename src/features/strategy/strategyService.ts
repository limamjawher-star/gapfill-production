import {
  AIStrategyRecommendation,
  GapOpportunity,
  Property,
  StrategyFocusMode,
} from '../../types/gapfill';

export const GEMINI_FREE_TIER_MODEL = 'gemini-4-hydrogen';

export interface AnonymizedStrategyPayload {
  propertyType: Property['propertyType'];
  city: string;
  currency: Property['currency'];
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
  strategyFocus: StrategyFocusMode;
}

const DISALLOWED_PII_KEYS = new Set([
  'guestname',
  'guest_name',
  'guestemail',
  'guest_email',
  'email',
  'phone',
  'phonenumber',
  'phone_number',
  'icalurl',
  'ical_url',
  'secreturl',
  'secret_url',
  'sourceuid',
  'source_uid',
  'reservationcode',
  'reservation_code',
  'address',
  'streetaddress',
  'street_address',
  'hostemail',
  'host_email',
]);

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const URL_PATTERN = /https?:\/\/\S+/i;
const PHONE_PATTERN = /\+?\d[\d\s().-]{7,}\d/;

/**
 * Builds the strictly anonymized, zero-PII outbound payload for AI strategy generation.
 * Never includes host emails, guest names, phone numbers, reservation codes, or iCal URLs.
 */
export function buildAnonymizedStrategyPayload(
  property: Property,
  opportunity: GapOpportunity,
  strategyFocus: StrategyFocusMode = 'balanced'
): AnonymizedStrategyPayload {
  return {
    propertyType: property.propertyType,
    city: property.city,
    currency: property.currency,
    nightlyRate: opportunity.financials.baseNightlyRate,
    minimumStay: property.minimumBookingLength,
    minimumAcceptableRate: opportunity.financials.minimumAcceptableRate,
    gapStartDate: opportunity.gapStartDate,
    gapEndDate: opportunity.gapEndDate,
    emptyNights: opportunity.emptyNights,
    suggestedNightlyRate: opportunity.financials.suggestedNightlyRate,
    suggestedGross: opportunity.financials.suggestedGross,
    recommendedDiscountPercent: opportunity.financials.recommendedDiscountPercent,
    maxAllowedDiscountPercent: opportunity.financials.maxAllowedDiscountPercent,
    isMinStayCompatible: opportunity.isMinStayCompatible,
    strategyFocus,
  };
}

/**
 * Verifies an object contains zero PII keys, emails, phone numbers, or secret URLs.
 */
export function detectPiiOrDisallowedKeys(payload: Record<string, unknown>): {
  safe: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  for (const [key, value] of Object.entries(payload)) {
    const normalizedKey = key.toLowerCase();
    if (DISALLOWED_PII_KEYS.has(normalizedKey)) {
      violations.push(`Disallowed PII/secret key "${key}"`);
      continue;
    }

    if (typeof value === 'string') {
      if (EMAIL_PATTERN.test(value)) {
        violations.push(`Email pattern detected in "${key}"`);
      }
      if (URL_PATTERN.test(value)) {
        violations.push(`URL pattern detected in "${key}"`);
      }
      // Avoid flagging ISO YYYY-MM-DD dates as phone numbers
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim()) && PHONE_PATTERN.test(value)) {
        violations.push(`Phone-like numeric sequence detected in "${key}"`);
      }
    }
  }

  return {
    safe: violations.length === 0,
    violations,
  };
}

/**
 * Validates and normalizes raw JSON output parsed from Gemini response.text.
 * Ensures all 7 required strategy fields are non-empty and properly typed.
 */
export function validateAndNormalizeStrategyResponse(
  raw: unknown,
  meta: {
    modelUsed: string;
    strategyFocus: StrategyFocusMode;
    generatedAt?: string;
  }
): { valid: true; strategy: AIStrategyRecommendation } | { valid: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, error: 'Model response is not a JSON object.' };
  }

  const obj = raw as Record<string, unknown>;
  const stringFields = [
    'shortOpportunityExplanation',
    'pricingStrategy',
    'minimumStayRecommendation',
    'guestExtensionMessage',
    'socialMediaCaption',
    'marketingRecommendation',
  ] as const;

  for (const field of stringFields) {
    const val = obj[field];
    if (typeof val !== 'string' || val.trim().length < 8) {
      return {
        valid: false,
        error: `Field "${field}" is missing or empty in model JSON output.`,
      };
    }
  }

  if (!Array.isArray(obj.relevantCautions)) {
    return {
      valid: false,
      error: 'Field "relevantCautions" must be an array of caution strings.',
    };
  }

  const normalizedCautions = obj.relevantCautions
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, 5);

  if (normalizedCautions.length === 0) {
    return {
      valid: false,
      error: 'Field "relevantCautions" contained zero valid items.',
    };
  }

  return {
    valid: true,
    strategy: {
      generatedAt: meta.generatedAt ?? new Date().toISOString(),
      source: 'gemini-free-tier',
      modelUsed: meta.modelUsed,
      strategyFocus: meta.strategyFocus,
      shortOpportunityExplanation: (obj.shortOpportunityExplanation as string).trim(),
      pricingStrategy: (obj.pricingStrategy as string).trim(),
      minimumStayRecommendation: (obj.minimumStayRecommendation as string).trim(),
      guestExtensionMessage: (obj.guestExtensionMessage as string).trim(),
      socialMediaCaption: (obj.socialMediaCaption as string).trim(),
      marketingRecommendation: (obj.marketingRecommendation as string).trim(),
      relevantCautions: normalizedCautions,
    },
  };
}

export type GeminiErrorCode =
  | 'QUOTA_EXHAUSTED'
  | 'API_KEY_MISSING'
  | 'API_KEY_INVALID'
  | 'MODEL_NOT_FOUND'
  | 'UPSTREAM_ERROR';

export interface ClassifiedGeminiError {
  code: GeminiErrorCode;
  httpStatus: number;
  userMessage: string;
}

/**
 * Classifies Gemini API errors cleanly without masking upstream status codes.
 */
export function classifyGeminiApiError(err: unknown): ClassifiedGeminiError {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message: unknown }).message)
      : String(err ?? '');
  const status =
    typeof err === 'object' && err !== null && 'status' in err
      ? Number((err as { status: unknown }).status)
      : NaN;

  const lower = msg.toLowerCase();

  if (
    status === 429 ||
    lower.includes('resource_exhausted') ||
    lower.includes('429') ||
    lower.includes('quota')
  ) {
    return {
      code: 'QUOTA_EXHAUSTED',
      httpStatus: 429,
      userMessage:
        'Free-tier Gemini quota temporarily exhausted (429 RESOURCE_EXHAUSTED). Please wait before retrying or use the deterministic rule-based strategy.',
    };
  }

  if (
    status === 403 ||
    status === 401 ||
    lower.includes('permission_denied') ||
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid')
  ) {
    return {
      code: 'API_KEY_INVALID',
      httpStatus: 403,
      userMessage:
        'Gemini API key was rejected (403/400). Verify GEMINI_API_KEY in Settings > Secrets.',
    };
  }

  if (status === 404 || lower.includes('not_found') || lower.includes('404')) {
    return {
      code: 'MODEL_NOT_FOUND',
      httpStatus: 502,
      userMessage:
        'Requested Gemini model identifier was not found (404). Verify model alias configuration.',
    };
  }

  return {
    code: 'UPSTREAM_ERROR',
    httpStatus: 503,
    userMessage:
      'Gemini AI service temporarily unreachable. Deterministic rule-based strategy engine remains available.',
  };
}
