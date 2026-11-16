'use client';

import React, { useState } from 'react';
import {
  CalendarConnection,
  CurrencyCode,
  GapOpportunity,
  NavigationPageId,
  Property,
  PropertyStatus,
  Reservation,
} from '../types/gapfill';
import {
  formatPropertyCurrency,
  formatTimestampInPropertyTimezone,
  SUPPORTED_CURRENCIES,
  SUPPORTED_IANA_TIMEZONES,
  validatePropertyInput,
} from '../features/properties/propertyValidation';
import { validateSafeIcalUrl } from '../../supabase/functions/sync-calendar/index';
import { PropertyThumbnail } from '../components/PropertyThumbnail';
import {
  AlertCircle,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Edit3,
  Eye,
  Globe,
  HelpCircle,
  Info,
  Link2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';

interface PropertiesViewProps {
  isDemoMode?: boolean;
  properties: Property[];
  calendars: CalendarConnection[];
  reservations?: Reservation[];
  opportunities?: GapOpportunity[];
  syncingPropertyId?: string | null;
  onSaveProperty: (property: Property, icalUrl?: string, sourceName?: string) => void;
  onDeleteProperty: (propertyId: string) => void;
  onTriggerSyncProperty: (
    propertyId: string,
    simulationMode?: 'standard' | 'with_cancellation' | 'malformed'
  ) => void;
  onSelectOpportunity?: (opportunityId: string) => void;
  onNavigate?: (page: NavigationPageId) => void;
}

export function PropertiesView({
  isDemoMode = false,
  properties,
  calendars,
  reservations = [],
  opportunities = [],
  syncingPropertyId = null,
  onSaveProperty,
  onDeleteProperty,
  onTriggerSyncProperty,
  onNavigate,
}: PropertiesViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PropertyStatus>('all');
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(
    properties[0]?.id ?? null
  );

  // Add / Edit Listing Modal
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Connect iCal Modal
  const [icalModalProperty, setIcalModalProperty] = useState<Property | null>(null);
  const [icalSourceName, setIcalSourceName] = useState('Airbnb Primary iCal Feed');
  const [icalModalUrl, setIcalModalUrl] = useState('');
  const [icalModalError, setIcalModalError] = useState<string | null>(null);

  // 11 Property Rule Fields
  const [name, setName] = useState('');
  const [propertyType, setPropertyType] = useState<Property['propertyType']>('Apartment');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [timezone, setTimezone] = useState('Europe/Paris');
  const [currency, setCurrency] = useState<CurrencyCode>('USD');
  const [defaultNightlyRate, setDefaultNightlyRate] = useState('220');
  const [minimumBookingLength, setMinimumBookingLength] = useState('2');
  const [minimumAcceptableNightlyPrice, setMinimumAcceptableNightlyPrice] = useState('165');
  const [maximumAcceptableDiscount, setMaximumAcceptableDiscount] = useState('20');
  const [analysisHorizonDays, setAnalysisHorizonDays] = useState('90');
  const [status, setStatus] = useState<PropertyStatus>('active');
  const [icalUrl, setIcalUrl] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const filteredProperties = properties.filter((prop) => {
    if (statusFilter !== 'all' && prop.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const hay = `${prop.name} ${prop.city} ${prop.country} ${prop.timezone} ${prop.currency}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const inspectedProperty =
    properties.find((p) => p.id === selectedPropertyId) ??
    filteredProperties[0] ??
    null;

  const openAddModal = () => {
    setEditingProperty(null);
    setName('');
    setPropertyType('Apartment');
    setCity('');
    setCountry('');
    setTimezone('Europe/Paris');
    setCurrency('USD');
    setDefaultNightlyRate('220');
    setMinimumBookingLength('2');
    setMinimumAcceptableNightlyPrice('165');
    setMaximumAcceptableDiscount('20');
    setAnalysisHorizonDays('90');
    setStatus('active');
    setIcalUrl('');
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditModal = (prop: Property) => {
    setEditingProperty(prop);
    setName(prop.name);
    setPropertyType(prop.propertyType);
    setCity(prop.city);
    setCountry(prop.country);
    setTimezone(prop.timezone);
    setCurrency(prop.currency);
    setDefaultNightlyRate(String(prop.defaultNightlyRate));
    setMinimumBookingLength(String(prop.minimumBookingLength));
    setMinimumAcceptableNightlyPrice(String(prop.minimumAcceptableNightlyPrice));
    setMaximumAcceptableDiscount(String(prop.maximumAcceptableDiscount));
    setAnalysisHorizonDays(String(prop.analysisHorizonDays));
    setStatus(prop.status);
    setIcalUrl('');
    setFormError(null);
    setIsFormOpen(true);
  };

  const openConnectIcalModal = (prop: Property) => {
    const existingCal = calendars.find((c) => c.propertyId === prop.id);
    setIcalModalProperty(prop);
    setIcalSourceName(existingCal?.sourceName ?? 'Airbnb Primary iCal Feed');
    setIcalModalUrl('');
    setIcalModalError(null);
  };

  const handleConfirmConnectIcal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!icalModalProperty) return;
    setIcalModalError(null);

    const trimmed = icalModalUrl.trim();
    if (!trimmed) {
      setIcalModalError('Please enter a private HTTPS iCal URL.');
      return;
    }

    const check = validateSafeIcalUrl(trimmed);
    if (!check.valid) {
      setIcalModalError(check.reason ?? 'Invalid HTTPS iCal URL.');
      return;
    }

    onSaveProperty(
      icalModalProperty,
      trimmed,
      icalSourceName.trim() || 'Airbnb Primary iCal Feed'
    );
    setIcalModalProperty(null);
  };

  const handleTogglePropertyStatus = (prop: Property) => {
    const nextStatus: PropertyStatus = prop.status === 'active' ? 'inactive' : 'active';
    onSaveProperty({ ...prop, status: nextStatus });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const validation = validatePropertyInput({
      name,
      propertyType,
      city,
      country,
      timezone,
      currency,
      defaultNightlyRate,
      minimumBookingLength,
      minimumAcceptableNightlyPrice,
      maximumAcceptableDiscount,
      analysisHorizonDays,
      status,
      icalUrl,
    });

    if (!validation.valid) {
      setFormError(validation.error ?? 'Invalid property settings.');
      return;
    }

    const updatedProperty: Property = {
      id: editingProperty?.id ?? `prop_${Date.now()}`,
      name: name.trim(),
      propertyType,
      city: city.trim(),
      country: country.trim(),
      timezone,
      currency,
      defaultNightlyRate: Math.round(Number(defaultNightlyRate)),
      minimumBookingLength: Math.round(Number(minimumBookingLength)),
      minimumAcceptableNightlyPrice: Math.round(Number(minimumAcceptableNightlyPrice)),
      maximumAcceptableDiscount: Math.round(Number(maximumAcceptableDiscount)),
      analysisHorizonDays: Math.round(Number(analysisHorizonDays)),
      status,
      createdAt: editingProperty?.createdAt ?? new Date().toISOString(),
    };

    onSaveProperty(updatedProperty, icalUrl.trim() || undefined);
    setSelectedPropertyId(updatedProperty.id);
    setIsFormOpen(false);
  };

  const livePreviewValidation = validatePropertyInput({
    name: name || 'Preview',
    propertyType,
    city: city || 'City',
    country: country || 'Country',
    timezone,
    currency,
    defaultNightlyRate,
    minimumBookingLength,
    minimumAcceptableNightlyPrice,
    maximumAcceptableDiscount,
    analysisHorizonDays,
    status,
  });

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#EBEBEB] pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#222222]">Your Listings</h1>
          <p className="mt-1 text-sm text-[#717171]">
            Configure each listing&apos;s timezone, currency, rate floor, and private Airbnb
            iCal link.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute top-2.5 left-3 h-3.5 w-3.5 text-[#717171]" />
            <input
              type="text"
              aria-label="Search properties"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search listing or city…"
              className="rounded-lg border border-[#DDDDDD] py-2 pr-3 pl-8 text-xs text-[#222222] placeholder:text-[#717171] focus:border-[#222222] focus:outline-hidden"
            />
          </div>

          <div className="flex items-center gap-1 rounded-xl bg-[#F7F7F7] p-1">
            {(['all', 'active', 'inactive'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors whitespace-nowrap ${
                  statusFilter === tab
                    ? 'bg-white text-[#222222] shadow-xs'
                    : 'text-[#717171] hover:text-[#222222]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#FF385C] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#E00B41] whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Property</span>
          </button>
        </div>
      </div>

      {filteredProperties.length === 0 ? (
        <div className="rounded-2xl border border-[#EBEBEB] bg-white p-10 text-center">
          <Building2 className="mx-auto h-8 w-8 text-[#717171]" />
          <h3 className="mt-3 font-display text-base font-bold text-[#222222]">
            No Listings Match Your Filter
          </h3>
          <p className="mx-auto mt-1 max-w-md text-xs text-[#717171]">
            Add a rental listing to configure its timezone, currency, nightly price floor, and
            private HTTPS iCal calendar link.
          </p>
          <button
            type="button"
            onClick={openAddModal}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#FF385C] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#E00B41]"
          >
            <Plus className="h-4 w-4" />
            <span>Add Property</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left 7 cols: Listing Cards */}
          <div className="space-y-4 lg:col-span-7">
            {filteredProperties.map((prop) => {
              const cal = calendars.find((c) => c.propertyId === prop.id);
              const isSelected = inspectedProperty?.id === prop.id;
              return (
                <div
                  key={prop.id}
                  onClick={() => setSelectedPropertyId(prop.id)}
                  className={`cursor-pointer rounded-2xl border bg-white p-5 transition-all ${
                    isSelected
                      ? 'border-[#222222] ring-1 ring-[#222222] shadow-[0_4px_14px_rgba(0,0,0,0.06)]'
                      : 'border-[#EBEBEB] hover:border-[#B0B0B0]'
                  }`}
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-4">
                        <PropertyThumbnail
                          propertyId={prop.id}
                          propertyName={prop.name}
                          propertyType={prop.propertyType}
                          size="md"
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-display text-base font-bold text-[#222222]">
                              {prop.name}
                            </h3>
                            <span className="text-[#DDDDDD]" aria-hidden="true">
                              ·
                            </span>
                            <span
                              className={`text-xs font-semibold ${
                                prop.status === 'active'
                                  ? 'text-[#008A05]'
                                  : 'text-[#717171]'
                              }`}
                            >
                              {prop.status === 'active' ? 'Listed' : 'Paused'}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#717171]">
                            <span>{prop.propertyType}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {prop.city}, {prop.country}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-1 text-[#222222]">
                              <Globe className="h-3 w-3 text-[#717171]" />
                              {prop.timezone}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-semibold text-[#222222]">{prop.currency}</span>
                          </div>
                        </div>
                      </div>

                      <div
                        className="flex shrink-0 items-center gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedPropertyId(prop.id)}
                          aria-label={`View details for ${prop.name}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#DDDDDD] px-2.5 py-1.5 text-xs font-semibold text-[#222222] hover:bg-[#F7F7F7]"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Details</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(prop)}
                          aria-label={`Edit ${prop.name}`}
                          className="rounded-lg border border-[#DDDDDD] p-1.5 text-[#717171] transition-colors hover:bg-[#F7F7F7] hover:text-[#222222]"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(prop.id)}
                          aria-label={`Delete ${prop.name}`}
                          className="rounded-lg border border-[#DDDDDD] p-1.5 text-[#717171] transition-colors hover:border-[#C13515]/40 hover:bg-[#FFF8F6] hover:text-[#C13515]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Pricing & Minimum Stay Parameters */}
                    <div className="grid grid-cols-2 gap-3 border-y border-[#EBEBEB] py-3 sm:grid-cols-4">
                      <div>
                        <div className="text-xs text-[#717171]">Default Rate</div>
                        <div className="mt-0.5 font-display text-sm font-bold text-[#222222] tabular-nums">
                          {formatPropertyCurrency(prop.defaultNightlyRate, prop.currency)}/nt
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-[#717171]">Min Price Floor</div>
                        <div className="mt-0.5 font-display text-sm font-bold text-[#008A05] tabular-nums">
                          {formatPropertyCurrency(
                            prop.minimumAcceptableNightlyPrice,
                            prop.currency
                          )}
                          /nt
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-[#717171]">Max Discount</div>
                        <div className="mt-0.5 font-display text-sm font-bold text-[#222222] tabular-nums">
                          {prop.maximumAcceptableDiscount}%
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-[#717171]">Min Stay / Window</div>
                        <div className="mt-0.5 font-display text-sm font-bold text-[#222222] tabular-nums">
                          {prop.minimumBookingLength}n · {prop.analysisHorizonDays}d
                        </div>
                      </div>
                    </div>

                    {/* Calendar Feed Connection Summary */}
                    <div className="space-y-2 text-xs" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-[#717171]">
                          <Link2 className="h-3.5 w-3.5 text-[#717171]" />
                          {cal ? (
                            <span>
                              <strong className="font-semibold text-[#222222]">
                                {cal.sourceName}
                              </strong>{' '}
                              · Status:{' '}
                              <span
                                className={`font-semibold ${
                                  cal.syncStatus === 'healthy'
                                    ? 'text-[#008A05]'
                                    : cal.syncStatus === 'warning'
                                    ? 'text-[#B45309]'
                                    : cal.syncStatus === 'error'
                                    ? 'text-[#C13515]'
                                    : 'text-[#717171]'
                                }`}
                              >
                                {cal.syncStatus}
                              </span>{' '}
                              · Synced:{' '}
                              <span className="font-medium text-[#222222] tabular-nums">
                                {formatTimestampInPropertyTimezone(
                                  cal.lastSyncedAt,
                                  prop.timezone
                                )}
                              </span>
                            </span>
                          ) : (
                            <span>No Airbnb or Vrbo iCal feed connected yet</span>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => openConnectIcalModal(prop)}
                            className="font-semibold text-[#FF385C] hover:underline whitespace-nowrap"
                          >
                            {cal ? 'Update iCal URL' : 'Connect iCal Feed'}
                          </button>
                          {cal && (
                            <button
                              type="button"
                              disabled={syncingPropertyId === prop.id}
                              onClick={() =>
                                isDemoMode
                                  ? onTriggerSyncProperty(prop.id, 'standard')
                                  : onTriggerSyncProperty(prop.id)
                              }
                              className="inline-flex items-center gap-1 font-semibold text-[#222222] hover:underline disabled:opacity-50 whitespace-nowrap"
                            >
                              <RefreshCw
                                className={`h-3 w-3 ${
                                  syncingPropertyId === prop.id ? 'animate-spin' : ''
                                }`}
                              />
                              <span>
                                {syncingPropertyId === prop.id ? 'Syncing…' : 'Sync'}
                              </span>
                            </button>
                          )}
                        </div>
                      </div>

                      {cal?.lastErrorMessage && (
                        <div
                          role="alert"
                          className="flex items-start gap-2 rounded-xl border border-[#C13515]/30 bg-[#FFF8F6] px-3.5 py-2.5 text-xs text-[#C13515]"
                        >
                          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>{cal.lastErrorMessage}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right 5 cols: Listing Inspector */}
          <div className="lg:col-span-5">
            {inspectedProperty ? (
              <div className="sticky top-24 space-y-5 rounded-2xl border border-[#DDDDDD] bg-white p-6 shadow-[0_6px_20px_rgba(0,0,0,0.06)]">
                {(() => {
                  const cal = calendars.find(
                    (c) => c.propertyId === inspectedProperty.id
                  );
                  const propReservations = reservations.filter(
                    (r) =>
                      r.propertyId === inspectedProperty.id && r.status === 'confirmed'
                  );
                  const propGaps = opportunities.filter(
                    (o) =>
                      o.propertyId === inspectedProperty.id && o.status !== 'dismissed'
                  );

                  return (
                    <>
                      <PropertyThumbnail
                        propertyId={inspectedProperty.id}
                        propertyName={inspectedProperty.name}
                        propertyType={inspectedProperty.propertyType}
                        size="lg"
                      />

                      <div className="flex items-start justify-between gap-3 border-b border-[#EBEBEB] pb-4">
                        <div>
                          <div className="text-xs font-semibold text-[#FF385C]">
                            Listing Details
                          </div>
                          <h3 className="mt-1 font-display text-lg font-bold text-[#222222]">
                            {inspectedProperty.name}
                          </h3>
                          <p className="mt-0.5 text-xs text-[#717171]">
                            {inspectedProperty.propertyType} in {inspectedProperty.city},{' '}
                            {inspectedProperty.country}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleTogglePropertyStatus(inspectedProperty)}
                          className="rounded-lg border border-[#DDDDDD] bg-white px-3 py-1.5 text-xs font-semibold text-[#222222] hover:bg-[#F7F7F7] whitespace-nowrap"
                        >
                          Set {inspectedProperty.status === 'active' ? 'Inactive' : 'Active'}
                        </button>
                      </div>

                      {/* Pricing & Rule Summary */}
                      <div className="space-y-2 text-xs">
                        <div className="font-semibold text-[#222222]">
                          Pricing &amp; Timezone Protection
                        </div>
                        <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#F7F7F7] p-3.5 tabular-nums">
                          <div className="text-[#717171]">Property Timezone:</div>
                          <div className="text-right font-medium text-[#222222]">
                            {inspectedProperty.timezone}
                          </div>
                          <div className="text-[#717171]">Property Currency:</div>
                          <div className="text-right font-medium text-[#222222]">
                            {inspectedProperty.currency}
                          </div>
                          <div className="text-[#717171]">Default Nightly Rate:</div>
                          <div className="text-right font-medium text-[#222222]">
                            {formatPropertyCurrency(
                              inspectedProperty.defaultNightlyRate,
                              inspectedProperty.currency
                            )}
                            /nt
                          </div>
                          <div className="text-[#717171]">Min Acceptable Price:</div>
                          <div className="text-right font-bold text-[#008A05]">
                            {formatPropertyCurrency(
                              inspectedProperty.minimumAcceptableNightlyPrice,
                              inspectedProperty.currency
                            )}
                            /nt
                          </div>
                          <div className="text-[#717171]">Max Allowed Discount:</div>
                          <div className="text-right font-medium text-[#222222]">
                            {inspectedProperty.maximumAcceptableDiscount}%
                          </div>
                          <div className="text-[#717171]">Min Booking Length:</div>
                          <div className="text-right font-medium text-[#222222]">
                            {inspectedProperty.minimumBookingLength} nights
                          </div>
                          <div className="text-[#717171]">Analysis Horizon:</div>
                          <div className="text-right font-medium text-[#222222]">
                            {inspectedProperty.analysisHorizonDays} days
                          </div>
                        </div>
                      </div>

                      {/* Calendar Connection Inspector */}
                      <div className="space-y-2.5 border-t border-[#EBEBEB] pt-4 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[#222222]">
                            iCal Calendar Connection
                          </span>
                          <button
                            type="button"
                            onClick={() => openConnectIcalModal(inspectedProperty)}
                            className="font-semibold text-[#FF385C] hover:underline"
                          >
                            {cal ? 'Replace iCal Feed' : 'Connect iCal Feed'}
                          </button>
                        </div>

                        {cal ? (
                          <div className="space-y-2.5 rounded-xl border border-[#EBEBEB] p-3.5 text-[#717171]">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-[#222222]">
                                {cal.sourceName}
                              </span>
                              <span
                                className={`font-semibold ${
                                  cal.syncStatus === 'healthy'
                                    ? 'text-[#008A05]'
                                    : cal.syncStatus === 'warning'
                                    ? 'text-[#B45309]'
                                    : cal.syncStatus === 'error'
                                    ? 'text-[#C13515]'
                                    : 'text-[#717171]'
                                }`}
                              >
                                {cal.syncStatus}
                              </span>
                            </div>

                            <div className="truncate font-mono text-[11px] text-[#717171]">
                              Masked: {cal.maskedUrlPreview}
                            </div>

                            <div className="grid grid-cols-2 gap-2 rounded-lg bg-[#F7F7F7] p-2.5 text-[11px] tabular-nums">
                              <div>
                                <span>Bookings Imported:</span>{' '}
                                <strong className="text-[#222222]">
                                  {cal.eventsImportedCount}
                                </strong>
                              </div>
                              <div>
                                <span>Ambiguous Holds:</span>{' '}
                                <strong className="text-[#222222]">
                                  {cal.flaggedAmbiguousCount}
                                </strong>
                              </div>
                            </div>

                            <div className="text-[11px] text-[#717171]">
                              Last Sync ({inspectedProperty.timezone}):{' '}
                              <span className="font-medium text-[#222222]">
                                {formatTimestampInPropertyTimezone(
                                  cal.lastSyncedAt,
                                  inspectedProperty.timezone
                                )}
                              </span>
                            </div>

                            {cal.lastErrorMessage && (
                              <div
                                role="alert"
                                className="flex items-start gap-2 rounded-lg border border-[#C13515]/30 bg-[#FFF8F6] p-2.5 text-[11px] text-[#C13515]"
                              >
                                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                <span>{cal.lastErrorMessage}</span>
                              </div>
                            )}

                            <div className="flex flex-wrap items-center gap-1.5 border-t border-[#EBEBEB] pt-2.5">
                              <button
                                type="button"
                                disabled={syncingPropertyId === inspectedProperty.id}
                                onClick={() =>
                                  isDemoMode
                                    ? onTriggerSyncProperty(inspectedProperty.id, 'standard')
                                    : onTriggerSyncProperty(inspectedProperty.id)
                                }
                                className="inline-flex items-center gap-1 rounded-lg bg-[#222222] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-black disabled:opacity-50 whitespace-nowrap"
                              >
                                <RefreshCw
                                  className={`h-3 w-3 ${
                                    syncingPropertyId === inspectedProperty.id
                                      ? 'animate-spin'
                                      : ''
                                  }`}
                                />
                                <span>Sync Now</span>
                              </button>
                              {isDemoMode && (
                                <>
                                  <button
                                    type="button"
                                    disabled={syncingPropertyId === inspectedProperty.id}
                                    onClick={() =>
                                      onTriggerSyncProperty(
                                        inspectedProperty.id,
                                        'with_cancellation'
                                      )
                                    }
                                    className="rounded-lg border border-[#DDDDDD] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#222222] hover:bg-[#F7F7F7] whitespace-nowrap"
                                  >
                                    Simulate Cancellation
                                  </button>
                                  <button
                                    type="button"
                                    disabled={syncingPropertyId === inspectedProperty.id}
                                    onClick={() =>
                                      onTriggerSyncProperty(inspectedProperty.id, 'malformed')
                                    }
                                    className="rounded-lg border border-[#DDDDDD] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#222222] hover:bg-[#F7F7F7] whitespace-nowrap"
                                  >
                                    Test Malformed Feed
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        ) : (
                          <p className="text-[#717171]">
                            No calendar connected. Paste a private HTTPS Airbnb or Vrbo iCal URL to
                            import reservations.
                          </p>
                        )}
                      </div>

                      {/* Detected Gaps Summary */}
                      <div className="space-y-2 border-t border-[#EBEBEB] pt-4 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[#222222]">
                            Imported Bookings ({propReservations.length}) &amp; Gaps ({propGaps.length})
                          </span>
                          {onNavigate && (
                            <button
                              type="button"
                              onClick={() => onNavigate('calendar')}
                              className="inline-flex items-center gap-1 font-semibold text-[#222222] underline hover:text-[#FF385C]"
                            >
                              <span>Timeline</span>
                              <ArrowUpRight className="h-3 w-3" />
                            </button>
                          )}
                        </div>

                        {propGaps.length > 0 ? (
                          <div className="divide-y divide-[#EBEBEB] rounded-xl border border-[#EBEBEB]">
                            {propGaps.map((gap) => (
                              <div
                                key={gap.id}
                                className="flex items-center justify-between px-3.5 py-2.5"
                              >
                                <div>
                                  <div className="font-semibold text-[#222222] tabular-nums">
                                    {gap.gapStartDate} → {gap.gapEndDate} ({gap.emptyNights}n)
                                  </div>
                                  <div className="text-[11px] text-[#717171]">
                                    {gap.priority.label} ({gap.priority.totalScore}/100) · Status:{' '}
                                    {gap.status}
                                  </div>
                                </div>
                                <div className="text-right font-display font-bold text-[#FF385C] tabular-nums">
                                  {formatPropertyCurrency(
                                    gap.financials.suggestedGross,
                                    inspectedProperty.currency
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[#717171]">
                            No orphan gaps currently detected for this listing.
                          </p>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Connect / Update Private HTTPS iCal Modal with Airbnb Export Guide */}
      {icalModalProperty && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="connect-ical-title"
        >
          <div className="w-full max-w-lg rounded-2xl border border-[#DDDDDD] bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#EBEBEB] pb-3.5">
              <h3 id="connect-ical-title" className="font-display text-base font-bold text-[#222222]">
                Connect Private iCal Feed — {icalModalProperty.name}
              </h3>
              <button
                type="button"
                onClick={() => setIcalModalProperty(null)}
                aria-label="Close iCal connection modal"
                className="rounded-full p-1 text-[#717171] hover:bg-[#F7F7F7]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmConnectIcal} className="mt-4 space-y-4" noValidate>
              {icalModalError && (
                <div className="flex items-start gap-2 rounded-xl border border-[#C13515]/30 bg-[#FFF8F6] p-3 text-xs text-[#C13515]">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{icalModalError}</span>
                </div>
              )}

              {/* Step-by-step Airbnb Host Calendar Export Helper */}
              <details className="rounded-xl border border-[#EBEBEB] bg-[#F7F7F7] p-3.5 text-xs">
                <summary className="flex cursor-pointer items-center gap-2 font-semibold text-[#222222]">
                  <HelpCircle className="h-4 w-4 text-[#FF385C]" />
                  <span>How to find your Airbnb iCal export link (3 steps)</span>
                </summary>
                <ol className="mt-2.5 space-y-1.5 pl-4 text-[#717171] list-decimal">
                  <li>
                    Open your <strong className="text-[#222222]">Airbnb Hosting Calendar</strong>{' '}
                    for this listing.
                  </li>
                  <li>
                    Click <strong className="text-[#222222]">Availability</strong> in the right
                    panel, scroll to <strong className="text-[#222222]">Connect calendars</strong>,
                    and pick <strong className="text-[#222222]">Export calendar</strong>.
                  </li>
                  <li>
                    Copy the private <code className="font-mono text-[#222222]">https://www.airbnb.com/calendar/ical/…</code>{' '}
                    URL and paste it below.
                  </li>
                </ol>
              </details>

              <div>
                <label
                  htmlFor="ical-source-name"
                  className="block text-xs font-semibold text-[#222222]"
                >
                  Calendar Feed Label
                </label>
                <input
                  id="ical-source-name"
                  type="text"
                  value={icalSourceName}
                  onChange={(e) => setIcalSourceName(e.target.value)}
                  placeholder="Airbnb Primary iCal Feed"
                  className="mt-1.5 w-full rounded-lg border border-[#B0B0B0] px-3.5 py-2 text-sm text-[#222222] focus:border-[#222222] focus:outline-hidden"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="ical-raw-url"
                    className="block text-xs font-semibold text-[#222222]"
                  >
                    Private HTTPS iCal URL (.ics)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIcalModalUrl(
                        `https://www.airbnb.com/calendar/ical/${icalModalProperty.id}_984120.ics?s=secret_host_token`
                      );
                      setIcalModalError(null);
                    }}
                    className="text-xs font-semibold text-[#FF385C] hover:underline"
                  >
                    Autofill Sample Airbnb HTTPS URL
                  </button>
                </div>
                <input
                  id="ical-raw-url"
                  type="url"
                  value={icalModalUrl}
                  onChange={(e) => setIcalModalUrl(e.target.value)}
                  placeholder="https://www.airbnb.com/calendar/ical/123456789.ics?s=secret_token"
                  className="mt-1.5 w-full rounded-lg border border-[#B0B0B0] px-3.5 py-2 font-mono text-xs text-[#222222] focus:border-[#222222] focus:outline-hidden"
                />
                <p className="mt-1.5 text-xs text-[#717171]">
                  Encrypted server-side on save. Only standard HTTPS (port 443) calendar URLs are
                  permitted.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-[#EBEBEB] pt-4">
                <button
                  type="button"
                  onClick={() => setIcalModalProperty(null)}
                  className="rounded-lg border border-[#DDDDDD] bg-white px-4 py-2 text-xs font-semibold text-[#222222] hover:bg-[#F7F7F7]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#FF385C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#E00B41]"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Validate &amp; Save Feed</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Listing Modal */}
      {isFormOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="property-modal-title"
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#DDDDDD] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#EBEBEB] px-6 py-4">
              <h2 id="property-modal-title" className="font-display text-base font-bold text-[#222222]">
                {editingProperty ? `Edit ${editingProperty.name}` : 'Add Airbnb / Rental Listing'}
              </h2>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                aria-label="Close property modal"
                className="rounded-full p-1.5 text-[#717171] hover:bg-[#F7F7F7]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 p-6" noValidate>
              {formError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-[#C13515]/30 bg-[#FFF8F6] p-3 text-xs text-[#C13515]"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {livePreviewValidation.floorClampNote && (
                <div className="flex items-start gap-2 rounded-xl border border-[#EBEBEB] bg-[#F7F7F7] p-3 text-xs text-[#222222]">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#FF385C]" />
                  <span>{livePreviewValidation.floorClampNote}</span>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="prop-name" className="block text-xs font-semibold text-[#222222]">
                    Listing Name
                  </label>
                  <input
                    id="prop-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Montmartre Terrace Studio"
                    className="mt-1.5 w-full rounded-lg border border-[#B0B0B0] px-3.5 py-2 text-sm text-[#222222] focus:border-[#222222] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label htmlFor="prop-type" className="block text-xs font-semibold text-[#222222]">
                    Property Type
                  </label>
                  <select
                    id="prop-type"
                    value={propertyType}
                    onChange={(e) =>
                      setPropertyType(e.target.value as Property['propertyType'])
                    }
                    className="mt-1.5 w-full rounded-lg border border-[#B0B0B0] bg-white px-3 py-2 text-sm text-[#222222] focus:border-[#222222] focus:outline-hidden"
                  >
                    <option value="Apartment">Apartment</option>
                    <option value="Loft">Loft</option>
                    <option value="House">House</option>
                    <option value="Villa">Villa</option>
                    <option value="Cabin">Cabin</option>
                    <option value="Studio">Studio</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="prop-status"
                    className="block text-xs font-semibold text-[#222222]"
                  >
                    Listing Status
                  </label>
                  <select
                    id="prop-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as PropertyStatus)}
                    className="mt-1.5 w-full rounded-lg border border-[#B0B0B0] bg-white px-3 py-2 text-sm text-[#222222] focus:border-[#222222] focus:outline-hidden"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="prop-city" className="block text-xs font-semibold text-[#222222]">
                    City
                  </label>
                  <input
                    id="prop-city"
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Paris"
                    className="mt-1.5 w-full rounded-lg border border-[#B0B0B0] px-3.5 py-2 text-sm text-[#222222] focus:border-[#222222] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label
                    htmlFor="prop-country"
                    className="block text-xs font-semibold text-[#222222]"
                  >
                    Country
                  </label>
                  <input
                    id="prop-country"
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="France"
                    className="mt-1.5 w-full rounded-lg border border-[#B0B0B0] px-3.5 py-2 text-sm text-[#222222] focus:border-[#222222] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label
                    htmlFor="prop-timezone"
                    className="block text-xs font-semibold text-[#222222]"
                  >
                    Listing Timezone (IANA)
                  </label>
                  <select
                    id="prop-timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-[#B0B0B0] bg-white px-3 py-2 text-sm text-[#222222] focus:border-[#222222] focus:outline-hidden"
                  >
                    {SUPPORTED_IANA_TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="prop-currency"
                    className="block text-xs font-semibold text-[#222222]"
                  >
                    Listing Currency
                  </label>
                  <select
                    id="prop-currency"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                    className="mt-1.5 w-full rounded-lg border border-[#B0B0B0] bg-white px-3 py-2 text-sm text-[#222222] focus:border-[#222222] focus:outline-hidden"
                  >
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="prop-rate" className="block text-xs font-semibold text-[#222222]">
                    Default Nightly Rate ({currency})
                  </label>
                  <input
                    id="prop-rate"
                    type="number"
                    min="1"
                    value={defaultNightlyRate}
                    onChange={(e) => setDefaultNightlyRate(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-[#B0B0B0] px-3.5 py-2 text-sm text-[#222222] tabular-nums focus:border-[#222222] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label htmlFor="prop-floor" className="block text-xs font-semibold text-[#222222]">
                    Minimum Acceptable Nightly Price ({currency})
                  </label>
                  <input
                    id="prop-floor"
                    type="number"
                    min="1"
                    value={minimumAcceptableNightlyPrice}
                    onChange={(e) => setMinimumAcceptableNightlyPrice(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-[#B0B0B0] px-3.5 py-2 text-sm text-[#222222] tabular-nums focus:border-[#222222] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label
                    htmlFor="prop-discount"
                    className="block text-xs font-semibold text-[#222222]"
                  >
                    Maximum Allowed Discount (%)
                  </label>
                  <input
                    id="prop-discount"
                    type="number"
                    min="0"
                    max="80"
                    value={maximumAcceptableDiscount}
                    onChange={(e) => setMaximumAcceptableDiscount(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-[#B0B0B0] px-3.5 py-2 text-sm text-[#222222] tabular-nums focus:border-[#222222] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label
                    htmlFor="prop-minstay"
                    className="block text-xs font-semibold text-[#222222]"
                  >
                    Minimum Booking Length (Nights)
                  </label>
                  <input
                    id="prop-minstay"
                    type="number"
                    min="1"
                    max="30"
                    value={minimumBookingLength}
                    onChange={(e) => setMinimumBookingLength(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-[#B0B0B0] px-3.5 py-2 text-sm text-[#222222] tabular-nums focus:border-[#222222] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label
                    htmlFor="prop-horizon"
                    className="block text-xs font-semibold text-[#222222]"
                  >
                    Analysis Horizon (Days)
                  </label>
                  <input
                    id="prop-horizon"
                    type="number"
                    min="14"
                    max="365"
                    value={analysisHorizonDays}
                    onChange={(e) => setAnalysisHorizonDays(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-[#B0B0B0] px-3.5 py-2 text-sm text-[#222222] tabular-nums focus:border-[#222222] focus:outline-hidden"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="prop-ical" className="block text-xs font-semibold text-[#222222]">
                    Private HTTPS iCal URL (Optional)
                  </label>
                  <input
                    id="prop-ical"
                    type="url"
                    value={icalUrl}
                    onChange={(e) => setIcalUrl(e.target.value)}
                    placeholder="https://www.airbnb.com/calendar/ical/12345678.ics?s=..."
                    className="mt-1.5 w-full rounded-lg border border-[#B0B0B0] px-3.5 py-2 font-mono text-xs text-[#222222] focus:border-[#222222] focus:outline-hidden"
                  />
                  <p className="mt-1 text-xs text-[#717171]">
                    Encrypted on our server; never visible to guests or browser scripts.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-[#EBEBEB] pt-4">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="rounded-lg border border-[#DDDDDD] bg-white px-4 py-2 text-xs font-semibold text-[#222222] hover:bg-[#F7F7F7]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#FF385C] px-5 py-2 text-xs font-semibold text-white hover:bg-[#E00B41]"
                >
                  {editingProperty ? 'Save Listing Changes' : 'Create Listing'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {confirmDeleteId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-prop-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-[#DDDDDD] bg-white p-6 shadow-2xl">
            <h3 id="delete-prop-title" className="font-display text-base font-bold text-[#222222]">
              Remove Listing &amp; Associated Gaps?
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-[#717171]">
              Removing this listing will also delete its connected calendar metadata and active
              orphan-night calculations from your workspace.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="rounded-lg border border-[#DDDDDD] bg-white px-4 py-2 text-xs font-semibold text-[#222222] hover:bg-[#F7F7F7]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteProperty(confirmDeleteId);
                  setConfirmDeleteId(null);
                }}
                className="rounded-lg bg-[#C13515] px-4 py-2 text-xs font-semibold text-white hover:bg-[#9E2B11]"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
