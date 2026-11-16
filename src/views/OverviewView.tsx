'use client';

import React from 'react';
import {
  CalendarConnection,
  GapOpportunity,
  HostActionLog,
  NavigationPageId,
  Property,
  Reservation,
  WorkspaceDataMode,
} from '../types/gapfill';
import { aggregatePortfolioRevenueByCurrency } from '../features/financials/financialAndPriorityEngine';
import { formatPropertyCurrency } from '../features/properties/propertyValidation';
import { PropertyThumbnail } from '../components/PropertyThumbnail';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Clock,
  Plus,
  RefreshCw,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface OverviewViewProps {
  workspaceMode: WorkspaceDataMode;
  supabaseConfigured?: boolean;
  properties: Property[];
  calendars: CalendarConnection[];
  reservations: Reservation[];
  opportunities: GapOpportunity[];
  actions: HostActionLog[];
  onNavigate: (page: NavigationPageId) => void;
  onSelectOpportunity: (opportunityId: string) => void;
  onTriggerSyncAll: () => void;
  isSyncing: boolean;
}

export function OverviewView({
  workspaceMode,
  supabaseConfigured = false,
  properties,
  calendars,
  reservations,
  opportunities,
  actions,
  onNavigate,
  onSelectOpportunity,
  onTriggerSyncAll,
  isSyncing,
}: OverviewViewProps) {
  const activeProperties = properties.filter((p) => p.status === 'active');
  const confirmedReservations = reservations.filter(
    (r) => r.status === 'confirmed'
  );

  const actionableOpportunities = opportunities.filter(
    (o) => o.status === 'new' || o.status === 'viewed' || o.status === 'actioned'
  );
  const filledOpportunities = opportunities.filter((o) => o.status === 'filled');

  const detectedEmptyNights = actionableOpportunities.reduce(
    (sum, o) => sum + o.emptyNights,
    0
  );

  const currencySummary = aggregatePortfolioRevenueByCurrency({
    properties,
    opportunities,
  });
  const estimatedGrossOpportunity = currencySummary.totalEstimatedOpenNominal;
  const actualRecoveredRevenue = currencySummary.totalActualRecoveredNominal;

  const latestSyncTimestamp = calendars
    .map((c) => c.lastSyncedAt)
    .filter((t): t is string => Boolean(t))
    .sort()
    .reverse()[0];

  if (properties.length === 0) {
    const isLiveMissingBackend = workspaceMode === 'live_supabase' && !supabaseConfigured;
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-[#EBEBEB] bg-white p-8 sm:p-10">
          <div className="max-w-xl space-y-4">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                isLiveMissingBackend
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-[#FFF1F3] text-[#FF385C]'
              }`}
            >
              {isLiveMissingBackend ? (
                <AlertTriangle className="h-6 w-6" />
              ) : (
                <Building2 className="h-6 w-6" />
              )}
            </div>
            <h2 className="font-display text-2xl font-bold text-[#222222]">
              {isLiveMissingBackend
                ? 'Live Backend Setup Required'
                : workspaceMode === 'live_supabase'
                ? 'Welcome — Connect Your First Airbnb Listing'
                : 'Connect Your First Rental Property'}
            </h2>
            <p className="text-sm leading-relaxed text-[#717171]">
              {isLiveMissingBackend
                ? 'Live Supabase persistence and automated calendar sync are not configured in this environment yet. Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to connect live host storage, or explore the isolated DEMO sandbox.'
                : 'Paste your Airbnb or Vrbo iCal link to detect unbookable gaps between guest check-ins, protect your nightly rate floor, and draft guest extension messages.'}
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              {isLiveMissingBackend ? (
                <>
                  <button
                    type="button"
                    onClick={() => onNavigate('settings')}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#222222] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black"
                  >
                    <span>Open Backend Setup &amp; Health</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('properties')}
                    className="inline-flex items-center gap-2 rounded-lg border border-[#DDDDDD] bg-white px-5 py-2.5 text-sm font-medium text-[#222222] transition-colors hover:bg-[#F7F7F7]"
                  >
                    <span>View Listings Configuration</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onNavigate('properties')}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#FF385C] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#E00B41]"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add First Listing</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('settings')}
                    className="inline-flex items-center gap-2 rounded-lg border border-[#DDDDDD] bg-white px-5 py-2.5 text-sm font-medium text-[#222222] transition-colors hover:bg-[#F7F7F7]"
                  >
                    <span>View Setup &amp; Health Guide</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const chartData = properties.map((prop) => {
    const propOpps = opportunities.filter((o) => o.propertyId === prop.id);
    const openGross = propOpps
      .filter((o) => o.status === 'new' || o.status === 'viewed' || o.status === 'actioned')
      .reduce((acc, o) => acc + o.financials.suggestedGross, 0);
    const recoveredGross = propOpps
      .filter((o) => o.status === 'filled')
      .reduce((acc, o) => acc + (o.actualRecoveredRevenue ?? 0), 0);
    const emptyNightsCount = propOpps
      .filter((o) => o.status === 'new' || o.status === 'viewed' || o.status === 'actioned')
      .reduce((acc, o) => acc + o.emptyNights, 0);

    return {
      propertyId: prop.id,
      name: `${prop.city} ${prop.propertyType}`,
      fullName: prop.name,
      city: prop.city,
      estimatedOpportunity: openGross,
      actualRecovered: recoveredGross,
      emptyNights: emptyNightsCount,
    };
  });

  const formatSyncTime = (iso?: string) => {
    if (!iso) return 'Not yet synced';
    return `${iso.slice(0, 10)} · ${iso.slice(11, 16)} UTC`;
  };

  return (
    <div className="space-y-8">
      {/* Warm Host Greeting & Sync Bar */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#EBEBEB] pb-6">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold text-[#222222] sm:text-3xl">
            Host Calendar &amp; Gap Overview
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#717171]">
            <Clock className="h-3.5 w-3.5 text-[#717171]" />
            <span>Last iCal sync:</span>
            <span className="font-medium text-[#222222] tabular-nums">
              {formatSyncTime(latestSyncTimestamp)}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {calendars.filter((c) => c.syncStatus === 'healthy').length} of {calendars.length}{' '}
              calendars healthy
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onTriggerSyncAll}
            disabled={isSyncing}
            className="inline-flex items-center gap-2 rounded-lg border border-[#DDDDDD] bg-white px-4 py-2.5 text-xs font-semibold text-[#222222] transition-colors hover:bg-[#F7F7F7] disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 shrink-0 ${isSyncing ? 'animate-spin text-[#FF385C]' : ''}`}
            />
            <span>{isSyncing ? 'Syncing All Listings…' : 'Sync All Calendars'}</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('opportunities')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#FF385C] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#E00B41] whitespace-nowrap shrink-0"
          >
            <span>Review All Opportunities</span>
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
          </button>
        </div>
      </div>

      {/* 6 Hospitality KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-2xl border border-[#EBEBEB] bg-white p-5">
          <div className="text-xs font-medium text-[#717171]">Active Listings</div>
          <div className="mt-2 font-display text-2xl font-bold text-[#222222] tabular-nums">
            {activeProperties.length}
          </div>
          <div className="mt-1 text-xs text-[#717171]">
            {properties.length} total configured
          </div>
        </div>

        <div className="rounded-2xl border border-[#EBEBEB] bg-white p-5">
          <div className="text-xs font-medium text-[#717171]">Upcoming Stays</div>
          <div className="mt-2 font-display text-2xl font-bold text-[#222222] tabular-nums">
            {confirmedReservations.length}
          </div>
          <div className="mt-1 text-xs text-[#717171]">Confirmed iCal bookings</div>
        </div>

        <div className="rounded-2xl border border-[#EBEBEB] bg-white p-5">
          <div className="text-xs font-medium text-[#717171]">Empty Gap Nights</div>
          <div className="mt-2 font-display text-2xl font-bold text-[#B45309] tabular-nums">
            {detectedEmptyNights}
          </div>
          <div className="mt-1 text-xs text-[#717171]">Unbooked nights between stays</div>
        </div>

        <div className="rounded-2xl border border-[#EBEBEB] bg-white p-5">
          <div className="text-xs font-medium text-[#717171]">Open Opportunities</div>
          <div className="mt-2 font-display text-2xl font-bold text-[#222222] tabular-nums">
            {actionableOpportunities.length}
          </div>
          <div className="mt-1 text-xs text-[#717171]">
            {actionableOpportunities.filter((o) => !o.isMinStayCompatible).length} blocked by
            min-stay
          </div>
        </div>

        <div className="rounded-2xl border border-[#EBEBEB] bg-white p-5">
          <div className="text-xs font-medium text-[#717171]">Estimated Open Gross</div>
          <div className="mt-2 font-display text-2xl font-bold text-[#FF385C] tabular-nums">
            {currencySummary.hasMultipleCurrencies
              ? `${estimatedGrossOpportunity.toLocaleString()} (mixed)`
              : formatPropertyCurrency(
                  estimatedGrossOpportunity,
                  currencySummary.buckets[0]?.currency ?? 'USD'
                )}
          </div>
          <div className="mt-1 text-xs text-[#717171]">Potential from open gaps</div>
        </div>

        <div className="rounded-2xl border border-[#EBEBEB] bg-white p-5">
          <div className="text-xs font-medium text-[#717171]">Recovered Revenue</div>
          <div className="mt-2 font-display text-2xl font-bold text-[#008A05] tabular-nums">
            {currencySummary.hasMultipleCurrencies
              ? `${actualRecoveredRevenue.toLocaleString()} (mixed)`
              : formatPropertyCurrency(
                  actualRecoveredRevenue,
                  currencySummary.buckets[0]?.currency ?? 'USD'
                )}
          </div>
          <div className="mt-1 text-xs text-[#717171]">
            {filledOpportunities.length} host-confirmed bookings
          </div>
        </div>
      </div>

      {/* Main Split: Top Priority Opportunities + Revenue Comparison Chart */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-2xl border border-[#EBEBEB] bg-white lg:col-span-7">
          <div className="flex items-center justify-between border-b border-[#EBEBEB] px-6 py-4">
            <div>
              <h2 className="font-display text-base font-bold text-[#222222]">
                Priority Gaps Needing Attention
              </h2>
              <p className="text-xs text-[#717171]">
                Ranked by check-in urgency, gap length, gross value, and your min-stay rules
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('opportunities')}
              className="text-xs font-semibold text-[#222222] underline hover:text-[#FF385C] whitespace-nowrap shrink-0"
            >
              View all ({opportunities.length})
            </button>
          </div>

          <div className="divide-y divide-[#EBEBEB]">
            {actionableOpportunities.slice(0, 4).map((opp) => {
              const prop = properties.find((p) => p.id === opp.propertyId);
              return (
                <div
                  key={opp.id}
                  className="flex flex-col justify-between gap-4 px-6 py-4 transition-colors hover:bg-[#F7F7F7]/60 sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 items-center gap-3.5">
                    <PropertyThumbnail
                      propertyId={opp.propertyId}
                      propertyName={prop?.name ?? 'Listing'}
                      propertyType={prop?.propertyType}
                      size="sm"
                    />
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-[#222222]">
                          {prop?.name ?? 'Listing'}
                        </span>
                        <span className="text-[#DDDDDD]" aria-hidden="true">
                          ·
                        </span>
                        <span
                          className={`text-xs font-semibold ${
                            opp.priority.label === 'High priority'
                              ? 'text-[#FF385C]'
                              : opp.priority.label === 'Medium priority'
                              ? 'text-[#B45309]'
                              : 'text-[#717171]'
                          }`}
                        >
                          {opp.priority.label} ({opp.priority.totalScore}/100)
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#717171]">
                        <span className="font-medium text-[#222222] tabular-nums">
                          {opp.gapStartDate} → {opp.gapEndDate}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">
                          {opp.emptyNights} {opp.emptyNights === 1 ? 'empty night' : 'empty nights'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Starts in {opp.daysUntilStart}d</span>
                        {!opp.isMinStayCompatible && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-medium text-[#B45309]">
                              Needs min-stay override ({opp.minStayRequired}n)
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center justify-between gap-4 sm:justify-end">
                    <div className="text-right whitespace-nowrap shrink-0">
                      <div className="font-display text-sm font-bold text-[#222222] tabular-nums">
                        Est.{' '}
                        {formatPropertyCurrency(
                          opp.financials.suggestedGross,
                          prop?.currency ?? 'USD'
                        )}
                      </div>
                      <div className="text-xs text-[#717171] tabular-nums">
                        {formatPropertyCurrency(
                          opp.financials.suggestedNightlyRate,
                          prop?.currency ?? 'USD'
                        )}
                        /night (-{opp.financials.recommendedDiscountPercent}%)
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onSelectOpportunity(opp.id);
                        onNavigate('opportunities');
                      }}
                      className="rounded-lg border border-[#222222] bg-white px-3.5 py-2 text-xs font-semibold text-[#222222] transition-colors hover:bg-[#222222] hover:text-white whitespace-nowrap shrink-0"
                    >
                      Inspect &amp; Act
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#EBEBEB] bg-white p-6 lg:col-span-5">
          <div>
            <h2 className="font-display text-base font-bold text-[#222222]">
              Open Opportunity vs. Recovered Earnings
            </h2>
            <p className="text-xs text-[#717171]">
              Estimated unbooked gap potential compared with confirmed filled bookings
            </p>
          </div>

          <div className="my-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EBEBEB" vertical={false} />
                <XAxis
                  dataKey="name"
                  interval={0}
                  tick={{ fontSize: 11, fill: '#717171' }}
                  axisLine={{ stroke: '#DDDDDD' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#717171' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip
                  formatter={(value: unknown, name: unknown) => [
                    `$${Number(value).toLocaleString()}`,
                    String(name),
                  ]}
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid #EBEBEB',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar
                  dataKey="estimatedOpportunity"
                  name="Estimated Open Gross"
                  fill="#FF385C"
                  radius={[6, 6, 0, 0]}
                />
                <Bar
                  dataKey="actualRecovered"
                  name="Actual Recovered Revenue"
                  fill="#008A05"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="border-t border-[#EBEBEB] pt-3 text-xs text-[#717171]">
            Booking subtotals shown before platform host fees or local occupancy taxes.
          </div>
        </div>
      </div>

      {/* Bottom Row: Listings Table & Host Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-2xl border border-[#EBEBEB] bg-white lg:col-span-7">
          <div className="flex items-center justify-between border-b border-[#EBEBEB] px-6 py-4">
            <div>
              <h2 className="font-display text-base font-bold text-[#222222]">
                Listings &amp; Calendar Health
              </h2>
              <p className="text-xs text-[#717171]">
                Per-listing timezone, nightly floor, sync status, and recovered bookings
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('properties')}
              className="text-xs font-semibold text-[#222222] underline hover:text-[#FF385C]"
            >
              Manage listings
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#EBEBEB] bg-[#F7F7F7] text-[#717171]">
                  <th className="px-6 py-3 font-semibold">Listing</th>
                  <th className="px-4 py-3 font-semibold">Timezone</th>
                  <th className="px-4 py-3 text-right font-semibold">Base / Floor</th>
                  <th className="px-4 py-3 text-right font-semibold">Open Gross</th>
                  <th className="px-4 py-3 text-right font-semibold">Recovered</th>
                  <th className="px-6 py-3 font-semibold">Calendar Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBEBEB]">
                {properties.map((prop) => {
                  const cal = calendars.find((c) => c.propertyId === prop.id);
                  const rowPerf = chartData.find((c) => c.propertyId === prop.id);
                  return (
                    <tr key={prop.id} className="hover:bg-[#F7F7F7]/60">
                      <td className="px-6 py-3.5">
                        <div className="font-semibold text-[#222222]">{prop.name}</div>
                        <div className="text-[#717171]">
                          {prop.city}, {prop.country} · Min {prop.minimumBookingLength} nights
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-[#717171]">{prop.timezone}</td>
                      <td className="px-4 py-3.5 text-right font-medium text-[#222222] tabular-nums">
                        {formatPropertyCurrency(prop.defaultNightlyRate, prop.currency)} /{' '}
                        {formatPropertyCurrency(
                          prop.minimumAcceptableNightlyPrice,
                          prop.currency
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold text-[#FF385C] tabular-nums">
                        {formatPropertyCurrency(
                          rowPerf?.estimatedOpportunity ?? 0,
                          prop.currency
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold text-[#008A05] tabular-nums">
                        {formatPropertyCurrency(rowPerf?.actualRecovered ?? 0, prop.currency)}
                      </td>
                      <td className="px-6 py-3.5">
                        {cal?.syncStatus === 'healthy' && (
                          <span className="inline-flex items-center gap-1.5 font-medium text-[#008A05]">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Healthy</span>
                          </span>
                        )}
                        {cal?.syncStatus === 'warning' && (
                          <span className="inline-flex items-center gap-1.5 font-medium text-[#B45309]">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            <span>Flagged Event</span>
                          </span>
                        )}
                        {cal?.syncStatus === 'error' && (
                          <span className="inline-flex items-center gap-1.5 font-medium text-[#C13515]">
                            <AlertCircle className="h-3.5 w-3.5" />
                            <span>Sync Error</span>
                          </span>
                        )}
                        {(!cal || cal.syncStatus === 'never_synced') && (
                          <span className="text-[#717171]">Not synced</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="rounded-2xl border border-[#EBEBEB] bg-white lg:col-span-5">
          <div className="flex items-center justify-between border-b border-[#EBEBEB] px-6 py-4">
            <div>
              <h2 className="font-display text-base font-bold text-[#222222]">
                Recent Host Activity
              </h2>
              <p className="text-xs text-[#717171]">
                Copied messages, pricing drafts, and confirmed recovered nights
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('activity')}
              className="text-xs font-semibold text-[#222222] underline hover:text-[#FF385C]"
            >
              Full history
            </button>
          </div>

          <div className="divide-y divide-[#EBEBEB]">
            {actions.slice(0, 4).map((act) => (
              <div key={act.id} className="space-y-1 px-6 py-4">
                <div className="flex items-center justify-between text-xs text-[#717171]">
                  <span className="font-semibold capitalize text-[#222222]">
                    {act.actionType.replace(/_/g, ' ')}
                  </span>
                  <span className="tabular-nums">
                    {act.createdAt.slice(0, 10)} · {act.createdAt.slice(11, 16)} UTC
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-[#717171]">{act.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
