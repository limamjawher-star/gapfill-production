import {
  DbCalendarConnectionRow,
  DbGapOpportunityRow,
  DbPropertyInsertPayload,
  DbPropertyRow,
  DbReservationRow,
} from '../types/database';
import {
  CalendarConnection,
  CalendarSyncStatus,
  GapOpportunity,
  HostActionLog,
  Property,
  Reservation,
  SyncRunLog,
} from '../types/gapfill';
import { detectOrphanGaps, diffCalendarNights } from '../utils/engines';
import {
  NormalizedIcalEvent,
  reconcileReservationsByUid,
} from '../features/calendar/icalSyncEngine';

/**
 * Masks a raw HTTPS iCal URL so that secret query tokens or private calendar IDs
 * never appear in public.calendar_connections or UI logs.
 * Raw URL is stored exclusively in private.calendar_secrets.
 */
export function maskCalendarUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim());
    const pathSegments = parsed.pathname.split('/').filter(Boolean);
    const lastSegment = pathSegments[pathSegments.length - 1] || 'calendar.ics';
    const cleanPrefix = lastSegment.slice(0, 4);
    const parentPath =
      pathSegments.length > 1
        ? `/${pathSegments.slice(0, -1).join('/')}/`
        : '/';
    return `${parsed.origin}${parentPath}${cleanPrefix}••••••.ics`;
  } catch {
    return 'https://calendar-host/••••••.ics';
  }
}

/**
 * Converts a domain Property into a client-safe Supabase INSERT/UPDATE payload.
 * Never includes owner_id (assigned by PostgreSQL auth.uid() default & trigger).
 */
export function mapPropertyToDbInsert(
  property: Property
): DbPropertyInsertPayload {
  return {
    name: property.name.trim(),
    property_type: property.propertyType,
    city: property.city.trim(),
    country: property.country.trim(),
    timezone: property.timezone,
    currency: property.currency,
    default_nightly_rate: Number(property.defaultNightlyRate),
    minimum_booking_length: Number(property.minimumBookingLength),
    minimum_acceptable_nightly_price: Number(
      property.minimumAcceptableNightlyPrice
    ),
    maximum_acceptable_discount: Number(property.maximumAcceptableDiscount),
    analysis_horizon_days: Number(property.analysisHorizonDays),
    status: property.status,
  };
}

export function mapPropertyFromDb(row: DbPropertyRow): Property {
  return {
    id: row.id,
    name: row.name,
    propertyType: row.property_type,
    city: row.city,
    country: row.country,
    timezone: row.timezone,
    currency: row.currency,
    defaultNightlyRate: Number(row.default_nightly_rate),
    minimumBookingLength: Number(row.minimum_booking_length),
    minimumAcceptableNightlyPrice: Number(row.minimum_acceptable_nightly_price),
    maximumAcceptableDiscount: Number(row.maximum_acceptable_discount),
    analysisHorizonDays: Number(row.analysis_horizon_days),
    status: row.status,
    createdAt: row.created_at,
  };
}

export function mapCalendarFromDb(
  row: DbCalendarConnectionRow
): CalendarConnection {
  return {
    id: row.id,
    propertyId: row.property_id,
    sourceName: row.source_name,
    maskedUrlPreview: row.masked_url_preview,
    syncStatus: row.sync_status,
    lastSyncedAt: row.last_synced_at,
    lastErrorMessage: row.last_error_message,
    eventsImportedCount: row.events_imported_count,
    flaggedAmbiguousCount: row.flagged_ambiguous_count,
  };
}

export function mapReservationFromDb(row: DbReservationRow): Reservation {
  return {
    id: row.id,
    propertyId: row.property_id,
    sourceUid: row.source_uid,
    checkInDate: row.check_in_date,
    checkOutDate: row.check_out_date,
    status: row.status,
    summaryLabel: row.summary_label,
    updatedAt: row.updated_at,
  };
}

