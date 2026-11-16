import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { processCalendarSyncRequest } from '../calendar/calendarSyncHandler';
import {
  buildLiveCalendarSyncPayload,
  executeLiveCalendarSync,
} from '../calendar/liveSyncClient';
import { buildSampleAirbnbIcsFeed } from '../calendar/icalSyncEngine';
import { handleSyncCalendarRequest } from '../../../supabase/functions/sync-calendar/index';
import { MultiTenantRlsStore } from '../../services/supabaseDataService';
import { aggregatePortfolioRevenueByCurrency } from '../financials/financialAndPriorityEngine';
import {
  DEMO_PREFIX,
  INITIAL_DEMO_ACTIONS,
  INITIAL_DEMO_CALENDARS,
  INITIAL_DEMO_PROPERTIES,
  INITIAL_DEMO_RESERVATIONS,
  INITIAL_DEMO_SYNC_RUNS,
} from '../../services/demoDataset';
import {
  canAccessProtectedWorkspace,
  resolveActiveWorkspaceMode,
  resolveWorkspaceEntryFromSearch,
} from '../../utils/authValidation';
import { Property } from '../../types/gapfill';

const liveTestProperty: Property = {
  id: 'live_prop_1',
  name: 'Lyon Presquile Apartment',
  propertyType: 'Apartment',
  city: 'Lyon',
  country: 'France',
  timezone: 'Europe/Paris',
  currency: 'EUR',
  defaultNightlyRate: 180,
  minimumBookingLength: 2,
  minimumAcceptableNightlyPrice: 140,
  maximumAcceptableDiscount: 20,
  analysisHorizonDays: 90,
  status: 'active',
  createdAt: '2026-11-16T10:00:00Z',
};

test('live mode never calls buildSampleAirbnbIcsFeed and never sends simulationMode', async () => {
  // 1. Static guard: production sync modules must not import or reference buildSampleAirbnbIcsFeed
  const root = process.cwd();
  const productionSyncFiles = [
    'app/api/calendar/sync/route.ts',
    'src/features/calendar/calendarSyncHandler.ts',
    'src/features/calendar/liveSyncClient.ts',
    'supabase/functions/sync-calendar/index.ts',
  ];
  for (const relPath of productionSyncFiles) {
    const content = fs.readFileSync(path.join(root, relPath), 'utf8');
    assert.equal(
      content.includes('buildSampleAirbnbIcsFeed'),
      false,
      `${relPath} must not reference buildSampleAirbnbIcsFeed`
    );
  }

  // 2. Live client sync payload omits simulationMode
  const payload = buildLiveCalendarSyncPayload(liveTestProperty);
  assert.equal('simulationMode' in payload, false);

  let capturedFetchBody: Record<string, unknown> | null = null;
  const mockClientFetch: typeof fetch = async (_input, init) => {
    capturedFetchBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    const handlerResult = await processCalendarSyncRequest(capturedFetchBody);
    return new Response(JSON.stringify(handlerResult.body), {
      status: handlerResult.status,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const liveRes = await executeLiveCalendarSync(liveTestProperty, mockClientFetch);
  assert.ok(capturedFetchBody);
  assert.equal('simulationMode' in capturedFetchBody, false);
  assert.equal(liveRes.ok, false);
  assert.equal(liveRes.errorCode, 'BACKEND_NOT_CONFIGURED');
  assert.equal(liveRes.events?.length ?? 0, 0);

  // 3. Passing simulationMode to production /api/calendar/sync or Edge Function is rejected
  const simApiResult = await processCalendarSyncRequest({
    propertyId: liveTestProperty.id,
    propertyName: liveTestProperty.name,
    propertyTimezone: liveTestProperty.timezone,
    simulationMode: 'standard',
  });
  assert.equal(simApiResult.status, 400);
  assert.equal(simApiResult.body.ok, false);
  assert.equal(simApiResult.body.errorCode, 'SIMULATION_NOT_ALLOWED');
  assert.equal(simApiResult.body.events?.length ?? 0, 0);

  const edgeSimRes = await handleSyncCalendarRequest(
    new Request('https://edge.local/sync-calendar', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        propertyId: liveTestProperty.id,
        calendarConnectionId: 'cal_1',
        simulationMode: 'standard',
      }),
    })
  );
  assert.equal(edgeSimRes.status, 400);

  // 4. Edge Function without feed URL / override returns honest 503 not-configured error
  const edgeNoUrlRes = await handleSyncCalendarRequest(
    new Request('https://edge.local/sync-calendar', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        propertyId: liveTestProperty.id,
        calendarConnectionId: 'cal_1',
      }),
    })
  );
  assert.equal(edgeNoUrlRes.status, 503);
  const edgeNoUrlJson = (await edgeNoUrlRes.json()) as {
    ok: boolean;
    errorCode?: string;
  };
  assert.equal(edgeNoUrlJson.ok, false);
  assert.equal(edgeNoUrlJson.errorCode, 'BACKEND_NOT_CONFIGURED');
});

