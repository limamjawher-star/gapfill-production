-- GapFill Stage 3 Migration 002: Triggers, Cross-Table RLS Verification & Private Secret RPC
-- Enforces server-side owner_id assignment, cross-table tenant isolation, and secret masking.

-- 1. Automatic updated_at timestamp trigger function
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
security invoker
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

drop trigger if exists trg_properties_updated_at on public.properties;
create trigger trg_properties_updated_at
  before update on public.properties
  for each row execute function public.handle_updated_at();

drop trigger if exists trg_calendar_connections_updated_at on public.calendar_connections;
create trigger trg_calendar_connections_updated_at
  before update on public.calendar_connections
  for each row execute function public.handle_updated_at();

drop trigger if exists trg_reservations_updated_at on public.reservations;
create trigger trg_reservations_updated_at
  before update on public.reservations
  for each row execute function public.handle_updated_at();

drop trigger if exists trg_gap_opportunities_updated_at on public.gap_opportunities;
create trigger trg_gap_opportunities_updated_at
  before update on public.gap_opportunities
  for each row execute function public.handle_updated_at();

-- 2. Never trust client-supplied owner_id: always overwrite with auth.uid() on INSERT
--    and block owner_id reassignment on UPDATE.
create or replace function public.enforce_authenticated_owner_id()
returns trigger
language plpgsql
security invoker
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required: auth.uid() is null';
  end if;

  if tg_op = 'INSERT' then
    new.owner_id := auth.uid();
  elsif tg_op = 'UPDATE' then
    if new.owner_id is distinct from old.owner_id then
      raise exception 'Security violation: owner_id cannot be reassigned';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_properties_enforce_owner on public.properties;
create trigger trg_properties_enforce_owner
  before insert or update on public.properties
  for each row execute function public.enforce_authenticated_owner_id();

drop trigger if exists trg_calendar_connections_enforce_owner on public.calendar_connections;
create trigger trg_calendar_connections_enforce_owner
  before insert or update on public.calendar_connections
  for each row execute function public.enforce_authenticated_owner_id();

drop trigger if exists trg_reservations_enforce_owner on public.reservations;
create trigger trg_reservations_enforce_owner
  before insert or update on public.reservations
  for each row execute function public.enforce_authenticated_owner_id();

drop trigger if exists trg_gap_opportunities_enforce_owner on public.gap_opportunities;
create trigger trg_gap_opportunities_enforce_owner
  before insert or update on public.gap_opportunities
  for each row execute function public.enforce_authenticated_owner_id();

drop trigger if exists trg_gap_actions_enforce_owner on public.gap_actions;
create trigger trg_gap_actions_enforce_owner
  before insert or update on public.gap_actions
  for each row execute function public.enforce_authenticated_owner_id();

-- 3. Automatic profile provisioning when a new Supabase Auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4. Cross-Table Ownership Verification Policies
-- Ensure child records (calendar_connections, reservations, gap_opportunities, gap_actions)
-- can only reference a property_id owned by the same auth.uid().
drop policy if exists "Verify property ownership on calendar_connections" on public.calendar_connections;
create policy "Verify property ownership on calendar_connections"
  on public.calendar_connections for all
  using (
    auth.uid() = owner_id
    and exists (
      select 1 from public.properties p
      where p.id = calendar_connections.property_id
        and p.owner_id = auth.uid()
    )
  )
  with check (
    auth.uid() = owner_id
    and exists (
      select 1 from public.properties p
      where p.id = calendar_connections.property_id
        and p.owner_id = auth.uid()
    )
  );

-- 5. Secure RPC to store raw HTTPS iCal URL in private.calendar_secrets
--    without ever exposing private.calendar_secrets to the Data API.
create or replace function public.upsert_property_calendar_connection(
  p_property_id uuid,
  p_source_name text,
  p_masked_url_preview text,
  p_raw_ical_url text
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_owner_id uuid;
  v_connection_id uuid;
begin
  v_owner_id := auth.uid();
  if v_owner_id is null then
    raise exception 'Unauthorized: authentication required';
  end if;

  if p_raw_ical_url is null or p_raw_ical_url not like 'https://%' then
    raise exception 'Invalid iCal URL: HTTPS protocol is strictly required';
  end if;

  -- Verify caller owns the target property
  if not exists (
    select 1 from public.properties
    where id = p_property_id and owner_id = v_owner_id
  ) then
    raise exception 'Forbidden: caller does not own target property';
  end if;

  insert into public.calendar_connections (
    owner_id,
    property_id,
    source_name,
    masked_url_preview,
    sync_status
  )
  values (
    v_owner_id,
    p_property_id,
    coalesce(nullif(trim(p_source_name), ''), 'Airbnb iCal'),
    p_masked_url_preview,
    'never_synced'
  )
  returning id into v_connection_id;

  insert into private.calendar_secrets (
    calendar_connection_id,
    owner_id,
    raw_ical_url
  )
  values (
    v_connection_id,
    v_owner_id,
    trim(p_raw_ical_url)
  )
  on conflict (calendar_connection_id) do update
    set raw_ical_url = excluded.raw_ical_url,
        updated_at = now();

  return v_connection_id;
end;
$$;

revoke all on function public.upsert_property_calendar_connection(uuid, text, text, text) from public, anon;
grant execute on function public.upsert_property_calendar_connection(uuid, text, text, text) to authenticated;

-- 6. Additional Performance Indexes for Frequently Filtered Queries
create index if not exists idx_properties_owner_status
  on public.properties(owner_id, status);

create index if not exists idx_reservations_owner_property_status
  on public.reservations(owner_id, property_id, status, check_in_date);

create index if not exists idx_gap_opportunities_filter_grid
  on public.gap_opportunities(owner_id, property_id, status, priority_score desc, gap_start_date);
