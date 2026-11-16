-- GapFill Multi-Tenant Database Schema & Row-Level Security (RLS)
-- Stage 3 Specification Ready for Supabase PostgreSQL

create extension if not exists "pgcrypto";

-- Isolated private schema for raw iCal URLs (never exposed via PostgREST Data API)
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- 1. Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  organization_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 2. Properties
create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) >= 2),
  property_type text not null default 'Apartment',
  city text not null,
  country text not null,
  timezone text not null,
  currency text not null default 'USD' check (char_length(currency) = 3),
  default_nightly_rate numeric(10,2) not null check (default_nightly_rate > 0),
  minimum_booking_length integer not null default 2 check (minimum_booking_length >= 1 and minimum_booking_length <= 30),
  minimum_acceptable_nightly_price numeric(10,2) not null check (minimum_acceptable_nightly_price > 0),
  maximum_acceptable_discount numeric(5,2) not null default 20 check (maximum_acceptable_discount >= 0 and maximum_acceptable_discount <= 80),
  analysis_horizon_days integer not null default 90 check (analysis_horizon_days >= 14 and analysis_horizon_days <= 365),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_properties_owner_id on public.properties(owner_id);
alter table public.properties enable row level security;

create policy "Hosts manage own properties"
  on public.properties for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- 3. Calendar Connections (Public metadata only; raw URL in private.calendar_secrets)
create table if not exists public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  source_name text not null default 'Airbnb iCal',
  masked_url_preview text not null,
  sync_status text not null default 'never_synced' check (sync_status in ('healthy', 'warning', 'error', 'never_synced')),
  last_synced_at timestamptz,
  last_error_message text,
  events_imported_count integer not null default 0,
  flagged_ambiguous_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_calendar_connections_property on public.calendar_connections(property_id);
alter table public.calendar_connections enable row level security;

create policy "Hosts manage own calendar connections"
  on public.calendar_connections for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- 4. Private Calendar Secrets (Never exposed to client API)
create table if not exists private.calendar_secrets (
  calendar_connection_id uuid primary key references public.calendar_connections(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  raw_ical_url text not null check (raw_ical_url like 'https://%'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. Reservations (Deduplicated by property_id + source_uid)
create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  source_uid text not null,
  check_in_date date not null,
  check_out_date date not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'canceled')),
  summary_label text not null default 'Reserved',
  updated_at timestamptz not null default now(),
  constraint uq_reservations_property_uid unique (property_id, source_uid),
  constraint chk_reservation_dates check (check_out_date > check_in_date)
);

create index if not exists idx_reservations_property_dates on public.reservations(property_id, check_in_date, check_out_date);
alter table public.reservations enable row level security;

create policy "Hosts manage own reservations"
  on public.reservations for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- 6. Gap Opportunities
create table if not exists public.gap_opportunities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  gap_start_date date not null,
  gap_end_date date not null,
  empty_nights integer not null check (empty_nights > 0),
  base_nightly_rate numeric(10,2) not null,
  suggested_discount_percent numeric(5,2) not null,
  suggested_nightly_rate numeric(10,2) not null,
  estimated_base_gross numeric(10,2) not null,
  estimated_suggested_gross numeric(10,2) not null,
  priority_score integer not null check (priority_score >= 0 and priority_score <= 100),
  priority_label text not null,
  priority_explanations jsonb not null default '[]'::jsonb,
  is_min_stay_compatible boolean not null default true,
  status text not null default 'new' check (status in ('new', 'viewed', 'actioned', 'filled', 'expired', 'dismissed')),
  actual_recovered_revenue numeric(10,2) check (actual_recovered_revenue is null or actual_recovered_revenue >= 0),
  filled_at timestamptz,
  ai_strategy jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_gap_property_dates unique (property_id, gap_start_date, gap_end_date)
);

create index if not exists idx_gap_opportunities_owner_status on public.gap_opportunities(owner_id, status, priority_score desc);
alter table public.gap_opportunities enable row level security;

create policy "Hosts manage own gap opportunities"
  on public.gap_opportunities for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- 7. Gap Actions
create table if not exists public.gap_actions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  opportunity_id uuid references public.gap_opportunities(id) on delete set null,
  property_id uuid not null references public.properties(id) on delete cascade,
  action_type text not null,
  description text not null,
  recovered_amount numeric(10,2),
  created_at timestamptz not null default now()
);

create index if not exists idx_gap_actions_owner_created on public.gap_actions(owner_id, created_at desc);
alter table public.gap_actions enable row level security;

create policy "Hosts manage own gap actions"
  on public.gap_actions for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- 8. Sync Runs
create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  calendar_connection_id uuid not null references public.calendar_connections(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null check (status in ('success', 'error')),
  reservations_upserted integer not null default 0,
  gaps_recalculated integer not null default 0,
  message text
);

create index if not exists idx_sync_runs_owner_started on public.sync_runs(owner_id, started_at desc);
alter table public.sync_runs enable row level security;

create policy "Hosts view own sync runs"
  on public.sync_runs for select
  using (auth.uid() = owner_id);
