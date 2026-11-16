export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD';

export type PropertyStatus = 'active' | 'inactive';

export type OpportunityStatus =
  | 'new'
  | 'viewed'
  | 'actioned'
  | 'filled'
  | 'expired'
  | 'dismissed';

export type PriorityLabel = 'High priority' | 'Medium priority' | 'Low priority';

export type CalendarSyncStatus = 'healthy' | 'warning' | 'error' | 'never_synced';

export type NavigationPageId =
  | 'overview'
  | 'properties'
  | 'calendar'
  | 'opportunities'
  | 'strategy'
  | 'analytics'
  | 'activity'
  | 'settings';

export type AuthViewMode =
  | 'login'
  | 'signup'
  | 'forgot_password'
  | 'reset_password';

export type WorkspaceDataMode = 'demo' | 'live_supabase';

export interface Property {
  id: string;
  name: string;
  propertyType: 'Apartment' | 'House' | 'Villa' | 'Cabin' | 'Loft' | 'Studio';
  city: string;
  country: string;
  timezone: string; // IANA timezone e.g. 'Europe/Paris', 'America/New_York'
  currency: CurrencyCode;
  defaultNightlyRate: number; // Major currency units, e.g. 220
  minimumBookingLength: number; // e.g. 2 or 3 nights
  minimumAcceptableNightlyPrice: number; // Hard floor price
  maximumAcceptableDiscount: number; // Percentage 0..60
  analysisHorizonDays: number; // e.g. 90 days
  status: PropertyStatus;
  createdAt: string;
}

export interface CalendarConnection {
  id: string;
  propertyId: string;
  sourceName: string; // e.g. 'Airbnb Primary iCal', 'Vrbo Sync'
  maskedUrlPreview: string; // Never expose full secret URL in UI logs
  syncStatus: CalendarSyncStatus;
  lastSyncedAt: string | null;
  lastErrorMessage: string | null;
  eventsImportedCount: number;
  flaggedAmbiguousCount: number;
}

export type ReservationStatus =
  | 'confirmed'
  | 'canceled'
  | 'cancelled'
  | 'blocked'
  | 'ambiguous_block';

export interface Reservation {
  id: string;
  propertyId: string;
  sourceUid: string; // Unique per property_id + source_uid
  checkInDate: string; // YYYY-MM-DD (RFC 5545 DTSTART inclusive)
  checkOutDate: string; // YYYY-MM-DD (RFC 5545 DTEND exclusive)
  status: ReservationStatus;
  summaryLabel: string; // Anonymized label e.g. "Confirmed Booking"
  updatedAt: string;
}

export interface PriorityScoreBreakdown {
  totalScore: number; // 0 - 100
  label: PriorityLabel;
  timeUntilGapPoints: number; // max 30
  gapLengthPoints: number; // max 25
  estimatedRevenuePoints: number; // max 20
  minStayCompatibilityPoints: number; // max 15
  calendarFreshnessPoints: number; // max 10
  explanations: string[];
}

export interface GapFinancialCalculation {
  emptyNights: number;
  baseNightlyRate: number;
  recommendedDiscountPercent: number;
  maxAllowedDiscountPercent: number;
  minimumAcceptableRate: number;
  baseGross: number;
  suggestedNightlyRate: number;
  suggestedGross: number;
  floorPriceEnforced: boolean;
}

export type StrategyFocusMode =
  | 'balanced'
  | 'guest_extension'
  | 'direct_promo';

export interface AIStrategyRecommendation {
  generatedAt: string;
  source: 'gemini-free-tier' | 'rule-based-fallback';
  modelUsed?: string;
  strategyFocus?: StrategyFocusMode;
  fallbackReason?: string;
  shortOpportunityExplanation: string;
  pricingStrategy: string;
  minimumStayRecommendation: string;
  guestExtensionMessage: string;
  socialMediaCaption: string;
  marketingRecommendation: string;
  relevantCautions: string[];
}

export interface GapOpportunity {
  id: string;
  propertyId: string;
  gapStartDate: string; // YYYY-MM-DD (first empty night, equals previous booking checkout)
  gapEndDate: string; // YYYY-MM-DD (checkout morning of gap, equals next booking check-in)
  emptyNights: number;
  daysUntilStart: number;
  previousReservationId: string;
  nextReservationId: string;
  isMinStayCompatible: boolean;
  minStayRequired: number;
  financials: GapFinancialCalculation;
  priority: PriorityScoreBreakdown;
  status: OpportunityStatus;
  actualRecoveredRevenue: number | null;
  filledAt: string | null;
  strategy?: AIStrategyRecommendation;
}

export interface HostActionLog {
  id: string;
  opportunityId: string;
  propertyId: string;
  actionType:
    | 'strategy_generated'
    | 'message_copied'
    | 'offer_sent'
    | 'marked_actioned'
    | 'marked_filled'
    | 'opportunity_dismissed'
    | 'calendar_synced'
    | 'property_updated';
  description: string;
  recoveredAmount?: number;
  createdAt: string;
}

export interface SyncRunLog {
  id: string;
  propertyId: string;
  calendarConnectionId: string;
  startedAt: string;
  completedAt: string;
  status: 'success' | 'warning' | 'error';
  reservationsUpserted: number;
  gapsRecalculated: number;
  message: string;
}
