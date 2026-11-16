'use client';

import React, { useState } from 'react';
import {
  AIStrategyRecommendation,
  GapOpportunity,
  Property,
  StrategyFocusMode,
} from '../types/gapfill';
import { buildRuleBasedStrategy } from '../utils/engines';
import {
  buildAnonymizedStrategyPayload,
  detectPiiOrDisallowedKeys,
} from '../features/strategy/strategyService';
import { formatPropertyCurrency } from '../features/properties/propertyValidation';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

interface AIStrategyCenterViewProps {
  properties: Property[];
  opportunities: GapOpportunity[];
  selectedOpportunityId: string | null;
  onSelectOpportunity: (id: string) => void;
  onSaveStrategy: (opportunityId: string, strategy: AIStrategyRecommendation) => void;
  onLogCopyAction: (opportunityId: string, description: string) => void;
}

export function AIStrategyCenterView({
  properties,
  opportunities,
  selectedOpportunityId,
  onSelectOpportunity,
  onSaveStrategy,
  onLogCopyAction,
}: AIStrategyCenterViewProps) {
  const [strategyFocus, setStrategyFocus] = useState<StrategyFocusMode>('balanced');
  const [isGenerating, setIsGenerating] = useState(false);
  const [noticeBanner, setNoticeBanner] = useState<{
    kind: 'success' | 'fallback';
    message: string;
  } | null>(null);
  const [rateLimitRemaining, setRateLimitRemaining] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const activeOpp =
    opportunities.find((o) => o.id === selectedOpportunityId) ??
    opportunities[0] ??
    null;

  const activeProp = activeOpp
    ? properties.find((p) => p.id === activeOpp.propertyId) ?? null
    : null;

  const anonymizedPayload =
    activeOpp && activeProp
      ? buildAnonymizedStrategyPayload(activeProp, activeOpp, strategyFocus)
      : null;

  const piiAudit = anonymizedPayload
    ? detectPiiOrDisallowedKeys(anonymizedPayload as unknown as Record<string, unknown>)
    : { safe: true, violations: [] };

  const serializedPayload = anonymizedPayload
    ? JSON.stringify(anonymizedPayload, null, 2)
    : '';

  const handleGenerateStrategy = async () => {
    if (!activeOpp || !activeProp || !anonymizedPayload) return;
    setIsGenerating(true);
    setNoticeBanner(null);

    try {
      const res = await fetch('/api/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(anonymizedPayload),
      });

      const remainingHeader = res.headers.get('X-RateLimit-Remaining');
      if (remainingHeader !== null) {
        setRateLimitRemaining(remainingHeader);
      }

      if (res.ok) {
        const data = (await res.json()) as AIStrategyRecommendation;
        onSaveStrategy(activeOpp.id, data);
        setNoticeBanner({
          kind: 'success',
          message: `Strategy generated via server-side Gemini (${
            data.modelUsed ?? 'gemini-4-hydrogen'
          }) with zero guest data shared.`,
        });
      } else {
        let serverReason = `Server returned HTTP ${res.status}.`;
        try {
          const errBody = (await res.json()) as { error?: string };
          if (errBody.error) {
            serverReason = errBody.error;
          }
        } catch {
          // Ignore malformed error body
        }

        const fallback = {
          ...buildRuleBasedStrategy(activeProp, activeOpp),
          strategyFocus,
          fallbackReason: serverReason,
        };
        onSaveStrategy(activeOpp.id, fallback);
        setNoticeBanner({
          kind: 'fallback',
          message: `${serverReason} Applied deterministic rule-based pricing guidance instead.`,
        });
      }
    } catch {
      const fallback = {
        ...buildRuleBasedStrategy(activeProp, activeOpp),
        strategyFocus,
        fallbackReason: 'Network error communicating with /api/strategy.',
      };
      onSaveStrategy(activeOpp.id, fallback);
      setNoticeBanner({
        kind: 'fallback',
        message: 'Unable to reach /api/strategy — applied rule-based host pricing strategy.',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyText = async (label: string, content: string) => {
    if (!activeOpp) return;
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      // Clipboard fallback
    }
    setCopiedField(label);
    onLogCopyAction(activeOpp.id, `Copied ${label} from AI Pricing Center`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (!activeOpp || !activeProp) {
    return (
      <div className="rounded-2xl border border-[#EBEBEB] bg-white p-10 text-center">
        <Sparkles className="mx-auto h-8 w-8 text-[#FF385C]" />
        <h3 className="mt-3 font-display text-base font-bold text-[#222222]">
          No Opportunity Selected
        </h3>
        <p className="mt-1 text-xs text-[#717171]">
          Connect a listing and sync your Airbnb calendar first to detect open nights.
        </p>
      </div>
    );
  }

  const currentStrategy =
    activeOpp.strategy ?? buildRuleBasedStrategy(activeProp, activeOpp);

  return (
    <div className="space-y-6">
      {/* Header & Generator Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#EBEBEB] bg-white px-6 py-5">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#222222]">
            AI Pricing &amp; Guest Messaging Assistant
          </h1>
          <p className="mt-1 text-sm text-[#717171]">
            Generates tailored minimum-stay adjustments and Airbnb guest outreach while keeping
            guest details and private calendar links strictly off-limits.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Select opportunity for AI strategy"
            value={activeOpp.id}
            onChange={(e) => onSelectOpportunity(e.target.value)}
            className="rounded-lg border border-[#DDDDDD] bg-white px-3 py-2 text-xs text-[#222222] focus:border-[#222222] focus:outline-hidden"
          >
            {opportunities.map((opp) => {
              const p = properties.find((item) => item.id === opp.propertyId);
              return (
                <option key={opp.id} value={opp.id}>
                  {p?.name}: {opp.gapStartDate} → {opp.gapEndDate} ({opp.emptyNights}n ·{' '}
                  {formatPropertyCurrency(
                    opp.financials.suggestedGross,
                    p?.currency ?? 'USD'
                  )}
                  )
                </option>
              );
            })}
          </select>

          <select
            aria-label="Select strategy focus"
            value={strategyFocus}
            onChange={(e) => setStrategyFocus(e.target.value as StrategyFocusMode)}
            className="rounded-lg border border-[#DDDDDD] bg-white px-3 py-2 text-xs text-[#222222] focus:border-[#222222] focus:outline-hidden"
          >
            <option value="balanced">Focus: Balanced Conversion</option>
            <option value="guest_extension">Focus: Adjacent Guest Extension</option>
            <option value="direct_promo">Focus: Direct / Social Outreach</option>
          </select>

          <button
            type="button"
            onClick={handleGenerateStrategy}
            disabled={isGenerating || !piiAudit.safe}
            className="inline-flex items-center gap-2 rounded-lg bg-[#FF385C] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#E00B41] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
            <span>{isGenerating ? 'Generating Strategy…' : 'Generate Strategy'}</span>
          </button>
        </div>
      </div>

      {noticeBanner && (
        <div
          role="status"
          className={`flex items-center gap-2.5 rounded-2xl border px-4 py-3 text-xs ${
            noticeBanner.kind === 'success'
              ? 'border-[#008A05]/30 bg-[#F2FAF3] text-[#008A05]'
              : 'border-[#F59E0B]/40 bg-[#FFF8EB] text-[#92400E]'
          }`}
        >
          {noticeBanner.kind === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          )}
          <span>{noticeBanner.message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left 8 cols: Structured Recommendations */}
        <div className="space-y-4 lg:col-span-8">
          <div className="space-y-5 rounded-2xl border border-[#EBEBEB] bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EBEBEB] pb-4">
              <div>
                <h2 className="font-display text-base font-bold text-[#222222]">
                  {activeProp.name} ({activeOpp.gapStartDate} → {activeOpp.gapEndDate})
                </h2>
                <p className="text-xs text-[#717171]">
                  Source:{' '}
                  <span className="font-medium text-[#222222]">
                    {currentStrategy.source === 'gemini-free-tier'
                      ? `Gemini Free-Tier (${currentStrategy.modelUsed ?? 'gemini-4-hydrogen'})`
                      : 'Deterministic Rule Engine'}
                  </span>
                  {rateLimitRemaining !== null && (
                    <span className="ml-2 text-[#717171]">
                      · Free-tier headroom: {rateLimitRemaining}/15 req
                    </span>
                  )}
                </p>
              </div>
              <div className="font-display text-xs font-bold text-[#FF385C] tabular-nums">
                Locked Rate:{' '}
                {formatPropertyCurrency(
                  activeOpp.financials.suggestedNightlyRate,
                  activeProp.currency
                )}
                /nt · Est. Gross{' '}
                {formatPropertyCurrency(
                  activeOpp.financials.suggestedGross,
                  activeProp.currency
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-[#222222]">
                  1. Why This Gap Happened
                </div>
                <p className="text-xs leading-relaxed text-[#717171]">
                  {currentStrategy.shortOpportunityExplanation}
                </p>
              </div>
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-[#222222]">
                  2. Pricing Guidance (Floor Protected)
                </div>
                <p className="text-xs leading-relaxed text-[#717171]">
                  {currentStrategy.pricingStrategy}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 border-t border-[#EBEBEB] pt-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-[#222222]">
                  3. Minimum-Stay Adjustment
                </div>
                <p className="text-xs leading-relaxed text-[#717171]">
                  {currentStrategy.minimumStayRecommendation}
                </p>
              </div>
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-[#222222]">
                  4. Outreach Timing &amp; Channel
                </div>
                <p className="text-xs leading-relaxed text-[#717171]">
                  {currentStrategy.marketingRecommendation}
                </p>
              </div>
            </div>

            <div className="space-y-2 border-t border-[#EBEBEB] pt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#222222]">
                  5. Ready-to-Send Airbnb Guest Extension Message
                </span>
                <button
                  type="button"
                  onClick={() =>
                    handleCopyText(
                      'Guest Extension Message',
                      currentStrategy.guestExtensionMessage
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-[#DDDDDD] px-3 py-1.5 text-xs font-semibold text-[#222222] hover:bg-[#F7F7F7]"
                >
                  <Copy className="h-3 w-3" />
                  <span>
                    {copiedField === 'Guest Extension Message' ? 'Copied!' : 'Copy Message'}
                  </span>
                </button>
              </div>
              <div className="rounded-xl bg-[#F7F7F7] p-4 text-xs leading-relaxed text-[#222222]">
                {currentStrategy.guestExtensionMessage}
              </div>
            </div>

            <div className="space-y-2 border-t border-[#EBEBEB] pt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#222222]">
                  6. Direct Booking / Social Media Caption
                </span>
                <button
                  type="button"
                  onClick={() =>
                    handleCopyText(
                      'Social Media Caption',
                      currentStrategy.socialMediaCaption
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-[#DDDDDD] px-3 py-1.5 text-xs font-semibold text-[#222222] hover:bg-[#F7F7F7]"
                >
                  <Copy className="h-3 w-3" />
                  <span>
                    {copiedField === 'Social Media Caption' ? 'Copied!' : 'Copy Caption'}
                  </span>
                </button>
              </div>
              <div className="rounded-xl bg-[#F7F7F7] p-4 text-xs leading-relaxed text-[#222222]">
                {currentStrategy.socialMediaCaption}
              </div>
            </div>

            <div className="space-y-2 border-t border-[#EBEBEB] pt-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#B45309]">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>7. Host Guardrails &amp; Cautions</span>
              </div>
              <ul className="space-y-1 text-xs text-[#717171]">
                {currentStrategy.relevantCautions.map((caution, idx) => (
                  <li key={idx}>• {caution}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Right 4 cols: Zero-PII Privacy Contract */}
        <div className="space-y-4 lg:col-span-4">
          <div className="rounded-2xl border border-[#EBEBEB] bg-white p-6">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#222222]">
                <ShieldCheck className="h-4 w-4 text-[#008A05]" />
                <span>Zero-PII AI Privacy Shield</span>
              </div>
              <span className="text-xs font-semibold text-[#008A05]">
                {piiAudit.safe ? '0 PII fields · Verified' : 'Violation Blocked'}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[#717171]">
              Listing titles, guest names, emails, reservation IDs, and iCal URLs are stripped
              before calling our server-side strategy API.
            </p>

            <div className="mt-4">
              <div className="flex items-center justify-between text-xs font-semibold text-[#222222]">
                <span>Anonymized Outbound Payload</span>
                <span className="font-mono text-[11px] font-normal text-[#717171]">
                  {serializedPayload.length} bytes
                </span>
              </div>
              <pre className="mt-2 overflow-x-auto rounded-xl bg-[#222222] p-3.5 font-mono text-[11px] leading-relaxed text-white/90">
                {serializedPayload}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