test('recognized provider domains (airbnb, vrbo, example.com) never trigger sample substitution', async () => {
  const providerUrls = [
    'https://www.airbnb.com/calendar/ical/4829104.ics?s=secret_token',
    'https://www.vrbo.com/icalendar/991122.ics',
    'https://example.com/calendar.ics',
  ];

  for (const url of providerUrls) {
    let fetchedUrl: string | null = null;
    const failingFetch: typeof fetch = async (input) => {
      fetchedUrl = typeof input === 'string' ? input : input.toString();
      return new Response('Not Found', { status: 404 });
    };

    const result = await processCalendarSyncRequest(
      {
        propertyId: liveTestProperty.id,
        propertyName: liveTestProperty.name,
        propertyTimezone: liveTestProperty.timezone,
        rawIcalUrl: url,
      },
      { fetchImpl: failingFetch }
    );

    assert.equal(fetchedUrl, url, `Expected direct fetch for ${url}`);
    assert.equal(result.status, 422);
    assert.equal(result.body.ok, false);
    assert.equal(result.body.syncStatus, 'error');
    assert.equal(result.body.errorCode, 'REMOTE_FETCH_FAILED');
    assert.equal(result.body.events?.length ?? 0, 0);
  }

  // Successful fetch on airbnb.com returns ONLY the fetched feed's events, never sample data
  const realMinimalIcs = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:real_airbnb_999@airbnb.com',
    'DTSTART;VALUE=DATE:20261210',
    'DTEND;VALUE=DATE:20261214',
    'SUMMARY:Reserved',
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const okFetch: typeof fetch = async () =>
    new Response(realMinimalIcs, {
      status: 200,
      headers: { 'Content-Type': 'text/calendar' },
    });

  const okResult = await processCalendarSyncRequest(
    {
      propertyId: liveTestProperty.id,
      propertyTimezone: 'Europe/Paris',
      rawIcalUrl: 'https://www.airbnb.com/calendar/ical/999.ics?s=live',
    },
    { fetchImpl: okFetch }
  );
  assert.equal(okResult.status, 200);
  assert.equal(okResult.body.ok, true);
  assert.equal(okResult.body.events?.length, 1);
  assert.equal(okResult.body.events?.[0]?.sourceUid, 'real_airbnb_999@airbnb.com');
  assert.equal(okResult.body.events?.[0]?.summaryLabel, 'Reserved');
});

