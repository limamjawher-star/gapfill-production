'use client';

import React, { useState, useMemo } from 'react';
import {
  AIStrategyRecommendation,
  CalendarConnection,
  CalendarSyncStatus,
  GapOpportunity,
  HostActionLog,
  NavigationPageId,
  OpportunityStatus,
  Property,
  Reservation,
  SyncRunLog,
  WorkspaceDataMode,
} from '../src/types/gapfill';
import {
  buildInitialDemoOpportunities,
  DEMO_REFERENCE_DATE,
  INITIAL_DEMO_ACTIONS,
  INITIAL_DEMO_CALENDARS,
  INITIAL_DEMO_PROPERTIES,
  INITIAL_DEMO_RESERVATIONS,
  INITIAL_DEMO_SYNC_RUNS,
  runLocalDemoCalendarSync,
} from '../src/services/demoDataset';
import {
  liveTenantStore,
  maskCalendarUrl,
} from '../src/services/supabaseDataService';
import { isSupabaseConfigured } from '../src/lib/supabase';
import { formatPropertyCurrency } from '../src/features/properties/propertyValidation';
import {
  detectOrphanGaps,
  getTodayIsoDateInTimezone,
} from '../src/utils/engines';
import { reconcileReservationsByUid } from '../src/features/calendar/icalSyncEngine';
import { executeLiveCalendarSync } from '../src/features/calendar/liveSyncClient';
import {
  canAccessProtectedWorkspace,
  resolveActiveWorkspaceMode,
} from '../src/utils/authValidation';
import { AuthProvider, useAuth } from '../src/hooks/useAuth';
import { LoadingSkeleton } from '../src/components/LoadingSkeleton';
import { AppShellLayout } from '../src/layouts/AppShellLayout';
import { OverviewView } from '../src/views/OverviewView';
import { PropertiesView } from '../src/views/PropertiesView';
import { CalendarView } from '../src/views/CalendarView';
import { OpportunitiesView } from '../src/views/OpportunitiesView';
import { AIStrategyCenterView } from '../src/views/AIStrategyCenterView';
import { RevenueAnalyticsView } from '../src/views/RevenueAnalyticsView';
import { ActivityHistoryView } from '../src/views/ActivityHistoryView';
import { SettingsView } from '../src/views/SettingsView';
import { AuthPreviewModal } from '../src/views/AuthPreviewModal';
import { AuthScreen } from '../src/views/AuthScreen';
import { CheckCircle2, X } from 'lucide-react';

