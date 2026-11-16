'use client';

import React, { useState } from 'react';
import { NavigationPageId, WorkspaceDataMode } from '../types/gapfill';
import {
  BarChart3,
  Building2,
  Calendar,
  Compass,
  History,
  Home,
  LogOut,
  Menu,
  Settings,
  Sparkles,
  Tag,
  X,
} from 'lucide-react';

interface AppShellLayoutProps {
  activePage: NavigationPageId;
  onNavigate: (page: NavigationPageId) => void;
  workspaceMode: WorkspaceDataMode;
  onChangeWorkspaceMode: (mode: WorkspaceDataMode) => void;
  hostEmail: string;
  isAuthenticated: boolean;
  supabaseConfigured?: boolean;
  onOpenAuthModal: () => void;
  onSignOut: () => void;
  activeOpportunitiesCount: number;
  children: React.ReactNode;
}

const NAV_ITEMS: {
  id: NavigationPageId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'overview', label: 'Today', icon: Compass },
  { id: 'properties', label: 'Listings', icon: Building2 },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'opportunities', label: 'Opportunities', icon: Tag },
  { id: 'strategy', label: 'AI Pricing', icon: Sparkles },
  { id: 'analytics', label: 'Earnings', icon: BarChart3 },
  { id: 'activity', label: 'Activity', icon: History },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function AppShellLayout({
  activePage,
  onNavigate,
  workspaceMode,
  onChangeWorkspaceMode,
  hostEmail,
  isAuthenticated,
  supabaseConfigured = false,
  onOpenAuthModal,
  onSignOut,
  activeOpportunitiesCount,
  children,
}: AppShellLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-white text-[#222222]">
      {/* Airbnb Host Hub 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-[#EBEBEB] bg-white">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
          {/* Zone 1: Brand Wordmark Only */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#DDDDDD] text-[#222222] transition-colors hover:bg-[#F7F7F7] lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('overview')}
              className="flex items-center gap-2 whitespace-nowrap shrink-0 focus-visible:outline-none"
            >
              <Home className="h-6 w-6 text-[#FF385C]" strokeWidth={2.3} />
              <span className="font-display text-xl font-extrabold tracking-tight text-[#FF385C]">
                gapfill
              </span>
            </button>
          </div>

          {/* Zone 2: Clean Single-Line Airbnb-Style Navigation Tabs */}
          <nav
            aria-label="Main navigation"
            className="hidden h-full items-center gap-6 lg:flex"
          >
            {NAV_ITEMS.map((item) => {
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`relative flex h-full items-center gap-1.5 px-1 text-sm transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'font-semibold text-[#222222]'
                      : 'font-medium text-[#717171] hover:text-[#222222]'
                  }`}
                >
                  <span>{item.label}</span>
                  {item.id === 'opportunities' && activeOpportunitiesCount > 0 && (
                    <span className="font-display text-xs font-semibold text-[#FF385C] tabular-nums">
                      ({activeOpportunitiesCount})
                    </span>
                  )}
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute right-0 bottom-0 left-0 h-0.5 rounded-full bg-[#222222]"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Host Account Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-2 rounded-full border border-[#DDDDDD] bg-white px-4 py-2 text-sm font-medium text-[#222222] transition-shadow hover:shadow-[0_2px_6px_rgba(0,0,0,0.08)] whitespace-nowrap shrink-0"
            >
              <LogOut className="h-3.5 w-3.5 text-[#717171]" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Secondary Host Workspace Context Bar (Below Top Bar) */}
      <div className="border-b border-[#EBEBEB] bg-[#F7F7F7]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-2 text-[#717171]">
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="font-medium text-[#222222] hover:underline"
            >
              {hostEmail}
            </button>
            <span aria-hidden="true">·</span>
            <span>
              {workspaceMode === 'demo'
                ? 'DEMO Sandbox (Locally generated sample listings & fake bookings)'
                : isAuthenticated
                ? supabaseConfigured
                  ? 'Live Host Account (Authenticated tenant workspace)'
                  : 'Live Host Account (Backend setup pending)'
                : 'Live Host Mode'}
            </span>
          </div>

          <div className="hidden items-center gap-1 rounded-full border border-[#DDDDDD] bg-white p-0.5 sm:flex">
            <button
              type="button"
              onClick={() => onChangeWorkspaceMode('demo')}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                workspaceMode === 'demo'
                  ? 'bg-[#222222] text-white'
                  : 'text-[#717171] hover:text-[#222222]'
              }`}
            >
              Demo Sandbox
            </button>
            <button
              type="button"
              onClick={() => onChangeWorkspaceMode('live_supabase')}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                workspaceMode === 'live_supabase'
                  ? 'bg-[#222222] text-white'
                  : 'text-[#717171] hover:text-[#222222]'
              }`}
            >
              Live Account
            </button>
          </div>
        </div>
      </div>

      {/* Persistent Visual DEMO Mode Banner */}
      {workspaceMode === 'demo' && (
        <div
          role="region"
          aria-label="Demo mode banner"
          className="border-b border-[#F5D0C5] bg-[#FFF8F6]"
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-center gap-2.5 text-[#222222]">
              <span className="inline-flex items-center rounded-md bg-[#FF385C] px-2 py-0.5 font-display text-[11px] font-bold tracking-wide text-white uppercase">
                DEMO MODE
              </span>
              <span className="font-medium text-[#222222]">
                Sample listings, fake bookings, and simulated sync events are active for preview only — not live host data.
              </span>
            </div>
            <button
              type="button"
              onClick={() => onChangeWorkspaceMode('live_supabase')}
              className="font-semibold text-[#C13515] underline hover:text-[#FF385C] whitespace-nowrap"
            >
              Switch to Live Account
            </button>
          </div>
        </div>
      )}

      {/* Honest Live Backend Setup Notice when Supabase is not configured */}
      {workspaceMode === 'live_supabase' && !supabaseConfigured && (
        <div
          role="region"
          aria-label="Backend setup required notice"
          className="border-b border-amber-200 bg-amber-50/80"
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-center gap-2 text-[#222222]">
              <span className="inline-flex items-center rounded-md bg-amber-600 px-2 py-0.5 font-display text-[11px] font-bold tracking-wide text-white uppercase">
                SETUP REQUIRED
              </span>
              <span className="font-medium">
                Supabase environment variables are not configured yet. Live database persistence and automated iCal sync are unavailable until setup completes.
              </span>
            </div>
            <div className="flex items-center gap-3 whitespace-nowrap">
              <button
                type="button"
                onClick={() => onNavigate('settings')}
                className="font-semibold text-[#222222] underline hover:text-[#FF385C]"
              >
                Open Setup Guide
              </button>
              <button
                type="button"
                onClick={() => onChangeWorkspaceMode('demo')}
                className="font-semibold text-[#717171] underline hover:text-[#222222]"
              >
                Preview DEMO Mode
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 flex lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
        >
          <div
            className="fixed inset-0 bg-black/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-10 flex w-72 flex-col justify-between bg-white p-5 shadow-2xl">
            <div>
              <div className="flex items-center justify-between border-b border-[#EBEBEB] pb-4">
                <div className="flex items-center gap-2">
                  <Home className="h-5 w-5 text-[#FF385C]" strokeWidth={2.3} />
                  <span className="font-display text-lg font-extrabold tracking-tight text-[#FF385C]">
                    gapfill
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close mobile menu"
                  className="rounded-full p-2 text-[#717171] hover:bg-[#F7F7F7] hover:text-[#222222]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <nav className="mt-4 space-y-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = activePage === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onNavigate(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-sm transition-colors ${
                        isActive
                          ? 'bg-[#FFF1F3] font-semibold text-[#FF385C]'
                          : 'font-medium text-[#222222] hover:bg-[#F7F7F7]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{item.label}</span>
                      </div>
                      {item.id === 'opportunities' && activeOpportunitiesCount > 0 && (
                        <span className="font-display text-xs font-semibold tabular-nums">
                          {activeOpportunitiesCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="space-y-3 border-t border-[#EBEBEB] pt-4">
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#F7F7F7] p-1">
                <button
                  type="button"
                  onClick={() => {
                    onChangeWorkspaceMode('demo');
                    setMobileMenuOpen(false);
                  }}
                  className={`rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
                    workspaceMode === 'demo'
                      ? 'bg-white text-[#222222] shadow-xs'
                      : 'text-[#717171]'
                  }`}
                >
                  DEMO Mode
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChangeWorkspaceMode('live_supabase');
                    setMobileMenuOpen(false);
                  }}
                  className={`rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
                    workspaceMode === 'live_supabase'
                      ? 'bg-white text-[#222222] shadow-xs'
                      : 'text-[#717171]'
                  }`}
                >
                  Live Account
                </button>
              </div>
              <div className="truncate px-1 text-xs font-medium text-[#222222]">
                {hostEmail}
              </div>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onSignOut();
                }}
                className="flex w-full items-center justify-between rounded-xl border border-[#DDDDDD] px-3.5 py-2.5 text-xs font-semibold text-[#222222] hover:bg-[#F7F7F7]"
              >
                <span>Sign Out</span>
                <LogOut className="h-3.5 w-3.5 shrink-0 text-[#717171]" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Canvas */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );
}
