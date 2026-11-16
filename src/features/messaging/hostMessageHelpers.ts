import { formatPropertyCurrency } from '../properties/propertyValidation';
import { GapOpportunity, Property } from '../../types/gapfill';

export type HostOutreachTarget =
  | 'departing_extension'
  | 'arriving_early'
  | 'direct_promo';

/**
 * Deterministically drafts a warm, trustworthy Airbnb-ready host outreach message
 * tailored to the adjacent guest or repeat guest without exposing private PII.
 */
export function buildAirbnbHostOutreachDraft(params: {
  target: HostOutreachTarget;
  property: Property;
  opportunity: GapOpportunity;
  overrideNightlyRate?: number;
}): string {
  const { target, property, opportunity, overrideNightlyRate } = params;
  const nightlyRate =
    overrideNightlyRate ?? opportunity.financials.suggestedNightlyRate;
  const formattedNightly = formatPropertyCurrency(nightlyRate, property.currency);
  const formattedTotal = formatPropertyCurrency(
    nightlyRate * opportunity.emptyNights,
    property.currency
  );
  const nightWord = opportunity.emptyNights === 1 ? 'night' : 'nights';

  if (target === 'departing_extension') {
    return `Hi! We hope you're looking forward to your stay at ${property.name}. Because the calendar right after your checkout (${opportunity.gapStartDate} to ${opportunity.gapEndDate}) is currently open, we'd love to offer you ${opportunity.emptyNights} extra ${nightWord} at a preferred host rate of ${formattedNightly}/night (${formattedTotal} total) with zero extra cleaning or turnover fee. Let me know if you'd like me to send a quick Airbnb alteration request!`;
  }

  if (target === 'arriving_early') {
    return `Hi! Ahead of your upcoming arrival on ${opportunity.gapEndDate}, ${property.name} happens to be open right beforehand from ${opportunity.gapStartDate} to ${opportunity.gapEndDate} (${opportunity.emptyNights} ${nightWord}). If you'd like to settle in early and unwind with no additional turnover fee, I can open those ${nightWord} for you at a preferred rate of ${formattedNightly}/night (${formattedTotal} total). Just reply here if interested!`;
  }

  return `Rare open calendar window at ${property.name} in ${property.city}: ${opportunity.gapStartDate} – ${opportunity.gapEndDate} (${opportunity.emptyNights} ${nightWord}). Book directly between stays at ${formattedNightly}/night (${formattedTotal} total) — reach out to reserve before the window closes.`;
}

export function sanitizeEditableDraft(input: string): string {
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
}