function ProtectedWorkspaceInner() {
  const {
    user,
    isDemoSession,
    sessionExpired,
    isLoadingAuth,
    authViewMode,
    setAuthViewMode,
    signIn,
    signUp,
    requestPasswordReset,
    updatePassword,
    signOut,
    enterDemoSandbox,
    simulateSessionExpiry,
  } = useAuth();

  const [activePage, setActivePage] = useState<NavigationPageId>('overview');
  const [workspaceModeOverride, setWorkspaceModeOverride] =
    useState<WorkspaceDataMode | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncingPropertyId, setSyncingPropertyId] = useState<string | null>(null);

  const supabaseConfigured = isSupabaseConfigured();
  const workspaceMode = useMemo(
    () =>
      resolveActiveWorkspaceMode({
        isAuthenticated: Boolean(user),
        isDemoSession,
        requestedMode: workspaceModeOverride,
      }),
    [user, isDemoSession, workspaceModeOverride]
  );

  // Isolated Demo State
  const [demoProperties, setDemoProperties] = useState<Property[]>(
    INITIAL_DEMO_PROPERTIES
  );
  const [demoCalendars, setDemoCalendars] = useState<CalendarConnection[]>(
    INITIAL_DEMO_CALENDARS
  );
  const [demoReservations, setDemoReservations] = useState<Reservation[]>(
    INITIAL_DEMO_RESERVATIONS
  );
  const [demoOpportunities, setDemoOpportunities] = useState<GapOpportunity[]>(() =>
    buildInitialDemoOpportunities(INITIAL_DEMO_PROPERTIES, INITIAL_DEMO_RESERVATIONS)
  );
  const [demoActions, setDemoActions] = useState<HostActionLog[]>(INITIAL_DEMO_ACTIONS);
  const [demoSyncRuns, setDemoSyncRuns] = useState<SyncRunLog[]>(INITIAL_DEMO_SYNC_RUNS);

  // Revision counter to trigger re-read from liveTenantStore scoped strictly to user.id (auth.uid())
  const [liveStoreVersion, setLiveStoreVersion] = useState<number>(0);

  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(
    null
  );

  const showToast = (msg: string) => {
    setToastMessage(msg);
  };

  // Load tenant-scoped Live records strictly by authenticated user.id (never shared across users)
  const liveSnapshot = useMemo(() => {
    if (!user) {
      return {
        properties: [],
        calendars: [],
        reservations: [],
        opportunities: [],
        actions: [],
        syncRuns: [],
      };
    }
    return liveTenantStore.getTenantSnapshot(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, liveStoreVersion]);

  const properties =
    workspaceMode === 'demo' ? demoProperties : liveSnapshot.properties;
  const calendars =
    workspaceMode === 'demo' ? demoCalendars : liveSnapshot.calendars;
  const reservations =
    workspaceMode === 'demo' ? demoReservations : liveSnapshot.reservations;
  const opportunities =
    workspaceMode === 'demo' ? demoOpportunities : liveSnapshot.opportunities;
  const actions = workspaceMode === 'demo' ? demoActions : liveSnapshot.actions;
  const syncRuns =
    workspaceMode === 'demo' ? demoSyncRuns : liveSnapshot.syncRuns;

  const activeOpportunitiesCount = useMemo(
    () =>
      opportunities.filter(
        (o) => o.status === 'new' || o.status === 'viewed' || o.status === 'actioned'
      ).length,
    [opportunities]
  );

  if (isLoadingAuth) {
    return (
      <div className="mx-auto max-w-5xl p-8">
        <LoadingSkeleton rows={5} />
      </div>
    );
  }

  // Stage 2 Route Guard: Block unauthenticated or expired sessions from private host data
  const accessCheck = canAccessProtectedWorkspace({
    isAuthenticated: Boolean(user),
    isDemoSession,
    sessionExpired,
    workspaceMode,
  });

  if (!accessCheck.allowed) {
    return (
      <AuthScreen
        mode={authViewMode}
        onChangeMode={setAuthViewMode}
        sessionExpired={sessionExpired}
        onSignIn={async (email, password) => {
          const res = await signIn(email, password);
          if (res.ok) {
            setWorkspaceModeOverride('live_supabase');
            showToast(res.message);
          }
          return res;
        }}
        onSignUp={async (email, password, fullName) => {
          const res = await signUp(email, password, fullName);
          if (res.ok) {
            setWorkspaceModeOverride('live_supabase');
            showToast(res.message);
          }
          return res;
        }}
        onForgotPassword={requestPasswordReset}
        onResetPassword={updatePassword}
        onEnterDemoSandbox={() => {
          setWorkspaceModeOverride('demo');
          enterDemoSandbox();
          showToast('Entered isolated DEMO sandbox environment.');
        }}
      />
    );
  }

  const handleTriggerSyncProperty = async (
    propertyId: string,
    simulationMode?: 'standard' | 'with_cancellation' | 'malformed',
    suppressToast = false
  ): Promise<{ ok: boolean; reservationsCount: number; gapsCount: number }> => {
    const targetProperty = properties.find((p) => p.id === propertyId);
    const targetCalendar = calendars.find((c) => c.propertyId === propertyId);
    if (!targetProperty || !targetCalendar) {
      if (!suppressToast) {
        showToast('Connect a private HTTPS iCal feed before syncing.');
      }
      return { ok: false, reservationsCount: 0, gapsCount: 0 };
    }

    setSyncingPropertyId(propertyId);
    try {
      if (workspaceMode === 'demo') {
        const payload = runLocalDemoCalendarSync(
          {
            id: targetProperty.id,
            name: targetProperty.name,
            timezone: targetProperty.timezone,
          },
          simulationMode ?? 'standard'
        );
        const nowIso = payload.lastSyncedAt;

        if (!payload.ok) {
          setDemoCalendars((prev) =>
            prev.map((c) =>
              c.propertyId === propertyId
                ? {
                    ...c,
                    syncStatus: 'error',
                    lastSyncedAt: nowIso,
                    lastErrorMessage:
                      payload.errorMessage ?? 'Malformed iCal feed rejected by ical.js.',
                  }
                : c
            )
          );
          setDemoSyncRuns((prev) => [
            {
              id: `sync_${Date.now()}`,
              propertyId,
              calendarConnectionId: targetCalendar.id,
              startedAt: nowIso,
              completedAt: nowIso,
              status: 'error',
              reservationsUpserted: 0,
              gapsRecalculated: 0,
              message:
                payload.errorMessage ?? '[DEMO] Malformed iCal feed rejected by ical.js.',
            },
            ...prev,
          ]);
          if (!suppressToast) {
            showToast(
              `DEMO sync failed for ${targetProperty.name}: ${
                payload.errorMessage ?? 'Malformed iCal feed.'
              }`
            );
          }
          return { ok: false, reservationsCount: 0, gapsCount: 0 };
        }

        const parsedEvents = payload.events;
        let upsertedTotal = 0;
        let insertedTotal = 0;
        let updatedTotal = 0;
        let cancelledTotal = 0;
        let recalculatedCount = 0;

        setDemoReservations((prevRes) => {
          const reconciled = reconcileReservationsByUid({
            existingReservations: prevRes,
            parsedEvents,
            propertyId,
            syncTimestampIso: nowIso,
          });
          upsertedTotal = reconciled.upsertedCount;
          insertedTotal = reconciled.insertedCount;
          updatedTotal = reconciled.updatedCount;
          cancelledTotal = reconciled.cancelledCount;

          setDemoOpportunities((prevOpps) => {
            const recalculatedForProp = detectOrphanGaps({
              property: targetProperty,
              reservations: reconciled.reservations,
              referenceDateStr: DEMO_REFERENCE_DATE,
              hoursSinceLastSync: 0,
              existingOpportunities: prevOpps,
            });
            recalculatedCount = recalculatedForProp.length;
            const otherOpps = prevOpps.filter((o) => o.propertyId !== propertyId);
            return [...otherOpps, ...recalculatedForProp].sort(
              (a, b) => b.priority.totalScore - a.priority.totalScore
            );
          });

          return reconciled.reservations;
        });

        const nextStatus: CalendarSyncStatus =
          payload.syncStatus ??
          (payload.flaggedAmbiguousCount > 0 ? 'warning' : 'healthy');

        setDemoCalendars((prev) =>
          prev.map((c) =>
            c.propertyId === propertyId
              ? {
                  ...c,
                  syncStatus: nextStatus,
                  lastSyncedAt: nowIso,
                  lastErrorMessage: null,
                  eventsImportedCount: parsedEvents.length,
                  flaggedAmbiguousCount: payload.flaggedAmbiguousCount,
                }
              : c
          )
        );

        setDemoSyncRuns((prev) => [
          {
            id: `sync_${Date.now()}_${propertyId}`,
            propertyId,
            calendarConnectionId: targetCalendar.id,
            startedAt: nowIso,
            completedAt: nowIso,
            status: payload.flaggedAmbiguousCount > 0 ? 'warning' : 'success',
            reservationsUpserted: upsertedTotal,
            gapsRecalculated: recalculatedCount,
            message: `[DEMO] Synced ${upsertedTotal} sample VEVENTs (${insertedTotal} new, ${updatedTotal} updated, ${cancelledTotal} canceled) in ${targetProperty.timezone}.`,
          },
          ...prev,
        ]);

        if (!suppressToast) {
          showToast(
            `[DEMO] Synced ${targetProperty.name}: ${upsertedTotal} sample reservations reconciled (${cancelledTotal} canceled) → ${recalculatedCount} gaps detected.`
          );
        }
        return {
          ok: true,
          reservationsCount: upsertedTotal,
          gapsCount: recalculatedCount,
        };
      } else if (user) {
        // Live authenticated mode: NEVER send simulationMode and NEVER call sample feed generators
        const payload = await executeLiveCalendarSync({
          id: targetProperty.id,
          name: targetProperty.name,
          timezone: targetProperty.timezone,
        });
        const nowIso = payload.lastSyncedAt ?? new Date().toISOString();
        const liveRefDate = getTodayIsoDateInTimezone(targetProperty.timezone);

        const nextBundle = liveTenantStore.applyCalendarSyncResult(user.id, {
          propertyId,
          referenceDateStr: liveRefDate,
          ok: payload.ok,
          syncStatus: payload.syncStatus ?? (payload.ok ? 'healthy' : 'error'),
          parsedEvents: payload.events ?? [],
          flaggedAmbiguousCount: payload.flaggedAmbiguousCount ?? 0,
          lastSyncedAt: nowIso,
          errorMessage: payload.errorMessage ?? null,
        });
        setLiveStoreVersion((v) => v + 1);
        if (!suppressToast) {
          showToast(
            payload.ok
              ? `Synced ${targetProperty.name} in Live Account Mode.`
              : `Sync unavailable for ${targetProperty.name}: ${
                  payload.errorMessage ?? 'Live iCal sync failed.'
                }`
          );
        }
        return {
          ok: payload.ok,
          reservationsCount: payload.events?.length ?? 0,
          gapsCount: nextBundle.opportunities.filter(
            (o) => o.propertyId === propertyId
          ).length,
        };
      }
      return { ok: false, reservationsCount: 0, gapsCount: 0 };
    } finally {
      setSyncingPropertyId(null);
    }
  };

  const handleSaveProperty = (
    updatedProp: Property,
    icalUrl?: string,
    sourceName?: string
  ) => {
    if (workspaceMode === 'demo') {
      const exists = demoProperties.some((p) => p.id === updatedProp.id);
      const nextProps = exists
        ? demoProperties.map((p) => (p.id === updatedProp.id ? updatedProp : p))
        : [...demoProperties, updatedProp];
      setDemoProperties(nextProps);

      if (icalUrl) {
        const masked = maskCalendarUrl(icalUrl);
        const existingCal = demoCalendars.find((c) => c.propertyId === updatedProp.id);
        const nextCal: CalendarConnection = existingCal
          ? {
              ...existingCal,
              sourceName: sourceName || existingCal.sourceName,
              maskedUrlPreview: masked,
              syncStatus: 'healthy',
              lastSyncedAt: new Date().toISOString(),
              lastErrorMessage: null,
            }
          : {
              id: `cal_${Date.now()}`,
              propertyId: updatedProp.id,
              sourceName: sourceName || 'Connected HTTPS iCal Feed',
              maskedUrlPreview: masked,
              syncStatus: 'healthy',
              lastSyncedAt: new Date().toISOString(),
              lastErrorMessage: null,
              eventsImportedCount: 3,
              flaggedAmbiguousCount: 0,
            };
        setDemoCalendars((prev) =>
          existingCal
            ? prev.map((c) => (c.propertyId === updatedProp.id ? nextCal : c))
            : [...prev, nextCal]
        );
      }

      const recalculatedForProp = detectOrphanGaps({
        property: updatedProp,
        reservations: demoReservations,
        referenceDateStr: DEMO_REFERENCE_DATE,
        hoursSinceLastSync: 1,
        existingOpportunities: demoOpportunities,
      });

      const otherOpps = demoOpportunities.filter(
        (o) => o.propertyId !== updatedProp.id
      );
      setDemoOpportunities(
        [...otherOpps, ...recalculatedForProp].sort(
          (a, b) => b.priority.totalScore - a.priority.totalScore
        )
      );

      setDemoActions((prev) => [
        {
          id: `act_${Date.now()}`,
          opportunityId: '',
          propertyId: updatedProp.id,
          actionType: 'property_updated',
          description: `${exists ? 'Updated' : 'Added'} property ${updatedProp.name} (${
            updatedProp.city
          }, ${updatedProp.timezone}).`,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      showToast(`Saved property "${updatedProp.name}" and recalculated orphan gaps.`);
    } else if (user) {
      liveTenantStore.upsertProperty(user.id, updatedProp, icalUrl, sourceName);
      setLiveStoreVersion((v) => v + 1);
      showToast(
        `Saved property "${updatedProp.name}" scoped to auth.uid (${user.id}).`
      );
    }
  };

  const handleDeleteProperty = (propertyId: string) => {
    if (workspaceMode === 'demo') {
      const target = demoProperties.find((p) => p.id === propertyId);
      setDemoProperties((prev) => prev.filter((p) => p.id !== propertyId));
      setDemoCalendars((prev) => prev.filter((c) => c.propertyId !== propertyId));
      setDemoOpportunities((prev) => prev.filter((o) => o.propertyId !== propertyId));
      showToast(`Removed property "${target?.name ?? propertyId}".`);
    } else if (user) {
      liveTenantStore.deleteProperty(user.id, propertyId);
      setLiveStoreVersion((v) => v + 1);
      showToast('Removed property from your tenant-isolated workspace.');
    }
  };

  const handleTriggerSyncAll = async () => {
    const connectedProps = properties.filter((p) =>
      calendars.some((c) => c.propertyId === p.id)
    );
    if (connectedProps.length === 0) {
      showToast('Connect at least one Airbnb or Vrbo iCal feed before syncing.');
      return;
    }

    setIsSyncing(true);
    let syncedListings = 0;
    let totalReservations = 0;
    try {
      for (const prop of connectedProps) {
        const res = await handleTriggerSyncProperty(
          prop.id,
          workspaceMode === 'demo' ? 'standard' : undefined,
          true
        );
        if (res.ok) {
          syncedListings += 1;
          totalReservations += res.reservationsCount;
        }
      }
      if (syncedListings === 0 && workspaceMode === 'live_supabase') {
        showToast(
          'Live calendar sync did not complete: backend iCal secret retrieval is not configured yet.'
        );
      } else {
        showToast(
          `Synced ${syncedListings} of ${connectedProps.length} connected listings (${totalReservations} bookings checked).`
        );
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdateOpportunityStatus = (
    opportunityId: string,
    status: OpportunityStatus,
    actualRecoveredRevenue?: number
  ) => {
    const nowIso = new Date().toISOString();
    const targetOpp = opportunities.find((o) => o.id === opportunityId);
    const targetProp = targetOpp
      ? properties.find((p) => p.id === targetOpp.propertyId)
      : undefined;
    const currency = targetProp?.currency ?? 'USD';

    const updater = (list: GapOpportunity[]) =>
      list.map((opp) => {
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

    if (workspaceMode === 'demo') {
      setDemoOpportunities(updater);
      if (targetOpp) {
        const formattedAmt =
          actualRecoveredRevenue !== undefined
            ? formatPropertyCurrency(actualRecoveredRevenue, currency)
            : '';
        setDemoActions((prev) => [
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
                ? `Confirmed filled booking for ${targetOpp.gapStartDate} → ${targetOpp.gapEndDate} with ${formattedAmt} actual recovered revenue.`
                : `Updated opportunity (${targetOpp.gapStartDate} → ${targetOpp.gapEndDate}) status to ${status}.`,
            recoveredAmount: actualRecoveredRevenue,
            createdAt: nowIso,
          },
          ...prev,
        ]);
      }
    } else if (user) {
      liveTenantStore.updateOpportunityStatus(
        user.id,
        opportunityId,
        status,
        actualRecoveredRevenue
      );
      setLiveStoreVersion((v) => v + 1);
    }

    if (status === 'filled') {
      showToast(
        `Recorded ${formatPropertyCurrency(
          actualRecoveredRevenue ?? 0,
          currency
        )} in Actual Recovered Revenue.`
      );
    } else {
      showToast(`Opportunity marked as ${status}.`);
    }
  };

  const handleSaveStrategy = (
    opportunityId: string,
    strategy: AIStrategyRecommendation
  ) => {
    const nowIso = new Date().toISOString();
    if (workspaceMode === 'demo') {
      const targetOpp = demoOpportunities.find((o) => o.id === opportunityId);
      setDemoOpportunities((prev) =>
        prev.map((o) => (o.id === opportunityId ? { ...o, strategy } : o))
      );
      if (targetOpp) {
        setDemoActions((prev) => [
          {
            id: `act_${Date.now()}`,
            opportunityId,
            propertyId: targetOpp.propertyId,
            actionType: 'strategy_generated',
            description: `Generated ${strategy.source} strategy (${
              strategy.modelUsed ?? 'rule-engine'
            }) for ${targetOpp.gapStartDate} → ${targetOpp.gapEndDate}.`,
            createdAt: nowIso,
          },
          ...prev,
        ]);
      }
    } else if (user) {
      liveTenantStore.saveOpportunityStrategy(user.id, opportunityId, strategy);
      setLiveStoreVersion((v) => v + 1);
    }
  };

  const handleLogCopyAction = (opportunityId: string, description: string) => {
    const nowIso = new Date().toISOString();
    if (workspaceMode === 'demo') {
      const targetOpp = demoOpportunities.find((o) => o.id === opportunityId);
      if (targetOpp) {
        setDemoActions((prev) => [
          {
            id: `act_${Date.now()}`,
            opportunityId,
            propertyId: targetOpp.propertyId,
            actionType: 'message_copied',
            description,
            createdAt: nowIso,
          },
          ...prev,
        ]);
      }
    } else if (user) {
      liveTenantStore.logHostAction(
        user.id,
        opportunityId,
        'message_copied',
        description
      );
      setLiveStoreVersion((v) => v + 1);
    }
    showToast(description);
  };

  const handleResetDemoData = () => {
    setDemoProperties(INITIAL_DEMO_PROPERTIES);
    setDemoCalendars(INITIAL_DEMO_CALENDARS);
    setDemoReservations(INITIAL_DEMO_RESERVATIONS);
    setDemoOpportunities(
      buildInitialDemoOpportunities(
        INITIAL_DEMO_PROPERTIES,
        INITIAL_DEMO_RESERVATIONS
      )
    );
    setDemoActions(INITIAL_DEMO_ACTIONS);
    setDemoSyncRuns(INITIAL_DEMO_SYNC_RUNS);
    showToast('Reset DEMO environment to initial baseline.');
  };

  const activeHostLabel = user ? user.email : 'demo-sandbox@gapfill.app';

  return (
    <>
      <AppShellLayout
        activePage={activePage}
        onNavigate={setActivePage}
        workspaceMode={workspaceMode}
        onChangeWorkspaceMode={(mode) => {
          setWorkspaceModeOverride(mode);
          if (mode === 'live_supabase' && !user) {
            return;
          }
          showToast(
            mode === 'demo'
              ? 'Switched to isolated DEMO sandbox environment.'
              : 'Switched to Live Account Mode (Scoped strictly to your auth.uid).'
          );
        }}
        hostEmail={activeHostLabel}
        isAuthenticated={Boolean(user)}
        supabaseConfigured={supabaseConfigured}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onSignOut={() => {
          setWorkspaceModeOverride(null);
          signOut();
          showToast('Signed out. Protected routes are now locked.');
        }}
        activeOpportunitiesCount={activeOpportunitiesCount}
      >
        {toastMessage && (
          <div
            role="status"
            className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-[#222222]/10 bg-[#222222] px-4 py-3 text-xs font-medium text-white shadow-sm"
          >
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[#008A05] bg-white rounded-full" />
              <span>{toastMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              aria-label="Dismiss notification"
              className="rounded-full p-1 text-white/70 hover:bg-white/10 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {activePage === 'overview' && (
          <OverviewView
            workspaceMode={workspaceMode}
            supabaseConfigured={supabaseConfigured}
            properties={properties}
            calendars={calendars}
            reservations={reservations}
            opportunities={opportunities}
            actions={actions}
            onNavigate={setActivePage}
            onSelectOpportunity={(id) => setSelectedOpportunityId(id)}
            onTriggerSyncAll={handleTriggerSyncAll}
            isSyncing={isSyncing}
          />
        )}

        {activePage === 'properties' && (
          <PropertiesView
            isDemoMode={workspaceMode === 'demo'}
            properties={properties}
            calendars={calendars}
            reservations={reservations}
            opportunities={opportunities}
            syncingPropertyId={syncingPropertyId}
            onSaveProperty={handleSaveProperty}
            onDeleteProperty={handleDeleteProperty}
            onTriggerSyncProperty={handleTriggerSyncProperty}
            onSelectOpportunity={(id) => setSelectedOpportunityId(id)}
            onNavigate={setActivePage}
          />
        )}

        {activePage === 'calendar' && (
          <CalendarView
            properties={properties}
            reservations={reservations}
            opportunities={opportunities}
            anchorDateStr={
              workspaceMode === 'demo'
                ? DEMO_REFERENCE_DATE
                : getTodayIsoDateInTimezone(properties[0]?.timezone || 'UTC')
            }
            onSelectOpportunity={(id) => setSelectedOpportunityId(id)}
            onNavigate={setActivePage}
          />
        )}

        {activePage === 'opportunities' && (
          <OpportunitiesView
            properties={properties}
            reservations={reservations}
            opportunities={opportunities}
            selectedOpportunityId={selectedOpportunityId}
            onSelectOpportunity={setSelectedOpportunityId}
            onUpdateOpportunityStatus={handleUpdateOpportunityStatus}
            onLogCopyAction={handleLogCopyAction}
            onNavigate={setActivePage}
          />
        )}

        {activePage === 'strategy' && (
          <AIStrategyCenterView
            properties={properties}
            opportunities={opportunities}
            selectedOpportunityId={selectedOpportunityId}
            onSelectOpportunity={(id) => setSelectedOpportunityId(id)}
            onSaveStrategy={handleSaveStrategy}
            onLogCopyAction={handleLogCopyAction}
          />
        )}

        {activePage === 'analytics' && (
          <RevenueAnalyticsView
            properties={properties}
            opportunities={opportunities}
            actions={actions}
          />
        )}

        {activePage === 'activity' && (
          <ActivityHistoryView
            properties={properties}
            actions={actions}
            syncRuns={syncRuns}
          />
        )}

        {activePage === 'settings' && (
          <SettingsView
            workspaceMode={workspaceMode}
            onChangeWorkspaceMode={setWorkspaceModeOverride}
            onResetDemoData={handleResetDemoData}
            onSimulateSessionExpiry={simulateSessionExpiry}
            onSignOut={() => {
              setWorkspaceModeOverride(null);
              signOut();
            }}
            hostEmail={activeHostLabel}
            hostUserId={user?.id}
          />
        )}
      </AppShellLayout>

      <AuthPreviewModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccessSignIn={async (email, password) => {
          const res = await signIn(email, password);
          if (res.ok) {
            setWorkspaceModeOverride('live_supabase');
            setIsAuthModalOpen(false);
            showToast(res.message);
          } else {
            showToast(res.message);
          }
        }}
      />
    </>
  );
}

export default function GapFillWorkspacePage() {
  return (
    <AuthProvider>
      <ProtectedWorkspaceInner />
    </AuthProvider>
  );
}
