import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addCalendarDays,
  diffCalendarNights,
  parseIsoDateUtc,
} from '../../utils/engines';
import {
  parseAndNormalizeIcalFeed,
  validateSafeIcalUrl,
} from '../calendar/icalSyncEngine';
import { validatePropertyInput } from '../properties/propertyValidation';
import { detectPiiOrDisallowedKeys } from '../strategy/strategyService';
import { MultiTenantRlsStore } from '../../services/supabaseDataService';
import { canAccessProtectedWorkspace } from '../../utils/authValidation';

test('Date arithmetic handles leap years, year boundaries, and DST transitions deterministically', () => {
  // Leap year 2028 includes Feb 29
  assert.equal(diffCalendarNights('2028-02-28', '2028-03-01'), 2);
  // Non-leap year 2026 has 1 night between Feb 28 and Mar 1
  assert.equal(diffCalendarNights('2026-02-28', '2026-03-01'), 1);
  // Year boundary
  assert.equal(diffCalendarNights('2026-12-30', '2027-01-02'), 3);
  assert.equal(addCalendarDays('2026-12-30', 3), '2027-01-02');
  // US DST fall-back (Nov 1, 2026) and spring-forward (Mar 8, 2026) must not drift night counts
  assert.equal(diffCalendarNights('2026-10-31', '2026-11-03'), 3);
  assert.equal(diffCalendarNights('2026-03-07', '2026-03-09'), 2);
  // Invalid ISO dates throw explicitly instead of returning NaN
  assert.throws(() => parseIsoDateUtc('not-a-date'));
});

test('iCal DATE-TIME normalization converts UTC instants into distinct property timezones accurately', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:tz_cross_midnight@airbnb.com',
    'DTSTART:20261120T233000Z',
    'DTEND:20261122T150000Z',
    'SUMMARY:Reserved',
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const paris = parseAndNormalizeIcalFeed(ics, 'Europe/Paris');
  assert.equal(paris.ok, true);
  assert.equal(paris.events[0]?.checkInDate, '2026-11-21'); // 23:30 UTC is 00:30+1 in Paris
  assert.equal(paris.events[0]?.checkOutDate, '2026-11-22');

  const la = parseAndNormalizeIcalFeed(ics, 'America/Los_Angeles');
  assert.equal(la.ok, true);
  assert.equal(la.events[0]?.checkInDate, '2026-11-20'); // 23:30 UTC is 15:30-8 in LA
  assert.equal(la.events[0]?.checkOutDate, '2026-11-22');
});

test('SSRF validation blocks private IP ranges, metadata IPs, embedded credentials, and non-443 ports', () => {
  const blockedUrls = [
    'http://airbnb.com/calendar/ical/123.ics',
    'https://localhost/cal.ics',
    'https://127.0.0.1/cal.ics',
    'https://[::1]/cal.ics',
    'https://169.254.169.254/latest/meta-data',
    'https://10.0.0.5/cal.ics',
    'https://192.168.1.50/cal.ics',
    'https://172.16.0.10/cal.ics',
    'https://metadata.google.internal/cal.ics',
    'https://airbnb.com:8443/cal.ics',
    'https://user:secret@airbnb.com/cal.ics',
  ];

  for (const url of blockedUrls) {
    const res = validateSafeIcalUrl(url);
    assert.equal(res.valid, false, `Expected URL to be blocked: ${url}`);
  }

  assert.equal(
    validateSafeIcalUrl('https://www.airbnb.com/calendar/ical/999999.ics?s=token').valid,
    true
  );
});

test('Property input validation rejects invalid names, invalid timezones, inverted rate floors, and unsafe iCal URLs', () => {
  const baseValid = {
    name: 'Canal Loft',
    propertyType: 'Loft' as const,
    city: 'Paris',
    country: 'France',
    timezone: 'Europe/Paris',
    currency: 'EUR' as const,
    defaultNightlyRate: 250,
    minimumBookingLength: 2,
    minimumAcceptableNightlyPrice: 180,
    maximumAcceptableDiscount: 20,
    analysisHorizonDays: 90,
    status: 'active' as const,
  };

  assert.equal(validatePropertyInput({ ...baseValid, name: 'X' }).valid, false);
  assert.equal(
    validatePropertyInput({ ...baseValid, timezone: 'Invalid/Zone' }).valid,
    false
  );
  assert.equal(
    validatePropertyInput({
      ...baseValid,
      defaultNightlyRate: 150,
      minimumAcceptableNightlyPrice: 200,
    }).valid,
    false
  );
  assert.equal(
    validatePropertyInput({
      ...baseValid,
      icalUrl: 'http://127.0.0.1/bad.ics',
    }).valid,
    false
  );
});

test('Multi-tenant RLS, PII firewall, and auth route guard enforce strict tenant security', () => {
  const store = new MultiTenantRlsStore();
  store.upsertProperty(
    'host_alpha',
    {
      id: 'prop_alpha_1',
      name: 'Alpha Villa',
      propertyType: 'Villa',
      city: 'Nice',
      country: 'France',
      timezone: 'Europe/Paris',
      currency: 'EUR',
      defaultNightlyRate: 300,
      minimumBookingLength: 2,
      minimumAcceptableNightlyPrice: 220,
      maximumAcceptableDiscount: 25,
      analysisHorizonDays: 90,
      status: 'active',
      createdAt: '2026-11-01T00:00:00Z',
    },
    'https://www.airbnb.com/calendar/ical/alpha.ics?s=topsecret'
  );

  // Beta host cannot read or delete Alpha's properties or secrets
  const betaSnapshot = store.getTenantSnapshot('host_beta');
  assert.equal(betaSnapshot.properties.length, 0);
  store.deleteProperty('host_beta', 'prop_alpha_1');
  assert.equal(store.getTenantSnapshot('host_alpha').properties.length, 1);

  const alphaCalId = store.getTenantSnapshot('host_alpha').calendars[0].id;
  assert.equal(store.getPrivateCalendarSecretServerOnly('host_beta', alphaCalId), null);
  assert.ok(
    store.getPrivateCalendarSecretServerOnly('host_alpha', alphaCalId)?.includes('topsecret')
  );

  // Auth guard blocks unauthenticated and expired sessions
  assert.equal(
    canAccessProtectedWorkspace({
      isAuthenticated: false,
      isDemoSession: false,
      sessionExpired: false,
      workspaceMode: 'live_supabase',
    }).allowed,
    false
  );
  assert.equal(
    canAccessProtectedWorkspace({
      isAuthenticated: true,
      isDemoSession: false,
      sessionExpired: true,
      workspaceMode: 'live_supabase',
    }).allowed,
    false
  );

  // PII guard catches leaked email or secret iCal URL
  assert.equal(
    detectPiiOrDisallowedKeys({
      city: 'Nice',
      notes: 'guest@gmail.com',
    }).safe,
    false
  );
});
