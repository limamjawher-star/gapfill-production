'use client';

import React, { useState } from 'react';
import {
  GapOpportunity,
  NavigationPageId,
  Property,
  Reservation,
} from '../types/gapfill';
import { analyzePropertyOccupancyAndGaps } from '../features/gaps/gapDetectionEngine';
import { formatPropertyCurrency } from '../features/properties/propertyValidation';
import { buildCalendarHorizonWindow } from '../features/opportunities/opportunityWorkflow';
import { diffCalendarNights, getTodayIsoDateInTimezone } from '../utils/engines';
import { PropertyThumbnail } from '../components/PropertyThumbnail';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Calendar as CalendarIcon,
  CheckCircle2,
  Info,
  Layers,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';

interface CalendarViewProps {
  properties: Property[];
  reservations: Reservation[];
  opportunities: GapOpportunity[];
  anchorDateStr?: string;
  onSelectOpportunity: (opportunityId: string) => void;
  onNavigate: (page: NavigationPageId) => void;
}

interface SelectedCalendarCell {
  propertyId: string;
  dateStr: string;
}

export function CalendarView({
  properties,
  reservations,
  opportunities,
  anchorDateStr,
  onSelectOpportunity,
  onNavigate,
}: CalendarViewProps) {
  const resolvedAnchorDate =
    anchorDateStr ??
    getTodayIsoDateInTimezone(properties[0]?.timezone || 'UTC');

  const [selectedPropertyFilter, setSelectedPropertyFilter] = useState<string>('all');
  const [showPairAudit, setShowPairAudit] = useState<boolean>(true);
  const [offsetDays, setOffsetDays] = useState<number>(0);
  const [windowLengthDays, setWindowLengthDays] = useState<14 | 28 | 42>(28);
  const [selectedCell, setSelectedCell] = useState<SelectedCalendarCell | null>(() =>
    properties[0]?.id
      ? {
          propertyId: properties[0].id,
          dateStr: resolvedAnchorDate,
        }
      : null
  );

  const horizonWindow = buildCalendarHorizonWindow({
    anchorDateStr: resolvedAnchorDate,
    offsetDays,
    windowLengthDays,
  });

  const filteredProperties =
    selectedPropertyFilter === 'all'
      ? properties
      : properties.filter((p) => p.id === selectedPropertyFilter);

  const getNightState = (propertyId: string, dateStr: string) => {
    const booking = reservations.find(
      (r) =>
        r.propertyId === propertyId &&
        r.status === 'confirmed' &&
        dateStr >= r.checkInDate &&
        dateStr < r.checkOutDate
    );
    if (booking) {
      return { type: 'booked' as const, booking };
    }

    const gap = opportunities.find(
      (o) =>
        o.propertyId === propertyId &&
        o.status !== 'dismissed' &&
        dateStr >= o.gapStartDate &&
        dateStr < o.gapEndDate
    );
    if (gap) {
      return { type: 'gap' as const, gap };
    }

    const cancelled = reservations.find(
      (r) =>
        r.propertyId === propertyId &&
        (r.status === 'canceled' || r.status === 'cancelled') &&
        dateStr >= r.checkInDate &&
        dateStr < r.checkOutDate
    );
    if (cancelled) {
      return { type: 'cancelled' as const, cancelled };
    }

    return { type: 'open' as const };
  };

  const formatMonthShort = (dateStr: string) => {
    const month = dateStr.slice(5, 7);
    const map: Record<string, string> = {
      '01': 'Jan',
      '02': 'Feb',
      '03': 'Mar',
      '04': 'Apr',
      '05': 'May',
      '06': 'Jun',
      '07': 'Jul',
      '08': 'Aug',
      '09': 'Sep',
      '10': 'Oct',
      '11': 'Nov',
      '12': 'Dec',
    };
    return map[month] ?? month;
  };

  return (
    <div className="space-y-6">
      {/* Header & Horizon Controls */}
      <div className="space-y-4 rounded-2xl border border-[#EBEBEB] bg-white px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-[#222222]">
              Multi-Listing Occupancy &amp; Gap Calendar
            </h1>
            <p className="mt-1 text-sm text-[#717171]">
              Check-in nights are occupied; checkout mornings open turnover windows. Click any
              calendar tile to inspect stay dates or orphan pricing.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setShowPairAudit((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                showPairAudit
                  ? 'border-[#222222] bg-[#222222] text-white'
                  : 'border-[#DDDDDD] bg-white text-[#222222] hover:bg-[#F7F7F7]'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>
                {showPairAudit ? 'Hide Turnover Pair Breakdown' : 'Show Turnover Pair Breakdown'}
              </span>
            </button>

            <div className="flex items-center gap-2">
              <label htmlFor="cal-prop-filter" className="text-xs font-semibold text-[#717171]">
                Listing:
              </label>
              <select
                id="cal-prop-filter"
                value={selectedPropertyFilter}
                onChange={(e) => setSelectedPropertyFilter(e.target.value)}
                className="rounded-lg border border-[#DDDDDD] bg-white px-3 py-2 text-xs text-[#222222] focus:border-[#222222] focus:outline-hidden"
              >
                <option value="all">All Listings ({properties.length})</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.timezone})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Date Stepper & Window Length */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EBEBEB] pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setOffsetDays((d) => d - 14)}
              className="inline-flex items-center gap-1 rounded-lg border border-[#DDDDDD] bg-white px-3 py-1.5 text-xs font-medium text-[#222222] hover:bg-[#F7F7F7]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Prev 14d</span>
            </button>
            <button
              type="button"
              onClick={() => setOffsetDays(0)}
              disabled={offsetDays === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-[#DDDDDD] bg-white px-3 py-1.5 text-xs font-medium text-[#222222] hover:bg-[#F7F7F7] disabled:opacity-50"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Today ({resolvedAnchorDate})</span>
            </button>
            <button
              type="button"
              onClick={() => setOffsetDays((d) => d + 14)}
              className="inline-flex items-center gap-1 rounded-lg border border-[#DDDDDD] bg-white px-3 py-1.5 text-xs font-medium text-[#222222] hover:bg-[#F7F7F7]"
            >
              <span>Next 14d</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>

            <span className="ml-2 text-xs font-semibold text-[#222222] tabular-nums">
              {horizonWindow.startDateStr} → {horizonWindow.endDateStr} ({windowLengthDays} nights)
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[#717171]">Horizon Window:</span>
            {([14, 28, 42] as const).map((len) => (
              <button
                key={len}
                type="button"
                onClick={() => setWindowLengthDays(len)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors tabular-nums ${
                  windowLengthDays === len
                    ? 'border-[#222222] bg-[#222222] text-white'
                    : 'border-[#DDDDDD] bg-white text-[#222222] hover:bg-[#F7F7F7]'
                }`}
              >
                {len}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Selected Night Inspector */}
      {selectedCell &&
        (() => {
          const prop = properties.find((p) => p.id === selectedCell.propertyId);
          if (!prop) return null;
          const cellState = getNightState(prop.id, selectedCell.dateStr);

          return (
            <div className="rounded-2xl border border-[#DDDDDD] bg-[#F7F7F7] p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-[#FF385C]">
                      Selected Night Inspector
                    </span>
                    <span className="text-[#DDDDDD]">·</span>
                    <span className="font-semibold text-[#222222]">{prop.name}</span>
                    <span className="text-[#DDDDDD]">·</span>
                    <span className="font-medium text-[#222222] tabular-nums">
                      Night of {selectedCell.dateStr} ({prop.timezone})
                    </span>
                  </div>

                  {cellState.type === 'gap' && (
                    <div className="text-xs text-[#222222]">
                      <strong>Actionable Orphan Gap:</strong>{' '}
                      <span className="tabular-nums">
                        {cellState.gap.gapStartDate} → {cellState.gap.gapEndDate} (
                        {cellState.gap.emptyNights} nights)
                      </span>{' '}
                      · Suggested Rate:{' '}
                      <strong className="tabular-nums">
                        {formatPropertyCurrency(
                          cellState.gap.financials.suggestedNightlyRate,
                          prop.currency
                        )}
                        /nt (-{cellState.gap.financials.recommendedDiscountPercent}%)
                      </strong>{' '}
                      · Estimated Gross:{' '}
                      <strong className="text-[#FF385C] tabular-nums">
                        {formatPropertyCurrency(
                          cellState.gap.financials.suggestedGross,
                          prop.currency
                        )}
                      </strong>{' '}
                      · Priority:{' '}
                      <strong>
                        {cellState.gap.priority.totalScore}/100 ({cellState.gap.priority.label})
                      </strong>
                    </div>
                  )}

                  {cellState.type === 'booked' && (
                    <div className="text-xs text-[#222222]">
                      <strong>Confirmed Stay:</strong> <span>{cellState.booking.summaryLabel}</span>{' '}
                      · Check-In:{' '}
                      <span className="font-semibold tabular-nums">
                        {cellState.booking.checkInDate}
                      </span>{' '}
                      → Checkout:{' '}
                      <span className="font-semibold tabular-nums">
                        {cellState.booking.checkOutDate}
                      </span>{' '}
                      (
                      {diffCalendarNights(
                        cellState.booking.checkInDate,
                        cellState.booking.checkOutDate
                      )}{' '}
                      nights) · Ref:{' '}
                      <span className="font-mono text-[11px] text-[#717171]">
                        {cellState.booking.sourceUid}
                      </span>
                    </div>
                  )}

                  {cellState.type === 'open' && (
                    <div className="text-xs text-[#717171]">
                      Open unbracketed date outside consecutive confirmed stays.
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {cellState.type === 'gap' && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectOpportunity(cellState.gap.id);
                          onNavigate('opportunities');
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#FF385C] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#E00B41]"
                      >
                        <span>Open in Opportunities</span>
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectOpportunity(cellState.gap.id);
                          onNavigate('strategy');
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#DDDDDD] bg-white px-3.5 py-2 text-xs font-semibold text-[#222222] hover:bg-[#F7F7F7]"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-[#FF385C]" />
                        <span>AI Strategy</span>
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedCell(null)}
                    aria-label="Close night inspector"
                    className="rounded-full p-1.5 text-[#717171] hover:bg-white hover:text-[#222222]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* Clean Legend */}
      <div className="flex flex-wrap items-center gap-6 rounded-2xl border border-[#EBEBEB] bg-white px-6 py-3.5 text-xs text-[#717171]">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-xs bg-[#222222]" />
          <span>Confirmed Booking</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-xs bg-[#FF385C]" />
          <span>Actionable Orphan Gap</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-xs bg-[#008A05]" />
          <span>Recovered / Filled Gap</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-xs border border-[#DDDDDD] bg-[#F7F7F7]" />
          <span>Open Unbracketed Date</span>
        </div>
      </div>

      {/* Multi-Listing Calendar Cards */}
      {filteredProperties.length === 0 ? (
        <div className="rounded-2xl border border-[#EBEBEB] bg-white p-10 text-center">
          <CalendarIcon className="mx-auto h-8 w-8 text-[#717171]" />
          <p className="mt-2 text-sm font-medium text-[#222222]">
            No listings available to display on the calendar.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredProperties.map((prop) => {
            const propGaps = opportunities.filter((o) => o.propertyId === prop.id);
            const analysisReport = analyzePropertyOccupancyAndGaps({
              property: prop,
              reservations,
              referenceDateStr: resolvedAnchorDate,
              hoursSinceLastSync: 1,
              existingOpportunities: opportunities,
            });

            return (
              <div
                key={prop.id}
                className="overflow-hidden rounded-2xl border border-[#EBEBEB] bg-white"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EBEBEB] bg-[#F7F7F7] px-6 py-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <PropertyThumbnail
                      propertyId={prop.id}
                      propertyName={prop.name}
                      propertyType={prop.propertyType}
                      size="sm"
                    />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-sm font-bold text-[#222222]">
                          {prop.name}
                        </span>
                        <span className="text-[#DDDDDD]">·</span>
                        <span className="text-xs text-[#717171]">{prop.timezone}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-[#717171]">
                        Min stay: {prop.minimumBookingLength} nights ·{' '}
                        {analysisReport.normalizedBlocks.length} confirmed stays
                        {analysisReport.ignoredCancelledCount > 0
                          ? ` (${analysisReport.ignoredCancelledCount} canceled ignored)`
                          : ''}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs font-medium text-[#222222] tabular-nums">
                    Base {formatPropertyCurrency(prop.defaultNightlyRate, prop.currency)}/nt ·
                    Floor{' '}
                    {formatPropertyCurrency(prop.minimumAcceptableNightlyPrice, prop.currency)}/nt
                  </div>
                </div>

                {/* Horizon Day Grid */}
                <div className="p-6">
                  <div className="grid grid-cols-7 gap-2 sm:grid-cols-14">
                    {horizonWindow.daysList.map((dateStr) => {
                      const state = getNightState(prop.id, dateStr);
                      const dayNum = dateStr.slice(8, 10);
                      const monthLabel = formatMonthShort(dateStr);
                      const isCellSelected =
                        selectedCell?.propertyId === prop.id &&
                        selectedCell?.dateStr === dateStr;

                      if (state.type === 'booked') {
                        return (
                          <button
                            key={dateStr}
                            type="button"
                            onClick={() =>
                              setSelectedCell({ propertyId: prop.id, dateStr })
                            }
                            title={`${dateStr}: Booked (${state.booking.checkInDate} → ${state.booking.checkOutDate})`}
                            className={`flex flex-col justify-between rounded-xl bg-[#222222] p-2.5 text-left text-white transition-transform hover:scale-[1.02] ${
                              isCellSelected ? 'ring-2 ring-[#FF385C] ring-offset-1' : ''
                            }`}
                          >
                            <span className="text-[10px] text-white/75 tabular-nums">
                              {monthLabel} {dayNum}
                            </span>
                            <span className="mt-2 truncate text-[10px] font-semibold">
                              Booked
                            </span>
                          </button>
                        );
                      }

                      if (state.type === 'gap') {
                        const isFilled = state.gap.status === 'filled';
                        return (
                          <button
                            key={dateStr}
                            type="button"
                            onClick={() => {
                              setSelectedCell({ propertyId: prop.id, dateStr });
                              onSelectOpportunity(state.gap.id);
                            }}
                            title={`Orphan Gap (${state.gap.gapStartDate} → ${state.gap.gapEndDate}): Click to inspect`}
                            className={`flex flex-col justify-between rounded-xl p-2.5 text-left text-white transition-transform hover:scale-[1.03] ${
                              isFilled ? 'bg-[#008A05]' : 'bg-[#FF385C]'
                            } ${isCellSelected ? 'ring-2 ring-[#222222] ring-offset-1' : ''}`}
                          >
                            <span className="text-[10px] font-medium text-white/90 tabular-nums">
                              {monthLabel} {dayNum}
                            </span>
                            <span className="mt-2 truncate font-display text-[11px] font-bold tabular-nums">
                              {isFilled
                                ? 'Filled'
                                : formatPropertyCurrency(
                                    state.gap.financials.suggestedNightlyRate,
                                    prop.currency
                                  )}
                            </span>
                          </button>
                        );
                      }

                      return (
                        <button
                          key={dateStr}
                          type="button"
                          onClick={() =>
                            setSelectedCell({ propertyId: prop.id, dateStr })
                          }
                          className={`flex flex-col justify-between rounded-xl border border-[#EBEBEB] bg-[#F7F7F7] p-2.5 text-left text-[#717171] hover:border-[#B0B0B0] ${
                            isCellSelected ? 'ring-2 ring-[#222222] ring-offset-1' : ''
                          }`}
                        >
                          <span className="text-[10px] tabular-nums">
                            {monthLabel} {dayNum}
                          </span>
                          <span className="mt-2 text-[10px]">Open</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Turnover Pair Table */}
                  {showPairAudit && analysisReport.pairEvaluations.length > 0 && (
                    <div className="mt-6 border-t border-[#EBEBEB] pt-4">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-xs font-semibold text-[#222222]">
                          Consecutive-Booking Turnover Breakdown
                        </span>
                        <span className="text-xs text-[#717171]">
                          Horizon: {prop.analysisHorizonDays}d · Min Stay:{' '}
                          {prop.minimumBookingLength}n
                        </span>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-[#EBEBEB]">
                        <table className="w-full text-left text-xs">
                          <thead className="border-b border-[#EBEBEB] bg-[#F7F7F7] text-[11px] font-semibold text-[#717171]">
                            <tr>
                              <th className="px-4 py-2.5">Prev Checkout</th>
                              <th className="px-4 py-2.5">Next Check-In</th>
                              <th className="px-4 py-2.5">Empty Nights</th>
                              <th className="px-4 py-2.5">Status</th>
                              <th className="px-4 py-2.5">Min-Stay Check</th>
                              <th className="px-4 py-2.5 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#EBEBEB]">
                            {analysisReport.pairEvaluations.map((pair, idx) => (
                              <tr key={`${pair.previousCheckOutDate}_${idx}`}>
                                <td className="px-4 py-2.5 font-medium text-[#222222] tabular-nums">
                                  {pair.previousCheckOutDate}
                                </td>
                                <td className="px-4 py-2.5 font-medium text-[#222222] tabular-nums">
                                  {pair.nextCheckInDate}
                                </td>
                                <td className="px-4 py-2.5 font-semibold text-[#222222] tabular-nums">
                                  {pair.emptyNights}n
                                </td>
                                <td className="px-4 py-2.5">
                                  {pair.classification === 'orphan_gap_detected' ? (
                                    <span className="font-semibold text-[#FF385C]">
                                      Orphan Gap Detected
                                    </span>
                                  ) : pair.classification === 'back_to_back_turnover' ? (
                                    <span className="text-[#717171]">Same-Day Turnover</span>
                                  ) : (
                                    <span className="text-[#717171]">{pair.classification}</span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5">
                                  {pair.emptyNights === 0 ? (
                                    <span className="text-[#717171]">N/A</span>
                                  ) : pair.isMinStayCompatible ? (
                                    <span className="inline-flex items-center gap-1 font-medium text-[#008A05]">
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                      <span>Bookable ({prop.minimumBookingLength}n min)</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 font-medium text-[#B45309]">
                                      <ShieldAlert className="h-3.5 w-3.5" />
                                      <span>Blocked ({prop.minimumBookingLength}n min)</span>
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-right">
                                  {pair.opportunityId ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (pair.opportunityId) {
                                          onSelectOpportunity(pair.opportunityId);
                                          onNavigate('opportunities');
                                        }
                                      }}
                                      className="inline-flex items-center gap-1 font-semibold text-[#222222] underline hover:text-[#FF385C] whitespace-nowrap"
                                    >
                                      <span>Inspect Gap</span>
                                      <ArrowUpRight className="h-3 w-3" />
                                    </button>
                                  ) : (
                                    <span className="text-[#717171]">—</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {propGaps.length > 0 && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#EBEBEB] pt-3 text-xs text-[#717171]">
                      <div className="flex items-center gap-1.5">
                        <Info className="h-3.5 w-3.5 text-[#FF385C]" />
                        <span>
                          Detected {propGaps.length} consecutive-booking gap windows on this listing.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onNavigate('opportunities')}
                        className="inline-flex items-center gap-1 font-semibold text-[#222222] underline hover:text-[#FF385C]"
                      >
                        <span>Open in Opportunities</span>
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
