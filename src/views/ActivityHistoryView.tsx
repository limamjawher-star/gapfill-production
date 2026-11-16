'use client';

import React, { useState } from 'react';
import { HostActionLog, Property, SyncRunLog } from '../types/gapfill';
import {
  filterActivityLogs,
  filterSyncRuns,
  formatActivityAuditCsv,
} from '../features/analytics/analyticsEngine';
import { formatPropertyCurrency } from '../features/properties/propertyValidation';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  History,
  Search,
} from 'lucide-react';

interface ActivityHistoryViewProps {
  properties: Property[];
  actions: HostActionLog[];
  syncRuns: SyncRunLog[];
}

export function ActivityHistoryView({
  properties,
  actions,
  syncRuns,
}: ActivityHistoryViewProps) {
  const [activeTab, setActiveTab] = useState<'actions' | 'sync_runs'>('actions');
  const [propertyFilter, setPropertyFilter] = useState<string>('all');
  const [actionTypeFilter, setActionTypeFilter] = useState<string>('all');
  const [syncStatusFilter, setSyncStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filteredActions = filterActivityLogs({
    actions,
    properties,
    propertyId: propertyFilter,
    actionType: actionTypeFilter,
    searchQuery,
  });

  const filteredSyncRuns = filterSyncRuns({
    syncRuns,
    properties,
    propertyId: propertyFilter,
    syncStatus: syncStatusFilter,
    searchQuery,
  });

  const handleExportCsv = () => {
    const csv = formatActivityAuditCsv(filteredActions, properties);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gapfill-activity-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#EBEBEB] bg-white px-6 py-5">
        <div>
          <h2 className="font-display text-lg font-bold text-[#222222]">
            Host Activity &amp; Calendar Sync Log
          </h2>
          <p className="text-xs text-[#717171]">
            Chronological record of host actions, copied messages, confirmed fills, and iCal sync
            runs
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {activeTab === 'actions' && filteredActions.length > 0 && (
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDDDDD] bg-white px-3.5 py-2 text-xs font-medium text-[#222222] transition-colors hover:bg-[#F7F7F7]"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export Audit Log (.csv)</span>
            </button>
          )}

          <div className="flex items-center gap-1 rounded-xl bg-[#F7F7F7] p-1">
            <button
              type="button"
              onClick={() => setActiveTab('actions')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
                activeTab === 'actions'
                  ? 'bg-white text-[#222222] shadow-xs'
                  : 'text-[#717171] hover:text-[#222222]'
              }`}
            >
              Host Actions ({filteredActions.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sync_runs')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
                activeTab === 'sync_runs'
                  ? 'bg-white text-[#222222] shadow-xs'
                  : 'text-[#717171] hover:text-[#222222]'
              }`}
            >
              iCal Sync Runs ({filteredSyncRuns.length})
            </button>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-2xl border border-[#EBEBEB] bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-[#717171]" />
            <input
              type="text"
              aria-label="Search activity logs"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search action description or listing…"
              className="w-full rounded-lg border border-[#DDDDDD] py-2 pr-3 pl-9 text-xs text-[#222222] placeholder:text-[#717171] focus:border-[#222222] focus:outline-none"
            />
          </div>

          <select
            aria-label="Filter logs by property"
            value={propertyFilter}
            onChange={(e) => setPropertyFilter(e.target.value)}
            className="rounded-lg border border-[#DDDDDD] bg-white px-3 py-2 text-xs text-[#222222] focus:border-[#222222] focus:outline-none"
          >
            <option value="all">All Listings</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.currency})
              </option>
            ))}
          </select>

          {activeTab === 'actions' ? (
            <select
              aria-label="Filter by host action type"
              value={actionTypeFilter}
              onChange={(e) => setActionTypeFilter(e.target.value)}
              className="rounded-lg border border-[#DDDDDD] bg-white px-3 py-2 text-xs text-[#222222] focus:border-[#222222] focus:outline-none"
            >
              <option value="all">All Action Types</option>
              <option value="strategy_generated">Strategy Generated</option>
              <option value="message_copied">Message Copied</option>
              <option value="marked_actioned">Marked Actioned</option>
              <option value="marked_filled">Marked Filled (Recovered)</option>
              <option value="opportunity_dismissed">Opportunity Dismissed</option>
              <option value="property_updated">Listing Updated</option>
              <option value="calendar_synced">Calendar Synced</option>
            </select>
          ) : (
            <select
              aria-label="Filter by sync run status"
              value={syncStatusFilter}
              onChange={(e) => setSyncStatusFilter(e.target.value)}
              className="rounded-lg border border-[#DDDDDD] bg-white px-3 py-2 text-xs text-[#222222] focus:border-[#222222] focus:outline-none"
            >
              <option value="all">All Sync Statuses</option>
              <option value="success">Healthy (Success)</option>
              <option value="warning">Warning (Ambiguous Blocks)</option>
              <option value="error">Error (Failed Feed)</option>
            </select>
          )}
        </div>
      </div>

      {activeTab === 'actions' ? (
        <div className="rounded-2xl border border-[#EBEBEB] bg-white">
          {filteredActions.length === 0 ? (
            <div className="p-10 text-center">
              <History className="mx-auto h-7 w-7 text-[#717171]" />
              <p className="mt-2 text-xs text-[#717171]">
                No host actions match your active filters.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#EBEBEB]">
              {filteredActions.map((act) => {
                const prop = properties.find((p) => p.id === act.propertyId);
                return (
                  <div
                    key={act.id}
                    className="flex flex-col justify-between gap-2 px-6 py-4 transition-colors hover:bg-[#F7F7F7]/50 sm:flex-row sm:items-center"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-[#222222]">
                          {prop?.name ?? 'Workspace Action'}
                        </span>
                        <span aria-hidden="true" className="text-[#DDDDDD]">
                          ·
                        </span>
                        <span className="capitalize text-[#717171]">
                          {act.actionType.replace(/_/g, ' ')}
                        </span>
                        {typeof act.recoveredAmount === 'number' && (
                          <>
                            <span aria-hidden="true" className="text-[#DDDDDD]">
                              ·
                            </span>
                            <span className="font-display font-bold text-[#008A05] tabular-nums">
                              +
                              {formatPropertyCurrency(
                                act.recoveredAmount,
                                prop?.currency ?? 'USD'
                              )}{' '}
                              recovered
                            </span>
                          </>
                        )}
                      </div>
                      <p className="text-xs text-[#717171]">{act.description}</p>
                    </div>
                    <div className="shrink-0 text-right font-display text-xs font-medium text-[#717171] tabular-nums">
                      {act.createdAt.slice(0, 10)} · {act.createdAt.slice(11, 16)} UTC
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-[#EBEBEB] bg-white">
          {filteredSyncRuns.length === 0 ? (
            <div className="p-10 text-center">
              <Clock className="mx-auto h-7 w-7 text-[#717171]" />
              <p className="mt-2 text-xs text-[#717171]">
                No synchronization runs match your active filters.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#EBEBEB]">
              {filteredSyncRuns.map((run) => {
                const prop = properties.find((p) => p.id === run.propertyId);
                return (
                  <div
                    key={run.id}
                    className="flex flex-col justify-between gap-2 px-6 py-4 transition-colors hover:bg-[#F7F7F7]/50 sm:flex-row sm:items-center"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {run.status === 'success' ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-[#008A05]" />
                        ) : run.status === 'warning' ? (
                          <AlertTriangle className="h-3.5 w-3.5 text-[#C13515]" />
                        ) : (
                          <AlertCircle className="h-3.5 w-3.5 text-[#FF385C]" />
                        )}
                        <span className="font-semibold text-[#222222]">
                          {prop?.name ?? 'Listing Feed'}
                        </span>
                        <span aria-hidden="true" className="text-[#DDDDDD]">
                          ·
                        </span>
                        <span className="font-display font-medium text-[#717171] tabular-nums">
                          {run.reservationsUpserted} bookings synced · {run.gapsRecalculated} gaps
                          evaluated
                        </span>
                      </div>
                      <p className="text-xs text-[#717171]">{run.message}</p>
                    </div>
                    <div className="shrink-0 text-right font-display text-xs font-medium text-[#717171] tabular-nums">
                      {run.completedAt.slice(0, 10)} · {run.completedAt.slice(11, 16)} UTC
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
