import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPropertyCurrency,
  formatTimestampInPropertyTimezone,
  isValidIanaTimezone,
  validatePropertyInput,
} from './propertyValidation';

test('isValidIanaTimezone accepts valid IANA zones and rejects invalid strings', () => {
  assert.equal(isValidIanaTimezone('Europe/Paris'), true);
  assert.equal(isValidIanaTimezone('America/Phoenix'), true);
  assert.equal(isValidIanaTimezone('Invalid/Timezone'), false);
  assert.equal(isValidIanaTimezone(''), false);
});

test('formatTimestampInPropertyTimezone formats timestamps in the property timezone', () => {
  // 2026-11-16T05:30:00Z in Europe/Paris (UTC+1 in November) -> 06:30
  const parisFormatted = formatTimestampInPropertyTimezone(
    '2026-11-16T05:30:00Z',
    'Europe/Paris'
  );
  assert.equal(parisFormatted.includes('06:30'), true);
  assert.equal(parisFormatted.includes('Europe/Paris'), true);

  // Same UTC instant in America/Phoenix (UTC-7) -> 2026-11-15 22:30
  const phoenixFormatted = formatTimestampInPropertyTimezone(
    '2026-11-16T05:30:00Z',
    'America/Phoenix'
  );
  assert.equal(phoenixFormatted.includes('22:30'), true);
  assert.equal(phoenixFormatted.includes('America/Phoenix'), true);
});

test('validatePropertyInput enforces all 11 property fields and SSRF iCal rules', () => {
  // Floor price exceeding default rate -> rejected
  const floorTooHigh = validatePropertyInput({
    name: 'Marais Loft',
    propertyType: 'Loft',
    city: 'Paris',
    country: 'France',
    timezone: 'Europe/Paris',
    currency: 'EUR',
    defaultNightlyRate: 200,
    minimumBookingLength: 3,
    minimumAcceptableNightlyPrice: 230,
    maximumAcceptableDiscount: 20,
    analysisHorizonDays: 90,
    status: 'active',
  });
  assert.equal(floorTooHigh.valid, false);
  assert.equal(
    floorTooHigh.error,
    'Minimum acceptable nightly price cannot exceed the default nightly rate.'
  );

  // SSRF private IP in iCal URL -> rejected
  const ssrfAttempt = validatePropertyInput({
    name: 'Marais Loft',
    propertyType: 'Loft',
    city: 'Paris',
    country: 'France',
    timezone: 'Europe/Paris',
    currency: 'EUR',
    defaultNightlyRate: 220,
    minimumBookingLength: 3,
    minimumAcceptableNightlyPrice: 170,
    maximumAcceptableDiscount: 20,
    analysisHorizonDays: 90,
    status: 'active',
    icalUrl: 'https://192.168.1.10/private.ics',
  });
  assert.equal(ssrfAttempt.valid, false);

  // Valid property with floor clamp advisory
  const validProp = validatePropertyInput({
    name: 'Nice Seafront Apartment',
    propertyType: 'Apartment',
    city: 'Nice',
    country: 'France',
    timezone: 'Europe/Paris',
    currency: 'EUR',
    defaultNightlyRate: 200,
    minimumBookingLength: 2,
    minimumAcceptableNightlyPrice: 175,
    maximumAcceptableDiscount: 25, // 25% off 200 = 150, clamped at 175
    analysisHorizonDays: 90,
    status: 'active',
  });
  assert.equal(validProp.valid, true);
  assert.equal(Boolean(validProp.floorClampNote), true);
  assert.equal(formatPropertyCurrency(200, 'EUR'), '€200');
});
