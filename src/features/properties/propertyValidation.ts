import { CurrencyCode, Property, PropertyStatus } from '../../types/gapfill';
import { validateSafeIcalUrl } from '../../../supabase/functions/sync-calendar/index';

export const SUPPORTED_IANA_TIMEZONES = [
  'Europe/Paris',
  'Europe/Lisbon',
  'Europe/London',
  'Europe/Rome',
  'Europe/Madrid',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Vancouver',
  'Australia/Sydney',
  'Australia/Melbourne',
] as const;

export const SUPPORTED_CURRENCIES: {
  code: CurrencyCode;
  symbol: string;
  label: string;
}[] = [
  { code: 'USD', symbol: '$', label: 'USD ($) — US Dollar' },
  { code: 'EUR', symbol: '€', label: 'EUR (€) — Euro' },
  { code: 'GBP', symbol: '£', label: 'GBP (£) — British Pound' },
  { code: 'CAD', symbol: 'CA$', label: 'CAD (CA$) — Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', label: 'AUD (A$) — Australian Dollar' },
];

/**
 * Validates that a timezone string is an explicit, valid IANA timezone.
 * Never falls back to the browser's local timezone.
 */
export function isValidIanaTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string' || !tz.includes('/')) {
    return false;
  }
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
}

/**
 * Formats an ISO timestamp strictly in the property's configured IANA timezone,
 * never using the browser's local timezone.
 */
export function formatTimestampInPropertyTimezone(
  isoString: string | null,
  propertyTimezone: string
): string {
  if (!isoString) return 'Never synced';
  const tz = isValidIanaTimezone(propertyTimezone) ? propertyTimezone : 'UTC';
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return 'Invalid date';
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return `${formatter.format(d)} (${tz})`;
  } catch {
    return `${isoString.slice(0, 16).replace('T', ' ')} UTC`;
  }
}

/**
 * Formats a numeric amount using the property's explicit currency code.
 */
export function formatPropertyCurrency(
  amount: number,
  currency: CurrencyCode
): string {
  const found = SUPPORTED_CURRENCIES.find((c) => c.code === currency);
  const symbol = found?.symbol ?? '$';
  return `${symbol}${Math.round(amount).toLocaleString('en-US')}`;
}

export interface PropertyFormRawInput {
  name: string;
  propertyType: Property['propertyType'];
  city: string;
  country: string;
  timezone: string;
  currency: CurrencyCode;
  defaultNightlyRate: string | number;
  minimumBookingLength: string | number;
  minimumAcceptableNightlyPrice: string | number;
  maximumAcceptableDiscount: string | number;
  analysisHorizonDays: string | number;
  status: PropertyStatus;
  icalUrl?: string;
}

export interface PropertyValidationOutcome {
  valid: boolean;
  error: string | null;
  floorClampNote: string | null;
}

/**
 * Section 7: Deterministic validation of all 11 required property fields
 * plus optional HTTPS iCal feed URL.
 */
export function validatePropertyInput(
  input: PropertyFormRawInput
): PropertyValidationOutcome {
  const name = (input.name || '').trim();
  const city = (input.city || '').trim();
  const country = (input.country || '').trim();
  const timezone = (input.timezone || '').trim();

  if (name.length < 2 || name.length > 100) {
    return {
      valid: false,
      error: 'Property name must be between 2 and 100 characters.',
      floorClampNote: null,
    };
  }

  if (city.length < 2 || city.length > 80) {
    return {
      valid: false,
      error: 'City name must be between 2 and 80 characters.',
      floorClampNote: null,
    };
  }

  if (country.length < 2 || country.length > 80) {
    return {
      valid: false,
      error: 'Country name must be between 2 and 80 characters.',
      floorClampNote: null,
    };
  }

  if (!isValidIanaTimezone(timezone)) {
    return {
      valid: false,
      error:
        'A valid property-specific IANA timezone (e.g., Europe/Paris or America/New_York) is required.',
      floorClampNote: null,
    };
  }

  if (!SUPPORTED_CURRENCIES.some((c) => c.code === input.currency)) {
    return {
      valid: false,
      error: 'Please select a valid property currency.',
      floorClampNote: null,
    };
  }

  const rate = Number(input.defaultNightlyRate);
  const minStay = Number(input.minimumBookingLength);
  const floorPrice = Number(input.minimumAcceptableNightlyPrice);
  const maxDiscount = Number(input.maximumAcceptableDiscount);
  const horizon = Number(input.analysisHorizonDays);

  if (!Number.isFinite(rate) || rate <= 0 || rate > 25000) {
    return {
      valid: false,
      error: 'Default nightly rate must be between 1 and 25,000.',
      floorClampNote: null,
    };
  }

  if (!Number.isInteger(minStay) || minStay < 1 || minStay > 30) {
    return {
      valid: false,
      error: 'Minimum booking length must be a whole number between 1 and 30 nights.',
      floorClampNote: null,
    };
  }

  if (!Number.isFinite(floorPrice) || floorPrice <= 0) {
    return {
      valid: false,
      error: 'Minimum acceptable nightly price must be greater than 0.',
      floorClampNote: null,
    };
  }

  if (floorPrice > rate) {
    return {
      valid: false,
      error:
        'Minimum acceptable nightly price cannot exceed the default nightly rate.',
      floorClampNote: null,
    };
  }

  if (!Number.isFinite(maxDiscount) || maxDiscount < 0 || maxDiscount > 80) {
    return {
      valid: false,
      error: 'Maximum acceptable discount must be between 0% and 80%.',
      floorClampNote: null,
    };
  }

  if (!Number.isInteger(horizon) || horizon < 14 || horizon > 365) {
    return {
      valid: false,
      error: 'Analysis horizon must be an integer between 14 and 365 days.',
      floorClampNote: null,
    };
  }

  if (input.status !== 'active' && input.status !== 'inactive') {
    return {
      valid: false,
      error: 'Property status must be active or inactive.',
      floorClampNote: null,
    };
  }

  if (input.icalUrl && input.icalUrl.trim()) {
    const check = validateSafeIcalUrl(input.icalUrl.trim());
    if (!check.valid) {
      return {
        valid: false,
        error: check.reason ?? 'Invalid HTTPS iCal URL.',
        floorClampNote: null,
      };
    }
  }

  const maxDiscountedRate = Math.round(rate * (1 - maxDiscount / 100));
  const floorClampNote =
    maxDiscountedRate < floorPrice
      ? `Note: A ${maxDiscount}% discount on ${formatPropertyCurrency(
          rate,
          input.currency
        )} would be ${formatPropertyCurrency(
          maxDiscountedRate,
          input.currency
        )}/nt, so GapFill will clamp suggested rates at your ${formatPropertyCurrency(
          floorPrice,
          input.currency
        )}/nt floor.`
      : null;

  return {
    valid: true,
    error: null,
    floorClampNote,
  };
}