export function mapOpportunityFromDb(
  row: DbGapOpportunityRow,
  property: Property,
  referenceDateStr: string
): GapOpportunity {
  const daysUntilStart = diffCalendarNights(
    referenceDateStr,
    row.gap_start_date
  );
  const floorPriceEnforced =
    Number(row.suggested_nightly_rate) <=
    Number(property.minimumAcceptableNightlyPrice);

  return {
    id: row.id,
    propertyId: row.property_id,
    gapStartDate: row.gap_start_date,
    gapEndDate: row.gap_end_date,
    emptyNights: Number(row.empty_nights),
    daysUntilStart,
    previousReservationId: '',
    nextReservationId: '',
    isMinStayCompatible: Boolean(row.is_min_stay_compatible),
    minStayRequired: property.minimumBookingLength,
    financials: {
      emptyNights: Number(row.empty_nights),
      baseNightlyRate: Number(row.base_nightly_rate),
      recommendedDiscountPercent: Number(row.suggested_discount_percent),
      maxAllowedDiscountPercent: property.maximumAcceptableDiscount,
      minimumAcceptableRate: property.minimumAcceptableNightlyPrice,
      baseGross: Number(row.estimated_base_gross),
      suggestedNightlyRate: Number(row.suggested_nightly_rate),
      suggestedGross: Number(row.estimated_suggested_gross),
      floorPriceEnforced,
    },
    priority: {
      totalScore: Number(row.priority_score),
      label: row.priority_label,
      timeUntilGapPoints: 0,
      gapLengthPoints: 0,
      estimatedRevenuePoints: 0,
      minStayCompatibilityPoints: 0,
      calendarFreshnessPoints: 0,
      explanations: Array.isArray(row.priority_explanations)
        ? row.priority_explanations
        : [],
    },
    status: row.status,
    actualRecoveredRevenue:
      row.actual_recovered_revenue !== null
        ? Number(row.actual_recovered_revenue)
        : null,
    filledAt: row.filled_at,
    strategy: row.ai_strategy ?? undefined,
  };
}

/**
 * Multi-Tenant RLS Simulator & Local Persistence Store for Live Account Mode
 * Ensures that even before a remote Supabase URL is connected, Live Account Mode
 * scopes every table strictly to the authenticated user's auth.uid() (ownerId)
 * and stores raw iCal secrets in an isolated map inaccessible to public queries.
 */
export interface TenantScopedBundle {
  properties: Property[];
  calendars: CalendarConnection[];
  reservations: Reservation[];
  opportunities: GapOpportunity[];
  actions: HostActionLog[];
  syncRuns: SyncRunLog[];
}

export class MultiTenantRlsStore {
  private buckets = new Map<string, TenantScopedBundle>();
  private privateCalendarSecrets = new Map<
    string,
    { ownerId: string; rawIcalUrl: string }
  >();

  private ensureBucket(authenticatedUserId: string): TenantScopedBundle {
    if (!authenticatedUserId) {
      throw new Error('RLS Violation: auth.uid() is required for all queries.');
    }
    let bucket = this.buckets.get(authenticatedUserId);
    if (!bucket) {
      bucket = {
        properties: [],
        calendars: [],
        reservations: [],
        opportunities: [],
        actions: [],
        syncRuns: [],
      };
      this.buckets.set(authenticatedUserId, bucket);
    }
    return bucket;
  }

  public getTenantSnapshot(authenticatedUserId: string): TenantScopedBundle {
    const b = this.ensureBucket(authenticatedUserId);
    return {
      properties: [...b.properties],
      calendars: [...b.calendars],
      reservations: [...b.reservations],
      opportunities: [...b.opportunities],
      actions: [...b.actions],
      syncRuns: [...b.syncRuns],
    };
  }

  public upsertProperty(
    authenticatedUserId: string,
    property: Property,
    rawIcalUrl?: string,
    sourceName?: string
  ): TenantScopedBundle {
    const b = this.ensureBucket(authenticatedUserId);
    const exists = b.properties.some((p) => p.id === property.id);
    b.properties = exists
      ? b.properties.map((p) => (p.id === property.id ? property : p))
      : [...b.properties, property];

    if (rawIcalUrl && rawIcalUrl.trim()) {
      const masked = maskCalendarUrl(rawIcalUrl);
      const existingCal = b.calendars.find((c) => c.propertyId === property.id);
      const calId = existingCal?.id ?? `cal_${property.id}`;
      const nextCal: CalendarConnection = {
        id: calId,
        propertyId: property.id,
        sourceName:
          sourceName?.trim() ||
          existingCal?.sourceName ||
          'Airbnb HTTPS iCal Feed',
        maskedUrlPreview: masked,
        syncStatus: existingCal?.syncStatus ?? 'never_synced',
        lastSyncedAt: existingCal?.lastSyncedAt ?? null,
        lastErrorMessage: null,
        eventsImportedCount: existingCal?.eventsImportedCount ?? 0,
        flaggedAmbiguousCount: existingCal?.flaggedAmbiguousCount ?? 0,
      };
      b.calendars = existingCal
        ? b.calendars.map((c) => (c.propertyId === property.id ? nextCal : c))
        : [...b.calendars, nextCal];

      // Store raw URL strictly in isolated private secrets map
      this.privateCalendarSecrets.set(calId, {
        ownerId: authenticatedUserId,
        rawIcalUrl: rawIcalUrl.trim(),
      });
    }

    return this.getTenantSnapshot(authenticatedUserId);
  }

