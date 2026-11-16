'use client';

import React, { useState } from 'react';
import { getSupabaseStatusSummary } from '../lib/supabase';
import { WorkspaceDataMode } from '../types/gapfill';
import { DeploymentReadinessReport } from '../features/deployment/readinessCheck';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Copy,
  Database,
  KeyRound,
  Lock,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Terminal,
} from 'lucide-react';

interface SettingsViewProps {
  workspaceMode: WorkspaceDataMode;
  onChangeWorkspaceMode: (mode: WorkspaceDataMode) => void;
  onResetDemoData: () => void;
  onSimulateSessionExpiry?: () => void;
  onSignOut?: () => void;
  hostEmail?: string;
  hostUserId?: string;
}

const SCHEMA_TABLES_AUDIT = [
  {
    table: 'public.profiles',
    rlsPolicy: 'SELECT / UPDATE where auth.uid() = id',
    indexes: 'PRIMARY KEY (id)',
    clientOwnerIdIgnored: 'Auto-created via auth.users trigger (handle_new_user)',
  },
  {
    table: 'public.properties',
    rlsPolicy: 'ALL where auth.uid() = owner_id',
    indexes: 'idx_properties_owner_id, idx_properties_owner_status',
    clientOwnerIdIgnored: 'Enforced by trg_properties_enforce_owner',
  },
  {
    table: 'public.calendar_connections',
    rlsPolicy: 'ALL where auth.uid() = owner_id + property ownership check',
    indexes: 'idx_calendar_connections_property',
    clientOwnerIdIgnored: 'Enforced by trg_calendar_connections_enforce_owner',
  },
  {
    table: 'private.calendar_secrets',
    rlsPolicy: 'REVOKE ALL from public, anon, authenticated (No Data API exposure)',
    indexes: 'PRIMARY KEY (calendar_connection_id)',
    clientOwnerIdIgnored: 'Server-only access via upsert_property_calendar_connection RPC',
  },
  {
    table: 'public.reservations',
    rlsPolicy: 'ALL where auth.uid() = owner_id',
    indexes: 'uq_reservations_property_uid, idx_reservations_property_dates',
    clientOwnerIdIgnored: 'Enforced by trg_reservations_enforce_owner',
  },
  {
    table: 'public.gap_opportunities',
    rlsPolicy: 'ALL where auth.uid() = owner_id',
    indexes: 'uq_gap_property_dates, idx_gap_opportunities_filter_grid',
    clientOwnerIdIgnored: 'Enforced by trg_gap_opportunities_enforce_owner',
  },
  {
    table: 'public.gap_actions',
    rlsPolicy: 'ALL where auth.uid() = owner_id',
    indexes: 'idx_gap_actions_owner_created',
    clientOwnerIdIgnored: 'Enforced by trg_gap_actions_enforce_owner',
  },
  {
    table: 'public.sync_runs',
    rlsPolicy: 'SELECT where auth.uid() = owner_id',
    indexes: 'idx_sync_runs_owner_started',
    clientOwnerIdIgnored: 'Written by sync-calendar Edge Function',
  },
];

