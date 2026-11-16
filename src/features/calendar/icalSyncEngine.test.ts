import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSampleAirbnbIcsFeed,
  parseAndNormalizeIcalFeed,
  reconcileReservationsByUid,
  validateSafeIcalUrl,
} from './icalSyncEngine';
import { Reservation } from '../../types/gapfill';

test('validateSafeIcalUrl enforces HTTPS on port 443 and blocks SSRF targets', () => {
  assert.equal(
    validateSafeIcalUrl('https://www.airbnb.com/calendar/ical/123456.ics?s=abc').valid,
    true
  );
  assert.equal(
    validateSafeIcalUrl('http://www.airbnb.com/calendar/ical/123456.ics').valid,
    false
  );
  assert.equal(
    validateSafeIcalUrl('https://www.airbnb.com:8443/calendar/ical/123456.ics').valid,
    false
  );
  assert.equal(
    validateSafeIcalUrl('https://127.0.0.1/calendar.ics').valid,
    false
  );
  assert.equal(
    validateSafeIcalUrl('https://169.254.169.254/latest/meta-data/').valid,
    false
  );
  assert.equal(
    validateSafeIcalUrl('https://192.168.1.25/calendar.ics').valid,
    false
  );
  assert.equal(
    validateSafeIcalUrl('https://metadata.google.internal/calendar.ics').valid,
    false
  );
});

test('parseAndNormalizeIcalFeed parses RFC 5545 VEVENTs via ical.js and normalizes dates in property timezone', () => {
  const rawIcs = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Airbnb Inc//Hosting Calendar 1.0//EN',
    'BEGIN:VEVENT',
    'UID:evt_100@airbnb.com',
    'DTSTART;VALUE=DATE:20261118',
    'DTEND;VALUE=DATE:20261122',
    'SUMMARY:Reserved — Guest Alpha',
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:evt_101@airbnb.com',
    'DTSTART;VALUE=DATE:20261125',
    'DTEND;VALUE=DATE:20261129',
    'SUMMARY:Airbnb (Not available)',
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:evt_102@airbnb.com',
    'DTSTART;VALUE=DATE:20261201',
    'DTEND;VALUE=DATE:20261205',
    'SUMMARY:Canceled Booking',
    'STATUS:CANCELLED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const result = parseAndNormalizeIcalFeed(rawIcs, 'Europe/Paris');
  assert.equal(result.ok, true);
  assert.equal(result.events.length, 3);
  assert.equal(result.flaggedAmbiguousCount, 1);
  assert.equal(result.cancelledCount, 1);

  assert.equal(result.events[0]?.sourceUid, 'evt_100@airbnb.com');
  assert.equal(result.events[0]?.checkInDate, '2026-11-18');
  assert.equal(result.events[0]?.checkOutDate, '2026-11-22');
  assert.equal(result.events[0]?.status, 'confirmed');

  assert.equal(result.events[1]?.status, 'ambiguous_block');
  assert.equal(result.events[2]?.status, 'cancelled');
});

test('parseAndNormalizeIcalFeed handles malformed feeds gracefully', () => {
  const malformed = buildSampleAirbnbIcsFeed(
    { id: 'prop_1', name: 'Test', timezone: 'Europe/Paris' },
    'malformed'
  );
  const res = parseAndNormalizeIcalFeed(malformed, 'Europe/Paris');
  assert.equal(res.ok, false);
  assert.ok(res.errorMessage?.includes('Malformed iCal feed'));
});

test('reconcileReservationsByUid deduplicates by propertyId + sourceUid and updates canceled events', () => {
  const initialReservations: Reservation[] = [
    {
      id: 'res_existing_1',
      propertyId: 'demo_prop_1',
      sourceUid: 'airbnb_uid_101@airbnb.com',
      checkInDate: '2026-11-16',
      checkOutDate: '2026-11-19', // Will be extended to 2026-11-20 by incoming feed
      status: 'confirmed',
      summaryLabel: 'Reserved (4 nights)',
      updatedAt: '2026-11-10T00:00:00Z',
    },
    {
      id: 'res_other_prop',
      propertyId: 'demo_prop_2',
      sourceUid: 'airbnb_uid_201@airbnb.com',
      checkInDate: '2026-11-17',
      checkOutDate: '2026-11-21',
      status: 'confirmed',
      summaryLabel: 'Reserved — Sedona Guest',
      updatedAt: '2026-11-10T00:00:00Z',
    },
  ];

  const feedWithCancel = buildSampleAirbnbIcsFeed(
    {
      id: 'demo_prop_1',
      name: 'Canal Saint-Martin Design Loft',
      timezone: 'Europe/Paris',
    },
    'with_cancellation'
  );
  const parsed = parseAndNormalizeIcalFeed(feedWithCancel, 'Europe/Paris');
  assert.equal(parsed.ok, true);

  const reconciled = reconcileReservationsByUid({
    existingReservations: initialReservations,
    parsedEvents: parsed.events,
    propertyId: 'demo_prop_1',
    syncTimestampIso: '2026-11-16T10:00:00Z',
  });

  // 1 other property reservation + 4 unique UIDs for demo_prop_1 = 5 total
  assert.equal(reconciled.reservations.length, 5);
  assert.equal(reconciled.updatedCount, 1);
  assert.equal(reconciled.insertedCount, 3);
  assert.equal(reconciled.cancelledCount, 1);

  const updated101 = reconciled.reservations.find(
    (r) => r.sourceUid === 'airbnb_uid_101@airbnb.com'
  );
  assert.equal(updated101?.checkOutDate, '2026-11-20');

  const cancelled102 = reconciled.reservations.find(
    (r) => r.sourceUid === 'airbnb_uid_102@airbnb.com'
  );
  assert.equal(cancelled102?.status, 'cancelled');
});
