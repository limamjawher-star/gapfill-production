'use client';

import React, { useState } from 'react';
import {
  GapOpportunity,
  NavigationPageId,
  OpportunityStatus,
  Property,
  Reservation,
} from '../types/gapfill';
import {
  getPriorityComponentBreakdownList,
  simulateCustomGapPricing,
} from '../features/financials/financialAndPriorityEngine';
import {
  filterAndSortOpportunities,
  MinStayFilterMode,
  OpportunitySortMode,
  resolveBracketedReservations,
} from '../features/opportunities/opportunityWorkflow';
import {
  buildAirbnbHostOutreachDraft,
  HostOutreachTarget,
  sanitizeEditableDraft,
} from '../features/messaging/hostMessageHelpers';
import { formatPropertyCurrency } from '../features/properties/propertyValidation';
import { diffCalendarNights } from '../utils/engines';
import { PropertyThumbnail } from '../components/PropertyThumbnail';
import {
  AlertCircle,
  ArrowRightLeft,
  ArrowUpRight,
  Calendar as CalendarIcon,
  CheckCircle2,
  Copy,
  Filter,
  MessageSquare,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';

interface OpportunitiesViewProps {
  properties: Property[];
  reservations: Reservation[];
  opportunities: GapOpportunity[];
  selectedOpportunityId: string | null;
  onSelectOpportunity: (id: string | null) => void;
  onUpdateOpportunityStatus: (
    opportunityId: string,
    status: OpportunityStatus,
    actualRecoveredRevenue?: number
  ) => void;
  onLogCopyAction: (opportunityId: string, label: string) => void;
  onNavigate: (page: NavigationPageId) => void;
}

export function OpportunitiesView({
  properties,
  reservations,
  opportunities,
  selectedOpportunityId,
  onSelectOpportunity,
  onUpdateOpportunityStatus,
  onLogCopyAction,
  onNavigate,
}: OpportunitiesViewProps) {
  const [propertyFilter, setPropertyFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [minStayMode, setMinStayMode] = useState<MinStayFilterMode>('all');
  const [sortBy, setSortBy] = useState<OpportunitySortMode>('score');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [customDiscountsByOppId, setCustomDiscountsByOppId] = useState<
    Record<string, number>
  >({});

  // Host Outreach Message Customizer State
  const [outreachTarget, setOutreachTarget] =
    useState<HostOutreachTarget>('departing_extension');
  const [customDraftsByKey, setCustomDraftsByKey] = useState<Record<string, string>>({});

  const [fillModalOpp, setFillModalOpp] = useState<GapOpportunity | null>(null);
  const [actualRevenueInput, setActualRevenueInput] = useState<string>('');
  const [fillError, setFillError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = filterAndSortOpportunities({
    opportunities,
    properties,
    criteria: {
      propertyId: propertyFilter,
      priorityLabel: priorityFilter,
      status: statusFilter,
      minStayMode,
      searchQuery,
      sortBy,
    },
  });

  const selectedOpp =
    opportunities.find((o) => o.id === selectedOpportunityId) ??
    filtered[0] ??
    opportunities[0] ??
    null;


  const handleOpenFillModal = (opp: GapOpportunity) => {
    setFillModalOpp(opp);
    setActualRevenueInput(
      String(opp.actualRecoveredRevenue ?? opp.financials.suggestedGross)
    );
    setFillError(null);
  };

  const handleConfirmFilled = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fillModalOpp) return;
    const val = Number(actualRevenueInput);
    if (!Number.isFinite(val) || val <= 0 || val > 100000) {
      setFillError('Please enter a valid positive booking revenue amount.');
      return;
    }
    onUpdateOpportunityStatus(fillModalOpp.id, 'filled', Math.round(val * 100) / 100);
    setFillModalOpp(null);
  };

  const handleCopyGuestMessage = async (
    opp: GapOpportunity,
    messageText: string,
    rateLabel: string
  ) => {
    const cleaned = sanitizeEditableDraft(messageText);
    try {
      await navigator.clipboard.writeText(cleaned);
    } catch {
      // Clipboard fallback in headless context
    }
    setCopiedId(opp.id);
    onLogCopyAction(
      opp.id,
      `Copied Airbnb host guest message (${rateLabel}) to clipboard`
    );
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Page Heading */}
      <div>
        <h1 className="font-display text-2xl font-bold text-[#222222]">
          Empty-Night Opportunities
        </h1>
        <p className="mt-1 text-sm text-[#717171]">
          Inspect orphan windows between reservations, test custom floor-protected pricing, and
          personalize messages for departing or arriving Airbnb guests.
        </p>
      </div>

      {/* Filter & Sort Controls */}
      <div className="rounded-2xl border border-[#EBEBEB] bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-3 left-3.5 h-4 w-4 text-[#717171]" />
            <input
              type="text"
              aria-label="Search opportunities by property or date"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search listing, city, or date…"
              className="w-full rounded-lg border border-[#DDDDDD] py-2 pr-3 pl-9 text-xs text-[#222222] placeholder:text-[#717171] focus:border-[#222222] focus:outline-hidden"
            />
          </div>

          <select
            aria-label="Filter by property"
            value={propertyFilter}
            onChange={(e) => setPropertyFilter(e.target.value)}
            className="rounded-lg border border-[#DDDDDD] bg-white px-3 py-2 text-xs text-[#222222] focus:border-[#222222] focus:outline-hidden"
          >
            <option value="all">All Listings</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.currency})
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by priority"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="rounded-lg border border-[#DDDDDD] bg-white px-3 py-2 text-xs text-[#222222] focus:border-[#222222] focus:outline-hidden"
          >
            <option value="all">All Priority Levels</option>
            <option value="High priority">High priority</option>
            <option value="Medium priority">Medium priority</option>
            <option value="Low priority">Low priority</option>
          </select>

          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-[#DDDDDD] bg-white px-3 py-2 text-xs text-[#222222] focus:border-[#222222] focus:outline-hidden"
          >
            <option value="all">All Statuses</option>
            <option value="new">New</option>
            <option value="viewed">Viewed</option>
            <option value="actioned">Actioned</option>
            <option value="filled">Filled</option>
            <option value="expired">Expired</option>
            <option value="dismissed">Dismissed</option>
          </select>

          <select
            aria-label="Filter by minimum-stay compatibility"
            value={minStayMode}
            onChange={(e) => setMinStayMode(e.target.value as MinStayFilterMode)}
            className="rounded-lg border border-[#DDDDDD] bg-white px-3 py-2 text-xs text-[#222222] focus:border-[#222222] focus:outline-hidden"
          >
            <option value="all">All Min-Stay Rules</option>
            <option value="compatible_only">Bookable Now (Compatible)</option>
            <option value="blocked_only">Blocked by Min-Stay Rule</option>
          </select>

          <select
            aria-label="Sort opportunities"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as OpportunitySortMode)}
            className="rounded-lg border border-[#DDDDDD] bg-white px-3 py-2 text-xs text-[#222222] focus:border-[#222222] focus:outline-hidden"
          >
            <option value="score">Sort: Priority Score (High → Low)</option>
            <option value="urgency">Sort: Urgency (Soonest First)</option>
            <option value="gross">Sort: Estimated Gross Value</option>
            <option value="nights">Sort: Empty Nights (Longest First)</option>
          </select>
        </div>
      </div>

      {/* Main Split: Opportunity List (7 cols) + Opportunity Inspector (5 cols) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-7">
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-[#EBEBEB] bg-white p-10 text-center">
              <Filter className="mx-auto h-7 w-7 text-[#717171]" />
              <h3 className="mt-3 font-display text-sm font-bold text-[#222222]">
                No Matching Gap Opportunities
              </h3>
              <p className="mt-1 text-xs text-[#717171]">
                Adjust your listing, priority, status, or min-stay filters to view available
                orphan nights.
              </p>
            </div>
          ) : (
            filtered.map((opp) => {
              const prop = properties.find((p) => p.id === opp.propertyId);
              const currency = prop?.currency ?? 'USD';
              const isSelected = selectedOpp?.id === opp.id;

              return (
                <div
                  key={opp.id}
                  onClick={() => onSelectOpportunity(opp.id)}
                  className={`cursor-pointer rounded-2xl border bg-white p-5 transition-all ${
                    isSelected
                      ? 'border-[#222222] ring-1 ring-[#222222] shadow-[0_4px_14px_rgba(0,0,0,0.06)]'
                      : 'border-[#EBEBEB] hover:border-[#B0B0B0]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 flex-1 items-start gap-3.5">
                      <PropertyThumbnail
                        propertyId={opp.propertyId}
                        propertyName={prop?.name ?? 'Listing'}
                        propertyType={prop?.propertyType}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-display text-sm font-bold text-[#222222]">
                            {prop?.name ?? 'Listing'}
                          </span>
                          <span aria-hidden="true" className="text-[#DDDDDD]">
                            ·
                          </span>
                          <span
                            className={`font-semibold ${
                              opp.priority.label === 'High priority'
                                ? 'text-[#FF385C]'
                                : opp.priority.label === 'Medium priority'
                                ? 'text-[#B45309]'
                                : 'text-[#717171]'
                            }`}
                          >
                            {opp.priority.label} ({opp.priority.totalScore}/100)
                          </span>
                          <span aria-hidden="true" className="text-[#DDDDDD]">
                            ·
                          </span>
                          <span className="font-medium capitalize text-[#717171]">
                            Status: <span className="text-[#222222]">{opp.status}</span>
                          </span>
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[#717171]">
                          <span className="font-semibold text-[#222222] tabular-nums">
                            {opp.gapStartDate} → {opp.gapEndDate}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">
                            {opp.emptyNights} empty {opp.emptyNights === 1 ? 'night' : 'nights'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">In {opp.daysUntilStart} days</span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      {opp.status === 'filled' && opp.actualRecoveredRevenue !== null ? (
                        <div>
                          <div className="font-display text-base font-bold text-[#008A05] tabular-nums">
                            Recovered{' '}
                            {formatPropertyCurrency(opp.actualRecoveredRevenue, currency)}
                          </div>
                          <div className="text-xs text-[#717171] tabular-nums">
                            Est. was{' '}
                            {formatPropertyCurrency(opp.financials.suggestedGross, currency)}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="font-display text-base font-bold text-[#FF385C] tabular-nums">
                            Est.{' '}
                            {formatPropertyCurrency(opp.financials.suggestedGross, currency)}
                          </div>
                          <div className="text-xs text-[#717171] tabular-nums">
                            Orig. {formatPropertyCurrency(opp.financials.baseGross, currency)} (-
                            {opp.financials.recommendedDiscountPercent}%)
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Rate Breakdown Strip */}
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#EBEBEB] pt-3.5 text-xs sm:grid-cols-4">
                    <div>
                      <span className="text-[#717171]">Rack Rate:</span>{' '}
                      <strong className="font-semibold text-[#222222] tabular-nums">
                        {formatPropertyCurrency(opp.financials.baseNightlyRate, currency)}/nt
                      </strong>
                    </div>
                    <div>
                      <span className="text-[#717171]">Suggested:</span>{' '}
                      <strong className="font-semibold text-[#222222] tabular-nums">
                        {formatPropertyCurrency(opp.financials.suggestedNightlyRate, currency)}
                        /nt
                      </strong>
                    </div>
                    <div>
                      <span className="text-[#717171]">Discount:</span>{' '}
                      <strong className="font-semibold text-[#222222] tabular-nums">
                        {opp.financials.recommendedDiscountPercent}%
                      </strong>
                    </div>
                    <div>
                      <span className="text-[#717171]">Min Stay:</span>{' '}
                      <strong
                        className={
                          opp.isMinStayCompatible ? 'text-[#008A05]' : 'text-[#B45309]'
                        }
                      >
                        {opp.isMinStayCompatible
                          ? `Compatible (${opp.minStayRequired}n)`
                          : `Blocked (${opp.minStayRequired}n min)`}
                      </strong>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right 5 cols: Detailed Opportunity Inspector */}
        <div className="lg:col-span-5">
          {selectedOpp ? (
            <div className="sticky top-24 space-y-5 rounded-2xl border border-[#DDDDDD] bg-white p-6 shadow-[0_6px_20px_rgba(0,0,0,0.06)]">
              {(() => {
                const prop = properties.find((p) => p.id === selectedOpp.propertyId);
                const currency = prop?.currency ?? 'USD';
                const priorityComponents = getPriorityComponentBreakdownList(
                  selectedOpp.priority
                );
                const bracketed = resolveBracketedReservations({
                  opportunity: selectedOpp,
                  reservations,
                });

                const activeDiscountPct =
                  customDiscountsByOppId[selectedOpp.id] ??
                  selectedOpp.financials.recommendedDiscountPercent;

                const simulatedFinancials = simulateCustomGapPricing({
                  emptyNights: selectedOpp.emptyNights,
                  baseNightlyRate: selectedOpp.financials.baseNightlyRate,
                  requestedDiscountPercent: activeDiscountPct,
                  maximumAcceptableDiscount:
                    selectedOpp.financials.maxAllowedDiscountPercent,
                  minimumAcceptableRate: selectedOpp.financials.minimumAcceptableRate,
                });

                const draftKey = `${selectedOpp.id}_${outreachTarget}_${simulatedFinancials.suggestedNightlyRate}`;
                const generatedDraft = prop
                  ? buildAirbnbHostOutreachDraft({
                      target: outreachTarget,
                      property: prop,
                      opportunity: selectedOpp,
                      overrideNightlyRate: simulatedFinancials.suggestedNightlyRate,
                    })
                  : '';
                const currentDraftText =
                  customDraftsByKey[draftKey] ??
                  (outreachTarget === 'departing_extension' &&
                  selectedOpp.strategy?.guestExtensionMessage &&
                  customDiscountsByOppId[selectedOpp.id] === undefined
                    ? selectedOpp.strategy.guestExtensionMessage
                    : generatedDraft);

                const ratePerNightFormatted = formatPropertyCurrency(
                  simulatedFinancials.suggestedNightlyRate,
                  currency
                );

                return (
                  <>
                    <div className="border-b border-[#EBEBEB] pb-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[#FF385C]">
                          Opportunity Breakdown
                        </span>
                        <button
                          type="button"
                          onClick={() => onNavigate('calendar')}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#222222] underline hover:text-[#FF385C]"
                        >
                          <CalendarIcon className="h-3.5 w-3.5" />
                          <span>View on Calendar</span>
                        </button>
                      </div>
                      <h3 className="mt-1.5 font-display text-lg font-bold text-[#222222]">
                        {prop?.name} · {selectedOpp.gapStartDate} to {selectedOpp.gapEndDate}
                      </h3>
                      <p className="mt-1 text-xs text-[#717171]">
                        {selectedOpp.emptyNights} empty nights · Starts in{' '}
                        {selectedOpp.daysUntilStart} days · Currency:{' '}
                        <strong className="text-[#222222]">{currency}</strong> · Status:{' '}
                        <strong className="capitalize text-[#222222]">
                          {selectedOpp.status}
                        </strong>
                      </p>
                    </div>

                    {/* Adjacent Bookings Context */}
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-[#222222]">
                          <ArrowRightLeft className="h-3.5 w-3.5 text-[#FF385C]" />
                          <span>Adjacent Stays (Zero-Turnover Targets)</span>
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        <div className="rounded-xl border border-[#EBEBEB] bg-[#F7F7F7] p-3">
                          <div className="text-[11px] font-medium text-[#717171]">
                            Preceding Guest (Out {selectedOpp.gapStartDate})
                          </div>
                          {bracketed.departingReservation ? (
                            <>
                              <div className="mt-1 font-semibold text-[#222222]">
                                {bracketed.departingReservation.summaryLabel}
                              </div>
                              <div className="mt-0.5 text-[11px] text-[#717171] tabular-nums">
                                {bracketed.departingReservation.checkInDate} →{' '}
                                {bracketed.departingReservation.checkOutDate} (
                                {diffCalendarNights(
                                  bracketed.departingReservation.checkInDate,
                                  bracketed.departingReservation.checkOutDate
                                )}
                                n)
                              </div>
                              <div className="mt-1 text-[11px] font-medium text-[#008A05]">
                                Pitch +{selectedOpp.emptyNights}n stay extension
                              </div>
                            </>
                          ) : (
                            <div className="mt-1 text-[11px] text-[#717171]">
                              No adjacent departing stay found.
                            </div>
                          )}
                        </div>

                        <div className="rounded-xl border border-[#EBEBEB] bg-[#F7F7F7] p-3">
                          <div className="text-[11px] font-medium text-[#717171]">
                            Next Guest (In {selectedOpp.gapEndDate})
                          </div>
                          {bracketed.arrivingReservation ? (
                            <>
                              <div className="mt-1 font-semibold text-[#222222]">
                                {bracketed.arrivingReservation.summaryLabel}
                              </div>
                              <div className="mt-0.5 text-[11px] text-[#717171] tabular-nums">
                                {bracketed.arrivingReservation.checkInDate} →{' '}
                                {bracketed.arrivingReservation.checkOutDate} (
                                {diffCalendarNights(
                                  bracketed.arrivingReservation.checkInDate,
                                  bracketed.arrivingReservation.checkOutDate
                                )}
                                n)
                              </div>
                              <div className="mt-1 text-[11px] font-medium text-[#FF385C]">
                                Pitch +{selectedOpp.emptyNights}n early check-in
                              </div>
                            </>
                          ) : (
                            <div className="mt-1 text-[11px] text-[#717171]">
                              No adjacent arriving stay found.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Interactive Pricing & Floor-Price Simulator */}
                    <div className="space-y-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-[#222222]">
                          <SlidersHorizontal className="h-3.5 w-3.5 text-[#FF385C]" />
                          <span>Rate Floor &amp; Discount Simulator</span>
                        </span>
                        {customDiscountsByOppId[selectedOpp.id] !== undefined && (
                          <button
                            type="button"
                            onClick={() =>
                              setCustomDiscountsByOppId((prev) => {
                                const next = { ...prev };
                                delete next[selectedOpp.id];
                                return next;
                              })
                            }
                            className="font-semibold text-[#222222] underline hover:text-[#FF385C]"
                          >
                            Reset ({selectedOpp.financials.recommendedDiscountPercent}%)
                          </button>
                        )}
                      </div>

                      <div className="space-y-3 rounded-xl border border-[#EBEBEB] bg-[#F7F7F7] p-3.5">
                        <div>
                          <div className="flex items-center justify-between text-[11px] text-[#717171]">
                            <label htmlFor="opp-discount-slider">
                              Gap Discount (Cap:{' '}
                              {selectedOpp.financials.maxAllowedDiscountPercent}%)
                            </label>
                            <span className="font-semibold text-[#222222] tabular-nums">
                              {simulatedFinancials.recommendedDiscountPercent}% off rack rate
                            </span>
                          </div>
                          <input
                            id="opp-discount-slider"
                            type="range"
                            min={0}
                            max={selectedOpp.financials.maxAllowedDiscountPercent}
                            value={activeDiscountPct}
                            onChange={(e) =>
                              setCustomDiscountsByOppId((prev) => ({
                                ...prev,
                                [selectedOpp.id]: Number(e.target.value),
                              }))
                            }
                            className="mt-2 w-full accent-[#FF385C]"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2 border-t border-[#EBEBEB] pt-2.5 tabular-nums">
                          <div className="text-[#717171]">Original Gross:</div>
                          <div className="text-right text-[#222222]">
                            {selectedOpp.emptyNights} ×{' '}
                            {formatPropertyCurrency(
                              simulatedFinancials.baseNightlyRate,
                              currency
                            )}{' '}
                            = {formatPropertyCurrency(simulatedFinancials.baseGross, currency)}
                          </div>
                          <div className="text-[#717171]">Suggested Nightly:</div>
                          <div className="text-right font-semibold text-[#222222]">
                            {ratePerNightFormatted}/nt (-
                            {simulatedFinancials.recommendedDiscountPercent}%)
                          </div>
                          <div className="text-[#717171]">Suggested Gross:</div>
                          <div className="text-right font-display font-bold text-[#FF385C]">
                            {formatPropertyCurrency(simulatedFinancials.suggestedGross, currency)}
                          </div>
                          <div className="text-[#717171]">Host Floor Protection:</div>
                          <div
                            className={`text-right font-semibold ${
                              simulatedFinancials.floorPriceEnforced
                                ? 'text-[#008A05]'
                                : 'text-[#222222]'
                            }`}
                          >
                            {formatPropertyCurrency(
                              simulatedFinancials.minimumAcceptableRate,
                              currency
                            )}
                            /nt{' '}
                            {simulatedFinancials.floorPriceEnforced
                              ? '(Floor Enforced)'
                              : '(Protected)'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Editable Airbnb Guest Outreach Composer */}
                    <div className="space-y-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-[#222222]">
                          <MessageSquare className="h-3.5 w-3.5 text-[#FF385C]" />
                          <span>Airbnb Guest Message Composer</span>
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#F7F7F7] p-1">
                        {(
                          [
                            { id: 'departing_extension', label: 'Extend Stay' },
                            { id: 'arriving_early', label: 'Early Check-In' },
                            { id: 'direct_promo', label: 'Direct Promo' },
                          ] as { id: HostOutreachTarget; label: string }[]
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setOutreachTarget(opt.id)}
                            className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                              outreachTarget === opt.id
                                ? 'bg-white text-[#222222] shadow-xs'
                                : 'text-[#717171] hover:text-[#222222]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>

                      <textarea
                        aria-label="Editable guest outreach message"
                        rows={4}
                        value={currentDraftText}
                        onChange={(e) =>
                          setCustomDraftsByKey((prev) => ({
                            ...prev,
                            [draftKey]: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-[#DDDDDD] bg-white p-3 text-xs leading-relaxed text-[#222222] focus:border-[#222222] focus:outline-hidden"
                      />
                    </div>

                    {/* 5-Component Priority Score Breakdown */}
                    <details className="rounded-xl border border-[#EBEBEB] bg-[#F7F7F7] p-3 text-xs">
                      <summary className="flex cursor-pointer items-center justify-between font-semibold text-[#222222]">
                        <span>Priority Score Breakdown</span>
                        <span className="tabular-nums">
                          {selectedOpp.priority.totalScore} / 100 ({selectedOpp.priority.label})
                        </span>
                      </summary>
                      <div className="mt-3 space-y-2 border-t border-[#EBEBEB] pt-2.5">
                        {priorityComponents.map((comp) => {
                          const pct = Math.round(
                            (comp.earnedPoints / comp.maxPoints) * 100
                          );
                          return (
                            <div key={comp.id} className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-[#222222]">{comp.label}</span>
                                <span className="font-semibold text-[#222222] tabular-nums">
                                  +{comp.earnedPoints} / {comp.maxPoints} pts
                                </span>
                              </div>
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#EBEBEB]">
                                <div
                                  className="h-full rounded-full bg-[#FF385C]"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </details>

                    {/* Primary Host Action Controls */}
                    <div className="space-y-2.5 border-t border-[#EBEBEB] pt-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyGuestMessage(
                              selectedOpp,
                              currentDraftText,
                              `${ratePerNightFormatted}/nt`
                            )
                          }
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#222222] px-3.5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-black"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          <span>
                            {copiedId === selectedOpp.id
                              ? 'Copied Offer!'
                              : `Copy Message (${ratePerNightFormatted}/nt)`}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            onSelectOpportunity(selectedOpp.id);
                            onNavigate('strategy');
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDDDDD] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#222222] hover:bg-[#F7F7F7]"
                        >
                          <Sparkles className="h-3.5 w-3.5 text-[#FF385C]" />
                          <span>AI Pricing Center</span>
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-4">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateOpportunityStatus(selectedOpp.id, 'viewed')
                          }
                          className="rounded-lg border border-[#DDDDDD] bg-white px-2.5 py-2 text-xs font-medium text-[#222222] hover:bg-[#F7F7F7]"
                        >
                          Mark Viewed
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            onUpdateOpportunityStatus(selectedOpp.id, 'actioned')
                          }
                          className="rounded-lg border border-[#DDDDDD] bg-white px-2.5 py-2 text-xs font-medium text-[#222222] hover:bg-[#F7F7F7]"
                        >
                          Mark Actioned
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenFillModal(selectedOpp)}
                          className="rounded-lg bg-[#008A05] px-2.5 py-2 text-xs font-semibold text-white hover:bg-[#007004]"
                        >
                          Mark Filled…
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            onUpdateOpportunityStatus(selectedOpp.id, 'dismissed')
                          }
                          className="rounded-lg border border-[#DDDDDD] bg-white px-2.5 py-2 text-xs font-medium text-[#717171] hover:bg-[#F7F7F7] hover:text-[#222222]"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          ) : (
            <div className="rounded-2xl border border-[#EBEBEB] bg-white p-6 text-xs text-[#717171]">
              Select an opportunity card to inspect adjacent bookings, simulate discounts, and draft
              your Airbnb guest message.
            </div>
          )}
        </div>
      </div>

      {/* Confirm Recovered Revenue Modal */}
      {fillModalOpp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="fill-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-[#DDDDDD] bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 id="fill-modal-title" className="font-display text-base font-bold text-[#222222]">
                Confirm Recovered Airbnb Booking
              </h3>
              <button
                type="button"
                onClick={() => setFillModalOpp(null)}
                aria-label="Close recovered revenue modal"
                className="rounded-full p-1 text-[#717171] hover:bg-[#F7F7F7]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-[#717171]">
              Enter the confirmed booking subtotal for{' '}
              <strong className="text-[#222222]">
                {fillModalOpp.gapStartDate} → {fillModalOpp.gapEndDate}
              </strong>{' '}
              so your recovered earnings stay accurate.
            </p>

            <form onSubmit={handleConfirmFilled} className="mt-4 space-y-4" noValidate>
              {fillError && (
                <div className="flex items-center gap-2 rounded-xl border border-[#C13515]/30 bg-[#FFF8F6] p-3 text-xs text-[#C13515]">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{fillError}</span>
                </div>
              )}

              <div>
                <label
                  htmlFor="actual-recovered-input"
                  className="block text-xs font-semibold text-[#222222]"
                >
                  Confirmed Booking Gross (
                  {properties.find((p) => p.id === fillModalOpp.propertyId)?.currency ?? 'USD'})
                </label>
                <input
                  id="actual-recovered-input"
                  type="number"
                  step="0.01"
                  min="1"
                  value={actualRevenueInput}
                  onChange={(e) => setActualRevenueInput(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-[#B0B0B0] px-3.5 py-2.5 text-sm font-semibold text-[#222222] tabular-nums focus:border-[#222222] focus:outline-hidden"
                />
                <p className="mt-1 text-xs text-[#717171]">
                  Estimated baseline was{' '}
                  {formatPropertyCurrency(
                    fillModalOpp.financials.suggestedGross,
                    properties.find((p) => p.id === fillModalOpp.propertyId)?.currency ??
                      'USD'
                  )}
                  .
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setFillModalOpp(null)}
                  className="rounded-lg border border-[#DDDDDD] bg-white px-4 py-2 text-xs font-semibold text-[#222222] hover:bg-[#F7F7F7]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#008A05] px-4 py-2 text-xs font-semibold text-white hover:bg-[#007004]"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Confirm Recovered Booking</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
