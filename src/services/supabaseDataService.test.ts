import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapPropertyFromDb,
  mapPropertyToDbInsert,
  maskCalendarUrl,
  MultiTenantRlsStore,
} from './supabaseDataService';
import { Property } from '../types/gapfill';

const sampleProp: Property = {
  id: 'prop_alpha',
  name: 'Nice Promenade Seafront Flat',
  propertyType: 'Apartment',
  city: 'Nice',
  country: 'France',
  timezone: 'Europe/Paris',
  currency: 'EUR',
  defaultNightlyRate: 210,
  minimumBookingLength: 3,
  minimumAcceptableNightlyPrice: 160,
  maximumAcceptableDiscount: 20,
  analysisHorizonDays: 90,
  status: 'active',
  createdAt: '2026-11-16T08:00:00Z',
};

test('mapPropertyToDbInsert strips owner_id and maps fields accurately', () => {
  const payload = mapPropertyToDbInsert(sampleProp);
  assert.equal('owner_id' in payload, false);
  assert.equal(payload.name, 'Nice Promenade Seafront Flat');
  assert.equal(payload.default_nightly_rate, 210);
  assert.equal(payload.minimum_acceptable_nightly_price, 160);

  const roundTrip = mapPropertyFromDb({
    id: 'prop_alpha',
    owner_id: 'usr_123',
    ...payload,
    created_at: '2026-11-16T08:00:00Z',
    updated_at: '2026-11-16T08:00:00Z',
  });
  assert.equal(roundTrip.id, 'prop_alpha');
  assert.equal(roundTrip.defaultNightlyRate, 210);
  assert.equal(roundTrip.timezone, 'Europe/Paris');
});

test('maskCalendarUrl hides secret query parameters and calendar tokens', () => {
  const raw =
    'https://www.airbnb.com/calendar/ical/987654321.ics?s=a98f76d54e3210secret';
  const masked = maskCalendarUrl(raw);
  assert.equal(masked.includes('a98f76d54e3210secret'), false);
  assert.equal(masked.includes('987654321'), false);
  assert.equal(
    masked,
    'https://www.airbnb.com/calendar/ical/9876••••••.ics'
  );
});

test('MultiTenantRlsStore enforces strict auth.uid() isolation between hosts', () => {
  const store = new MultiTenantRlsStore();

  // Host A creates a property with a secret iCal URL
  const hostASnapshot = store.upsertProperty(
    'host_user_A',
    sampleProp,
    'https://www.airbnb.com/calendar/ical/11112222.ics?s=topsecretA'
  );
  assert.equal(hostASnapshot.properties.length, 1);
  assert.equal(hostASnapshot.calendars.length, 1);
  assert.equal(
    hostASnapshot.calendars[0].maskedUrlPreview.includes('topsecretA'),
    false
  );

  // Host B queries their workspace -> sees 0 properties and 0 calendars
  const hostBSnapshot = store.getTenantSnapshot('host_user_B');
  assert.equal(hostBSnapshot.properties.length, 0);
  assert.equal(hostBSnapshot.calendars.length, 0);

  // Host B attempts to delete Host A's property -> blocked by RLS check
  store.deleteProperty('host_user_B', 'prop_alpha');
  assert.equal(store.getTenantSnapshot('host_user_A').properties.length, 1);

  // Host B attempts to read Host A's private calendar secret -> blocked
  const crossSecret = store.getPrivateCalendarSecretServerOnly(
    'host_user_B',
    hostASnapshot.calendars[0].id
  );
  assert.equal(crossSecret, null);

  // Host A server-side sync reads own secret -> allowed
  const ownSecret = store.getPrivateCalendarSecretServerOnly(
    'host_user_A',
    hostASnapshot.calendars[0].id
  );
  assert.equal(
    ownSecret,
    'https://www.airbnb.com/calendar/ical/11112222.ics?s=topsecretA'
  );
});