  public applyCalendarSyncResult(
    authenticatedUserId: string,
    params: {
      propertyId: string;
      referenceDateStr: string;
      ok: boolean;
      syncStatus: CalendarSyncStatus;
      parsedEvents: NormalizedIcalEvent[];
      flaggedAmbiguousCount: number;
      lastSyncedAt: string;
      errorMessage: string | null;
    }
  ): TenantScopedBundle {
    const b = this.ensureBucket(authenticatedUserId);
    const property = b.properties.find((p) => p.id === params.propertyId);
    const cal = b.calendars.find((c) => c.propertyId === params.propertyId);
    if (!property || !cal) {
      return this.getTenantSnapshot(authenticatedUserId);
    }

    if (!params.ok) {
      b.calendars = b.calendars.map((c) =>
        c.id === cal.id
          ? {
              ...c,
              syncStatus: 'error',
              lastSyncedAt: params.lastSyncedAt,
              lastErrorMessage: params.errorMessage ?? 'Malformed iCal feed.',
            }
          : c
      );
      b.syncRuns = [
        {
          id: `sync_${Date.now()}`,
          propertyId: property.id,
          calendarConnectionId: cal.id,
          startedAt: params.lastSyncedAt,
          completedAt: params.lastSyncedAt,
          status: 'error',
          reservationsUpserted: 0,
          gapsRecalculated: 0,
          message: params.errorMessage ?? 'Malformed iCal feed rejected.',
        },
        ...b.syncRuns,
      ];
      return this.getTenantSnapshot(authenticatedUserId);
    }

    const reconciled = reconcileReservationsByUid({
      existingReservations: b.reservations,
      parsedEvents: params.parsedEvents,
      propertyId: property.id,
      syncTimestampIso: params.lastSyncedAt,
    });
    b.reservations = reconciled.reservations;

    const recalculatedForProp = detectOrphanGaps({
      property,
      reservations: b.reservations,
      referenceDateStr: params.referenceDateStr,
      hoursSinceLastSync: 0,
      existingOpportunities: b.opportunities,
    });
    const otherOpps = b.opportunities.filter(
      (o) => o.propertyId !== property.id
    );
    b.opportunities = [...otherOpps, ...recalculatedForProp].sort(
      (x, y) => y.priority.totalScore - x.priority.totalScore
    );

    b.calendars = b.calendars.map((c) =>
      c.id === cal.id
        ? {
            ...c,
            syncStatus: params.syncStatus,
            lastSyncedAt: params.lastSyncedAt,
            lastErrorMessage: null,
            eventsImportedCount: params.parsedEvents.length,
            flaggedAmbiguousCount: params.flaggedAmbiguousCount,
          }
        : c
    );

    b.syncRuns = [
      {
        id: `sync_${Date.now()}`,
        propertyId: property.id,
        calendarConnectionId: cal.id,
        startedAt: params.lastSyncedAt,
        completedAt: params.lastSyncedAt,
        status: params.flaggedAmbiguousCount > 0 ? 'warning' : 'success',
        reservationsUpserted: reconciled.upsertedCount,
        gapsRecalculated: recalculatedForProp.length,
        message: `Synced ${reconciled.upsertedCount} events (${reconciled.insertedCount} new, ${reconciled.updatedCount} updated, ${reconciled.cancelledCount} canceled) in ${property.timezone}.`,
      },
      ...b.syncRuns,
    ];

    return this.getTenantSnapshot(authenticatedUserId);
  }

  public deleteProperty(
    authenticatedUserId: string,
    propertyId: string
  ): TenantScopedBundle {
    const b = this.ensureBucket(authenticatedUserId);
    const owned = b.properties.some((p) => p.id === propertyId);
    if (!owned) {
      // RLS blocks deleting a property not owned by auth.uid()
      return this.getTenantSnapshot(authenticatedUserId);
    }
    const calToRemove = b.calendars.find((c) => c.propertyId === propertyId);
    if (calToRemove) {
      this.privateCalendarSecrets.delete(calToRemove.id);
    }
    b.properties = b.properties.filter((p) => p.id !== propertyId);
    b.calendars = b.calendars.filter((c) => c.propertyId !== propertyId);
    b.reservations = b.reservations.filter((r) => r.propertyId !== propertyId);
    b.opportunities = b.opportunities.filter((o) => o.propertyId !== propertyId);
    return this.getTenantSnapshot(authenticatedUserId);
  }

