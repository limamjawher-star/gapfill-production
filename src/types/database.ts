import {
  AIStrategyRecommendation,
  CalendarSyncStatus,
  CurrencyCode,
  OpportunityStatus,
  PriorityLabel,
  Property,
  PropertyStatus,
  ReservationStatus,
} from './gapfill';

/**
 * Exact PostgreSQL row representations matching supabase/migrations/001_initial_schema.sql
 */

export interface DbProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  organization_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbPropertyRow {
  id: string;
  owner_id: string;
  name: string;
  property_type: Property['propertyType'];
  city: string;
  country: string;
  timezone: string;
  currency: CurrencyCode;
  default_nightly_rate: number;
  minimum_booking_length: number;
  minimum_acceptable_nightly_price: number;
  maximum_acceptable_discount: number;
  analysis_horizon_days: number;
  status: PropertyStatus;
  created_at: string;
  updated_at: string;
}

/**
 * Notice: owner_id is intentionally omitted from client insert payloads.
 * Database default (auth.uid()) and trigger (enforce_authenticated_owner_id)
 * assign owner_id server-side.
 */
export type DbPropertyInsertPayload = Omit<
  DbPropertyRow,
  'id' | 'owner_id' | 'created_at' | 'updated_at'
> & {
  id?: string;
};

export interface DbCalendarConnectionRow {
  id: string;
  owner_id: string;
  property_id: string;
  source_name: string;
  masked_url_preview: string;
  sync_status: CalendarSyncStatus;
  last_synced_at: string | null;
  last_error_message: string | null;
  events_imported_count: number;
  flagged_ambiguous_count: number;
  created_at: string;
  updated_at: string;
}

export interface DbReservationRow {
  id: string;
  owner_id: string;
  property_id: string;
  source_uid: string;
  check_in_date: string;
  check_out_date: string;
  status: ReservationStatus;
  summary_label: string;
  updated_at: string;
}

export interface DbGapOpportunityRow {
  id: string;
  owner_id: string;
  property_id: string;
  gap_start_date: string;
  gap_end_date: string;
  empty_nights: number;
  base_nightly_rate: number;
  suggested_discount_percent: number;
  suggested_nightly_rate: number;
  estimated_base_gross: number;
  estimated_suggested_gross: number;
  priority_score: number;
  priority_label: PriorityLabel;
  priority_explanations: string[];
  is_min_stay_compatible: boolean;
  status: OpportunityStatus;
  actual_recovered_revenue: number | null;
  filled_at: string | null;
  ai_strategy: AIStrategyRecommendation | null;
  created_at: string;
  updated_at: string;
}

export interface DbGapActionRow {
  id: string;
  owner_id: string;
  opportunity_id: string | null;
  property_id: string;
  action_type: string;
  description: string;
  recovered_amount: number | null;
  created_at: string;
}

export interface DbSyncRunRow {
  id: string;
  owner_id: string;
  property_id: string;
  calendar_connection_id: string;
  started_at: string;
  completed_at: string | null;
  status: 'success' | 'error';
  reservations_upserted: number;
  gaps_recalculated: number;
  message: string | null;
}