test('failed sync never creates reservations, gaps, or revenue in live mode', () => {
  const store = new MultiTenantRlsStore();
  store.upsertProperty(
    'live_host_uid',
    liveTestProperty,
    'https://www.airbnb.com/calendar/ical/555666.ics?s=livekey',
    'Airbnb Live Feed'
  );

  const afterFailedSync = store.applyCalendarSyncResult('live_host_uid', {
    propertyId: liveTestProperty.id,
    referenceDateStr: '2026-11-16',
    ok: false,
    syncStatus: 'error',
    parsedEvents: [],
    flaggedAmbiguousCount: 0,
    lastSyncedAt: '2026-11-16T12:00:00Z',
    errorMessage: 'Backend iCal secret lookup not configured.',
  });

  assert.equal(afterFailedSync.reservations.length, 0);
  assert.equal(afterFailedSync.opportunities.length, 0);
  assert.equal(afterFailedSync.calendars[0]?.syncStatus, 'error');
  assert.equal(afterFailedSync.syncRuns[0]?.status, 'error');
  assert.equal(afterFailedSync.syncRuns[0]?.reservationsUpserted, 0);
  assert.equal(afterFailedSync.syncRuns[0]?.gapsRecalculated, 0);

  const revenueSummary = aggregatePortfolioRevenueByCurrency({
    properties: afterFailedSync.properties,
    opportunities: afterFailedSync.opportunities,
  });
  assert.equal(revenueSummary.totalEstimatedOpenNominal, 0);
  assert.equal(revenueSummary.totalActualRecoveredNominal, 0);
});

test('demo data is unmistakably labeled and ?autostart=1 is strictly demo-only', () => {
  for (const prop of INITIAL_DEMO_PROPERTIES) {
    assert.ok(prop.name.startsWith(DEMO_PREFIX), `Missing [DEMO] label on property ${prop.id}`);
  }
  for (const cal of INITIAL_DEMO_CALENDARS) {
    assert.ok(cal.sourceName.startsWith(DEMO_PREFIX), `Missing [DEMO] label on calendar ${cal.id}`);
  }
  for (const res of INITIAL_DEMO_RESERVATIONS) {
    assert.ok(res.summaryLabel.startsWith(DEMO_PREFIX), `Missing [DEMO] label on reservation ${res.id}`);
  }
  for (const act of INITIAL_DEMO_ACTIONS) {
    assert.ok(act.description.startsWith(DEMO_PREFIX), `Missing [DEMO] label on action ${act.id}`);
  }
  for (const run of INITIAL_DEMO_SYNC_RUNS) {
    assert.ok(run.message.startsWith(DEMO_PREFIX), `Missing [DEMO] label on sync run ${run.id}`);
  }

  const sampleIcs = buildSampleAirbnbIcsFeed(
    { id: 'demo_prop_1', name: 'Demo', timezone: 'Europe/Paris' },
    'standard'
  );
  assert.ok(sampleIcs.includes('GapFill DEMO'));
  assert.ok(sampleIcs.includes('[DEMO] Reserved'));

  // ?autostart=1 enters demo-only mode and NEVER grants live_supabase access
  const autostart = resolveWorkspaceEntryFromSearch('?autostart=1');
  assert.equal(autostart.enterDemoOnly, true);
  assert.equal(autostart.forceDemoMode, true);

  const normalLoad = resolveWorkspaceEntryFromSearch('');
  assert.equal(normalLoad.enterDemoOnly, false);

  const autostartLiveAttempt = canAccessProtectedWorkspace({
    isAuthenticated: false,
    isDemoSession: true,
    sessionExpired: false,
    workspaceMode: 'live_supabase',
  });
  assert.equal(autostartLiveAttempt.allowed, false);

  // Authenticated users default to live_supabase and start with empty tenant state (no demo contamination)
  assert.equal(
    resolveActiveWorkspaceMode({
      isAuthenticated: true,
      isDemoSession: false,
      requestedMode: null,
    }),
    'live_supabase'
  );

  const freshLiveStore = new MultiTenantRlsStore();
  const emptyLiveSnapshot = freshLiveStore.getTenantSnapshot('fresh_auth_user_1');
  assert.equal(emptyLiveSnapshot.properties.length, 0);
  assert.equal(emptyLiveSnapshot.reservations.length, 0);
  assert.equal(emptyLiveSnapshot.opportunities.length, 0);
  assert.equal(emptyLiveSnapshot.actions.length, 0);
  assert.equal(emptyLiveSnapshot.syncRuns.length, 0);
});