  /**
   * Simulates server-only Edge Function access to private.calendar_secrets
   * after verifying that the authenticated caller owns the calendar connection.
   */
  public getPrivateCalendarSecretServerOnly(
    authenticatedUserId: string,
    calendarConnectionId: string
  ): string | null {
    const secret = this.privateCalendarSecrets.get(calendarConnectionId);
    if (!secret || secret.ownerId !== authenticatedUserId) {
      return null;
    }
    return secret.rawIcalUrl;
  }

  public saveOpportunityStrategy(
    authenticatedUserId: string,
    opportunityId: string,
    strategy: NonNullable<GapOpportunity['strategy']>
  ): TenantScopedBundle {
    const b = this.ensureBucket(authenticatedUserId);
    const targetOpp = b.opportunities.find((o) => o.id === opportunityId);
    if (!targetOpp) {
      return this.getTenantSnapshot(authenticatedUserId);
    }

    b.opportunities = b.opportunities.map((o) =>
      o.id === opportunityId ? { ...o, strategy } : o
    );

    b.actions = [
      {
        id: `act_${Date.now()}`,
        opportunityId,
        propertyId: targetOpp.propertyId,
        actionType: 'strategy_generated',
        description: `Generated ${strategy.source} strategy (${
          strategy.modelUsed ?? 'rule-engine'
        }) for ${targetOpp.gapStartDate} → ${targetOpp.gapEndDate}.`,
        createdAt: new Date().toISOString(),
      },
      ...b.actions,
    ];

    return this.getTenantSnapshot(authenticatedUserId);
  }

  public updateOpportunityStatus(
    authenticatedUserId: string,
    opportunityId: string,
    status: GapOpportunity['status'],
    actualRecoveredRevenue?: number
  ): TenantScopedBundle {
    const b = this.ensureBucket(authenticatedUserId);
    const targetOpp = b.opportunities.find((o) => o.id === opportunityId);
    if (!targetOpp) {
      return this.getTenantSnapshot(authenticatedUserId);
    }

    const nowIso = new Date().toISOString();
    b.opportunities = b.opportunities.map((opp) => {
      if (opp.id !== opportunityId) return opp;
      return {
        ...opp,
        status,
        actualRecoveredRevenue:
          status === 'filled'
            ? actualRecoveredRevenue ?? opp.financials.suggestedGross
            : opp.actualRecoveredRevenue,
        filledAt: status === 'filled' ? nowIso : opp.filledAt,
      };
    });

    b.actions = [
      {
        id: `act_${Date.now()}`,
        opportunityId,
        propertyId: targetOpp.propertyId,
        actionType:
          status === 'filled'
            ? 'marked_filled'
            : status === 'dismissed'
            ? 'opportunity_dismissed'
            : 'marked_actioned',
        description:
          status === 'filled'
            ? `Confirmed filled booking for ${targetOpp.gapStartDate} → ${targetOpp.gapEndDate} (${actualRecoveredRevenue ?? targetOpp.financials.suggestedGross}).`
            : `Updated opportunity (${targetOpp.gapStartDate} → ${targetOpp.gapEndDate}) status to ${status}.`,
        recoveredAmount: actualRecoveredRevenue,
        createdAt: nowIso,
      },
      ...b.actions,
    ];

    return this.getTenantSnapshot(authenticatedUserId);
  }

  public logHostAction(
    authenticatedUserId: string,
    opportunityId: string,
    actionType: HostActionLog['actionType'],
    description: string
  ): TenantScopedBundle {
    const b = this.ensureBucket(authenticatedUserId);
    const targetOpp = b.opportunities.find((o) => o.id === opportunityId);
    b.actions = [
      {
        id: `act_${Date.now()}`,
        opportunityId,
        propertyId: targetOpp?.propertyId ?? '',
        actionType,
        description,
        createdAt: new Date().toISOString(),
      },
      ...b.actions,
    ];
    return this.getTenantSnapshot(authenticatedUserId);
  }
}

export const liveTenantStore = new MultiTenantRlsStore();