export function SettingsView({
  workspaceMode,
  onChangeWorkspaceMode,
  onResetDemoData,
  onSimulateSessionExpiry,
  onSignOut,
  hostEmail,
  hostUserId,
}: SettingsViewProps) {
  const status = getSupabaseStatusSummary();
  const [copiedMigration, setCopiedMigration] = useState<string | null>(null);
  const [healthReport, setHealthReport] = useState<{
    status: string;
    freeTierModel: string;
    icalParser: string;
    timestamp: string;
    summary: DeploymentReadinessReport;
  } | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  const handleCopyCommand = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback in headless context
    }
    setCopiedMigration(label);
    setTimeout(() => setCopiedMigration(null), 2000);
  };

  const handleRunHealthCheck = async () => {
    setIsCheckingHealth(true);
    setHealthError(null);
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Health endpoint returned HTTP ${response.status}`);
      }
      const data = await response.json();
      setHealthReport(data);
    } catch (err) {
      setHealthError(
        err instanceof Error ? err.message : 'Unable to reach /api/health'
      );
    } finally {
      setIsCheckingHealth(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Host Workspace & Environment Card */}
      <div className="rounded-2xl border border-[#EBEBEB] bg-white p-6">
        <h2 className="font-display text-lg font-bold text-[#222222]">
          Host Workspace &amp; Account Isolation
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-[#717171]">
          Demo listings stay strictly isolated from live host accounts. When connected in Live
          Account mode, every listing, iCal URL, and revenue ledger is encrypted and scoped solely
          to your authenticated host ID.
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-[#EBEBEB] pt-5">
          <div className="space-y-1 text-xs">
            <div className="font-semibold text-[#222222]">
              Active Session: {hostEmail ?? 'Host Workspace'}{' '}
              {hostUserId && (
                <span className="font-mono text-[11px] font-normal text-[#717171]">
                  ({hostUserId})
                </span>
              )}
            </div>
            <div className="text-[#717171]">
              {workspaceMode === 'demo'
                ? 'Isolated Demo Sandbox (3 sample Airbnb listings, safe test data)'
                : 'Live Host Account (Private per-host Row-Level Security enforced)'}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onChangeWorkspaceMode('demo')}
              className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
                workspaceMode === 'demo'
                  ? 'bg-[#222222] text-white'
                  : 'border border-[#DDDDDD] bg-white text-[#222222] hover:bg-[#F7F7F7]'
              }`}
            >
              Demo Environment
            </button>
            <button
              type="button"
              onClick={() => onChangeWorkspaceMode('live_supabase')}
              className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
                workspaceMode === 'live_supabase'
                  ? 'bg-[#FF385C] text-white'
                  : 'border border-[#DDDDDD] bg-white text-[#222222] hover:bg-[#F7F7F7]'
              }`}
            >
              Live Supabase Mode
            </button>
            {workspaceMode === 'demo' && (
              <button
                type="button"
                onClick={onResetDemoData}
                className="rounded-lg border border-[#DDDDDD] bg-white px-3.5 py-2 text-xs font-medium text-[#222222] transition-colors hover:bg-[#F7F7F7]"
              >
                Reset Demo State
              </button>
            )}
            {onSimulateSessionExpiry && (
              <button
                type="button"
                onClick={onSimulateSessionExpiry}
                className="rounded-lg border border-[#F5D0C5] bg-[#FFF8F6] px-3.5 py-2 text-xs font-medium text-[#C13515] transition-colors hover:bg-[#FFEFEA]"
              >
                Test Expired Session Gate
              </button>
            )}
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className="rounded-lg border border-[#DDDDDD] bg-white px-3.5 py-2 text-xs font-medium text-[#222222] transition-colors hover:bg-[#F7F7F7]"
              >
                Sign Out
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Host Privacy & Security Trust Strip */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-[#EBEBEB] bg-white p-5">
          <div className="flex items-center gap-2 font-display text-xs font-bold text-[#222222]">
            <Database className="h-4 w-4 text-[#FF385C]" />
            <span>Isolated Host Database</span>
          </div>
          <div className="mt-2 font-mono text-[11px] text-[#717171]">
            {status.projectUrlPreview}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-[#717171]">
            Browser sessions use strictly scoped anonymous tokens protected by Row-Level Security.
            Service credentials never leave the server.
          </p>
        </div>

        <div className="rounded-2xl border border-[#EBEBEB] bg-white p-5">
          <div className="flex items-center gap-2 font-display text-xs font-bold text-[#222222]">
            <ShieldCheck className="h-4 w-4 text-[#008A05]" />
            <span>Verified Host Ownership Guard</span>
          </div>
          <div className="mt-2 font-mono text-[11px] text-[#717171]">
            enforce_authenticated_owner_id()
          </div>
          <p className="mt-2 text-xs leading-relaxed text-[#717171]">
            Every listing write binds directly to your signed-in host session, blocking
            cross-account tampering on inserts and updates.
          </p>
        </div>

        <div className="rounded-2xl border border-[#EBEBEB] bg-white p-5">
          <div className="flex items-center gap-2 font-display text-xs font-bold text-[#222222]">
            <KeyRound className="h-4 w-4 text-[#C13515]" />
            <span>Private Airbnb iCal Link Vault</span>
          </div>
          <div className="mt-2 font-mono text-[11px] text-[#717171]">
            private.calendar_secrets
          </div>
          <p className="mt-2 text-xs leading-relaxed text-[#717171]">
            Private Airbnb iCal export links are stored outside the public Data API schema and
            fetched only by server sync workers.
          </p>
        </div>
      </div>

      {/* Free-Tier Deployment & Host Pilot Readiness */}
      <div className="space-y-4 rounded-2xl border border-[#EBEBEB] bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-display text-base font-bold text-[#222222]">
              <Rocket className="h-4 w-4 text-[#008A05]" />
              <span>Deployment &amp; Host Pilot Readiness</span>
            </div>
            <p className="mt-1 text-xs text-[#717171]">
              Verify live server readiness across RFC 5545 iCal sync, Gemini free-tier strategy (
              <code className="font-mono text-[#222222]">gemini-4-hydrogen</code>), Supabase RLS,
              and zero paid SaaS dependencies.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRunHealthCheck}
            disabled={isCheckingHealth}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#FF385C] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#E00B41] disabled:opacity-60"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isCheckingHealth ? 'animate-spin' : ''}`}
            />
            <span>
              {isCheckingHealth
                ? 'Checking /api/health...'
                : 'Run Live Health Check (/api/health)'}
            </span>
          </button>
        </div>

        {healthError && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-xl border border-[#F5D0C5] bg-[#FFF8F6] px-4 py-3 text-xs text-[#C13515]"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-[#FF385C]" />
            <span>{healthError}</span>
          </div>
        )}

        {healthReport && (
          <div className="space-y-3 border-t border-[#EBEBEB] pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 font-semibold text-[#222222]">
                <Activity className="h-4 w-4 text-[#008A05]" />
                <span>
                  Health Status:{' '}
                  <span className="font-mono uppercase text-[#008A05]">
                    {healthReport.status}
                  </span>
                </span>
                <span className="rounded-md bg-[#F7F7F7] px-2.5 py-0.5 text-[11px] font-medium text-[#222222]">
                  {healthReport.summary.overallStatus === 'ready_for_host_pilot'
                    ? 'Ready for Host Pilot'
                    : 'Ready with Local Fallbacks'}
                </span>
              </div>
              <div className="font-mono text-[11px] text-[#717171]">
                Model: {healthReport.freeTierModel} · Parser: {healthReport.icalParser} · $0 Budget
                Compliant
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {healthReport.summary.checks.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-[#EBEBEB] bg-[#F7F7F7] p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#222222]">{item.label}</span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                        item.status === 'ready'
                          ? 'border-[#B7DFBA] bg-[#EBF7EC] text-[#006B04]'
                          : 'border-[#F5D0C5] bg-[#FFF8F6] text-[#C13515]'
                      }`}
                    >
                      {item.status === 'ready' ? (
                        <CheckCircle2 className="h-3 w-3 text-[#008A05]" />
                      ) : (
                        <AlertTriangle className="h-3 w-3 text-[#C13515]" />
                      )}
                      <span>
                        {item.status === 'ready'
                          ? 'Ready'
                          : item.status === 'fallback_active'
                          ? 'Fallback Active'
                          : 'Pending Env'}
                      </span>
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-[#717171]">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Collapsible Developer Technical Reference (Schema, RLS & CLI) */}
      <details className="group rounded-2xl border border-[#EBEBEB] bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-4 text-left">
          <div>
            <div className="font-display text-sm font-bold text-[#222222]">
              Developer Technical Reference: Database Tables, Indexes &amp; RLS
            </div>
            <p className="mt-0.5 text-xs text-[#717171]">
              7 isolated host tables + 1 private iCal vault, migration SQL paths, and Supabase CLI
              commands
            </p>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-[#717171] transition-transform group-open:rotate-180" />
        </summary>

        <div className="space-y-5 border-t border-[#EBEBEB] px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#222222]">
              <Terminal className="h-4 w-4 text-[#717171]" />
              <span>Supabase Migrations &amp; RLS Matrix</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  handleCopyCommand('001', 'supabase/migrations/001_initial_schema.sql')
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDDDDD] bg-white px-3 py-1.5 text-xs font-medium text-[#222222] hover:bg-[#F7F7F7]"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>
                  {copiedMigration === '001'
                    ? 'Copied 001 Path'
                    : 'Migration 001: Tables & RLS'}
                </span>
              </button>
              <button
                type="button"
                onClick={() =>
                  handleCopyCommand('002', 'supabase/migrations/002_rls_and_triggers.sql')
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDDDDD] bg-white px-3 py-1.5 text-xs font-medium text-[#222222] hover:bg-[#F7F7F7]"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>
                  {copiedMigration === '002'
                    ? 'Copied 002 Path'
                    : 'Migration 002: Triggers & RPC'}
                </span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#EBEBEB]">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#EBEBEB] bg-[#F7F7F7] text-[#717171]">
                  <th className="px-4 py-3 font-medium">Schema &amp; Table</th>
                  <th className="px-4 py-3 font-medium">Row-Level Security Policy</th>
                  <th className="px-4 py-3 font-medium">Database Indexes</th>
                  <th className="px-4 py-3 font-medium">Server Ownership Enforcement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBEBEB]">
                {SCHEMA_TABLES_AUDIT.map((row) => (
                  <tr key={row.table} className="hover:bg-[#F7F7F7]/60">
                    <td className="px-4 py-3 font-mono font-medium text-[#222222]">
                      <div className="flex items-center gap-1.5">
                        {row.table.startsWith('private.') ? (
                          <Lock className="h-3.5 w-3.5 text-[#C13515]" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5 text-[#008A05]" />
                        )}
                        <span>{row.table}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#222222]">{row.rlsPolicy}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-[#717171]">
                      {row.indexes}
                    </td>
                    <td className="px-4 py-3 text-[#717171]">{row.clientOwnerIdIgnored}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#EBEBEB] bg-[#F7F7F7] px-4 py-3 text-xs">
            <div className="font-mono text-[11px] text-[#222222]">
              supabase db push &amp;&amp; supabase functions deploy sync-calendar &amp;&amp;
              supabase functions deploy generate-strategy
            </div>
            <button
              type="button"
              onClick={() =>
                handleCopyCommand(
                  'deploy_cli',
                  'supabase db push && supabase functions deploy sync-calendar && supabase functions deploy generate-strategy'
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDDDDD] bg-white px-3 py-1.5 text-xs font-medium text-[#222222] hover:bg-white/80"
            >
              <Copy className="h-3 w-3" />
              <span>
                {copiedMigration === 'deploy_cli' ? 'Copied CLI' : 'Copy CLI Deploy'}
              </span>
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}
