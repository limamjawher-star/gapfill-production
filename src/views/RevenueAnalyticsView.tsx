'use client';

import React, { useState } from 'react';
import { GapOpportunity, HostActionLog, Property } from '../types/gapfill';
import {
  buildMonthlyTrendSeries,
  buildPropertyAnalyticsBreakdown,
  computeActionFunnelMetrics,
} from '../features/analytics/analyticsEngine';
import { aggregatePortfolioRevenueByCurrency } from '../features/financials/financialAndPriorityEngine';
import { formatPropertyCurrency } from '../features/properties/propertyValidation';
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
import { Info, TrendingUp } from 'lucide-react';

interface RevenueAnalyticsViewProps {
  properties: Property[];
  opportunities: GapOpportunity[];
  actions?: HostActionLog[];
}

export function RevenueAnalyticsView({
  properties,
  opportunities,
  actions = [],
}: RevenueAnalyticsViewProps) {
  const [selectedPropertyFilter, setSelectedPropertyFilter] = useState<string>('all');

  const scopedProperties =
    selectedPropertyFilter === 'all'
      ? properties
      : properties.filter((p) => p.id === selectedPropertyFilter);

  const scopedOpportunities =
    selectedPropertyFilter === 'all'
      ? opportunities
      : opportunities.filter((o) => o.propertyId === selectedPropertyFilter);

  const scopedActions =
    selectedPropertyFilter === 'all'
      ? actions
      : actions.filter((a) => a.propertyId === selectedPropertyFilter);

  const portfolioRevenue = aggregatePortfolioRevenueByCurrency({
    properties: scopedProperties,
    opportunities: scopedOpportunities,
  });

  const funnel = computeActionFunnelMetrics(scopedOpportunities, scopedActions);
  const propertyBreakdown = buildPropertyAnalyticsBreakdown(
    scopedProperties,
    scopedOpportunities
  );
  const monthlyData = buildMonthlyTrendSeries(scopedOpportunities);

  const detectedEmptyNights = scopedOpportunities
    .filter((o) => o.status !== 'dismissed')
    .reduce((sum, o) => sum + o.emptyNights, 0);

  const activeCurrency =
    selectedPropertyFilter !== 'all'
      ? scopedProperties[0]?.currency ?? 'USD'
      : portfolioRevenue.buckets[0]?.currency ?? 'USD';

  const formatMetricVal = (amount: number) =>
    portfolioRevenue.hasMultipleCurrencies && selectedPropertyFilter === 'all'
      ? `${amount.toLocaleString()} (mixed)`
      : formatPropertyCurrency(amount, activeCurrency);

  if (opportunities.length === 0) {
    return (
      <div className="rounded-2xl border border-[#EBEBEB] bg-white p-10 text-center">
        <TrendingUp className="mx-auto h-8 w-8 text-[#717171]" />
        <h3 className="mt-3 font-display text-base font-bold text-[#222222]">
          No Earnings Analytics Available Yet
        </h3>
        <p className="mx-auto mt-1.5 max-w-md text-xs text-[#717171]">
          Once your listing iCal feeds are synchronized, GapFill will plot estimated orphan-night
          opportunity against host-confirmed recovered revenue.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Property Filter */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#EBEBEB] bg-white px-6 py-5">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#FF385C]" />
          <div className="text-xs leading-relaxed text-[#717171]">
            <strong className="text-[#222222]">Accounting Integrity:</strong>{' '}
            <strong className="text-[#222222]">Estimated Opportunity</strong> reflects potential
            gross revenue from unbooked orphan nights.{' '}
            <strong className="text-[#222222]">Actual Recovered Revenue</strong> includes only
            bookings explicitly confirmed as filled by the host.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="analytics-prop-filter" className="text-xs font-medium text-[#717171]">
            Listing Scope:
          </label>
          <select
            id="analytics-prop-filter"
            value={selectedPropertyFilter}
            onChange={(e) => setSelectedPropertyFilter(e.target.value)}
            className="rounded-lg border border-[#DDDDDD] bg-white px-3 py-1.5 text-xs font-medium text-[#222222] focus:border-[#222222] focus:outline-none"
          >
            <option value="all">All Listings ({properties.length})</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.currency})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Multi-Currency Breakdown Banner (when portfolio spans > 1 ISO currency) */}
      {portfolioRevenue.hasMultipleCurrencies && selectedPropertyFilter === 'all' && (
        <div className="rounded-2xl border border-[#EBEBEB] bg-white px-6 py-4 text-xs">
          <div className="font-display font-semibold text-[#222222]">
            Portfolio Revenue Totals Separated by Currency
          </div>
          <div className="mt-2.5 flex flex-wrap gap-3">
            {portfolioRevenue.buckets.map((b) => (
              <div
                key={b.currency}
                className="flex items-center gap-3 rounded-xl border border-[#EBEBEB] bg-[#F7F7F7] px-3.5 py-2 font-display tabular-nums"
              >
                <span className="font-bold text-[#222222]">{b.currency}</span>
                <span className="font-semibold text-[#FF385C]">
                  Est. {b.formattedEstimatedOpen}
                </span>
                <span className="text-[#DDDDDD]">|</span>
                <span className="font-semibold text-[#008A05]">
                  Recovered {b.formattedActualRecovered}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5 Summary KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border border-[#EBEBEB] bg-white p-5">
          <div className="text-xs font-medium text-[#717171]">Detected Empty Nights</div>
          <div className="mt-2 font-display text-2xl font-bold text-[#222222] tabular-nums">
            {detectedEmptyNights}
          </div>
        </div>

        <div className="rounded-2xl border border-[#EBEBEB] bg-white p-5">
          <div className="text-xs font-medium text-[#717171]">Estimated Gross Opportunity</div>
          <div className="mt-2 font-display text-2xl font-bold text-[#FF385C] tabular-nums">
            {formatMetricVal(portfolioRevenue.totalEstimatedOpenNominal)}
          </div>
        </div>

        <div className="rounded-2xl border border-[#EBEBEB] bg-white p-5">
          <div className="text-xs font-medium text-[#717171]">Actioned + Filled Gaps</div>
          <div className="mt-2 font-display text-2xl font-bold text-[#222222] tabular-nums">
            {funnel.actionedCount + funnel.filledCount}
          </div>
        </div>

        <div className="rounded-2xl border border-[#EBEBEB] bg-white p-5">
          <div className="text-xs font-medium text-[#717171]">Filled Opportunities</div>
          <div className="mt-2 font-display text-2xl font-bold text-[#008A05] tabular-nums">
            {funnel.filledCount}
          </div>
        </div>

        <div className="rounded-2xl border border-[#EBEBEB] bg-white p-5">
          <div className="text-xs font-medium text-[#717171]">Actual Recovered Revenue</div>
          <div className="mt-2 font-display text-2xl font-bold text-[#008A05] tabular-nums">
            {formatMetricVal(portfolioRevenue.totalActualRecoveredNominal)}
          </div>
        </div>
      </div>

      {/* Host Action Conversion Funnel & Estimate Accuracy Strip */}
      <div className="rounded-2xl border border-[#EBEBEB] bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EBEBEB] pb-4">
          <div>
            <h3 className="font-display text-base font-bold text-[#222222]">
              Host Action Funnel &amp; Recovery Conversion
            </h3>
            <p className="text-xs text-[#717171]">
              Tracks progression from gap detection through host outreach to confirmed recovered
              revenue
            </p>
          </div>
          <div className="font-display text-xs font-semibold text-[#717171] tabular-nums">
            {funnel.totalActionsLogged} logged host actions
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-[#EBEBEB] bg-[#F7F7F7] p-3.5">
            <div className="text-[11px] font-medium text-[#717171]">1. Detected</div>
            <div className="mt-1 font-display text-lg font-bold text-[#222222] tabular-nums">
              {funnel.totalDetected}
            </div>
            <div className="text-[11px] text-[#717171]">{funnel.newCount} untouched new</div>
          </div>

          <div className="rounded-xl border border-[#EBEBEB] bg-[#F7F7F7] p-3.5">
            <div className="text-[11px] font-medium text-[#717171]">2. Engaged / Viewed</div>
            <div className="mt-1 font-display text-lg font-bold text-[#222222] tabular-nums">
              {funnel.engagedCount}
            </div>
            <div className="text-[11px] text-[#717171]">
              {funnel.engagementRatePct}% review rate
            </div>
          </div>

          <div className="rounded-xl border border-[#EBEBEB] bg-[#FFF1F3] p-3.5">
            <div className="text-[11px] font-medium text-[#E00B41]">3. Outreach Actioned</div>
            <div className="mt-1 font-display text-lg font-bold text-[#FF385C] tabular-nums">
              {funnel.actionedCount + funnel.filledCount}
            </div>
            <div className="text-[11px] text-[#717171]">Active or converted</div>
          </div>

          <div className="rounded-xl border border-[#B7DFBA] bg-[#EBF7EC] p-3.5">
            <div className="text-[11px] font-medium text-[#006B04]">4. Confirmed Filled</div>
            <div className="mt-1 font-display text-lg font-bold text-[#008A05] tabular-nums">
              {funnel.filledCount}
            </div>
            <div className="text-[11px] text-[#008A05]">
              {funnel.actionToFillRatePct}% fill rate of actioned
            </div>
          </div>

          <div className="rounded-xl border border-[#EBEBEB] bg-[#F7F7F7] p-3.5">
            <div className="text-[11px] font-medium text-[#717171]">Filled Est. Baseline</div>
            <div className="mt-1 font-display text-lg font-bold text-[#222222] tabular-nums">
              {formatMetricVal(funnel.filledSuggestedBaseline)}
            </div>
            <div className="text-[11px] text-[#717171]">Before booking</div>
          </div>

          <div className="rounded-xl border border-[#EBEBEB] bg-[#F7F7F7] p-3.5">
            <div className="text-[11px] font-medium text-[#717171]">Actual vs. Estimate</div>
            <div
              className={`mt-1 font-display text-lg font-bold tabular-nums ${
                funnel.filledVarianceNominal >= 0 ? 'text-[#008A05]' : 'text-[#C13515]'
              }`}
            >
              {funnel.filledVarianceNominal >= 0 ? '+' : '-'}
              {formatMetricVal(Math.abs(funnel.filledVarianceNominal))}
            </div>
            <div className="text-[11px] text-[#717171]">On confirmed fills</div>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Revenue by Property */}
        <div className="rounded-2xl border border-[#EBEBEB] bg-white p-6">
          <h3 className="font-display text-base font-bold text-[#222222]">
            Revenue Recovery vs. Open Opportunity by Listing
          </h3>
          <p className="text-xs text-[#717171]">
            Comparison of open suggested gross vs. confirmed recovered bookings
          </p>

          <div className="mt-5 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={propertyBreakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EBEBEB" vertical={false} />
                <XAxis
                  dataKey="shortLabel"
                  tick={{ fontSize: 11, fill: '#717171' }}
                  axisLine={{ stroke: '#DDDDDD' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#717171' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}`}
                />
                <Tooltip
                  formatter={(value: unknown, name: unknown) => [
                    Number(value).toLocaleString(),
                    String(name),
                  ]}
                  contentStyle={{
                    borderRadius: '12px',
                    borderColor: '#EBEBEB',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar
                  dataKey="estimatedOpportunity"
                  name="Estimated Open Opportunity"
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
        </div>

        {/* Monthly Trend */}
        <div className="rounded-2xl border border-[#EBEBEB] bg-white p-6">
          <h3 className="font-display text-base font-bold text-[#222222]">
            Monthly Gap Opportunity &amp; Recovery Horizon
          </h3>
          <p className="text-xs text-[#717171]">
            Aggregated chronologically by orphan-gap start month
          </p>

          <div className="mt-5 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EBEBEB" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: '#717171' }}
                  axisLine={{ stroke: '#DDDDDD' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#717171' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}`}
                />
                <Tooltip
                  formatter={(value: unknown, name: unknown) => [
                    Number(value).toLocaleString(),
                    String(name),
                  ]}
                  contentStyle={{
                    borderRadius: '12px',
                    borderColor: '#EBEBEB',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar
                  dataKey="estimatedOpportunity"
                  name="Estimated Open Opportunity"
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
        </div>
      </div>

      {/* Property-Level Financial Ledger Table */}
      <div className="rounded-2xl border border-[#EBEBEB] bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-display text-base font-bold text-[#222222]">
              Listing-Level Opportunity &amp; Recovery Ledger
            </h3>
            <p className="text-xs text-[#717171]">
              Each listing rendered in its own configured currency
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[#EBEBEB]">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#EBEBEB] bg-[#F7F7F7] text-[11px] font-semibold text-[#717171]">
              <tr>
                <th className="px-4 py-3">Listing</th>
                <th className="px-4 py-3">Currency</th>
                <th className="px-4 py-3">Empty Nights</th>
                <th className="px-4 py-3">Open Gaps</th>
                <th className="px-4 py-3">Estimated Gross Opportunity</th>
                <th className="px-4 py-3">Filled Gaps</th>
                <th className="px-4 py-3 text-right">Actual Recovered Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EBEBEB]">
              {propertyBreakdown.map((row) => (
                <tr key={row.propertyId} className="hover:bg-[#F7F7F7]/60">
                  <td className="px-4 py-3 font-medium text-[#222222]">{row.name}</td>
                  <td className="px-4 py-3 font-display font-medium text-[#717171]">
                    {row.currency}
                  </td>
                  <td className="px-4 py-3 font-display font-medium text-[#222222] tabular-nums">
                    {row.emptyNights}n
                  </td>
                  <td className="px-4 py-3 font-display font-medium text-[#222222] tabular-nums">
                    {row.openGapCount}
                  </td>
                  <td className="px-4 py-3 font-display font-bold text-[#FF385C] tabular-nums">
                    {row.formattedEstimated}
                  </td>
                  <td className="px-4 py-3 font-display font-medium text-[#222222] tabular-nums">
                    {row.filledGapCount}
                  </td>
                  <td className="px-4 py-3 text-right font-display font-bold text-[#008A05] tabular-nums">
                    {row.formattedRecovered}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
