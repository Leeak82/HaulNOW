-- HaulNOW security migration (XSS-adjacent data rules, RLS, contact privacy).
-- Run in the Supabase SQL Editor AFTER supabase_schema.sql and stripe_supabase_update.sql.
-- Idempotent: safe to run more than once.
--
-- Roles: "server" = Stripe backend using the service_role key (and the SQL editor's postgres role).
-- To make someone an admin, run in the SQL editor: update profiles set role = 'admin' where email = 'you@example.com';

begin;

-- ---------- profiles ----------
alter table public.profiles add column if not exists role text;
update public.profiles set role = 'user' where role is null;
alter table public.profiles alter column role set default 'user';
alter table public.profiles alter column role set not null;
alter table public.profiles enable row level security;

-- ---------- helpers ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- True for the service_role key (PostgREST switches to that role) and for SQL-editor/superuser sessions.
-- Deliberately SECURITY INVOKER so it reflects the real caller.
create or replace function public.is_service() returns boolean
language sql stable as $$
  select current_user in ('service_role', 'postgres', 'supabase_admin');
$$;


drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "profiles_insert_own" on public.profiles for insert with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.guard_profile_role() returns trigger
language plpgsql set search_path = public as $$
begin
  if public.is_service() then return new; end if;
  if tg_op = 'INSERT' then
    new.role := 'user';                      -- nobody can sign up as admin
  elsif new.role is distinct from old.role then
    raise exception 'You cannot change a profile role';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_profile_role on public.profiles;
create trigger trg_guard_profile_role before insert or update on public.profiles
for each row execute function public.guard_profile_role();

-- ---------- truck listings ----------
alter table public.truck_listings enable row level security;
drop policy if exists "Public listings" on public.truck_listings;
drop policy if exists "Insert own listings" on public.truck_listings;
drop policy if exists "listings_select" on public.truck_listings;
drop policy if exists "listings_insert_own" on public.truck_listings;
drop policy if exists "listings_update_owner_or_admin" on public.truck_listings;
drop policy if exists "listings_delete_owner_or_admin" on public.truck_listings;
create policy "listings_select" on public.truck_listings for select
  using (is_active or owner_id = auth.uid() or public.is_admin());
create policy "listings_insert_own" on public.truck_listings for insert
  with check (owner_id = auth.uid());
create policy "listings_update_owner_or_admin" on public.truck_listings for update
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());
create policy "listings_delete_owner_or_admin" on public.truck_listings for delete
  using (owner_id = auth.uid() or public.is_admin());

-- Owners can't hand a listing to someone else or mark themselves verified.
create or replace function public.guard_listing() returns trigger
language plpgsql set search_path = public as $$
begin
  if public.is_service() or public.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.verified := false;
  else
    if new.owner_id is distinct from old.owner_id then raise exception 'You cannot change a listing owner'; end if;
    if new.verified is distinct from old.verified then raise exception 'Only an admin can verify listings'; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_listing on public.truck_listings;
create trigger trg_guard_listing before insert or update on public.truck_listings
for each row execute function public.guard_listing();

-- ---------- private owner contact info ----------
create table if not exists public.listing_contacts (
  listing_id uuid primary key references public.truck_listings(id) on delete cascade,
  owner_id uuid not null references public.profiles(id),
  phone text,
  email text,
  updated_at timestamptz default now()
);

-- Move existing phone/email out of the public listings table, then drop the public columns.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'truck_listings' and column_name = 'phone') then
    insert into public.listing_contacts (listing_id, owner_id, phone, email)
    select id, owner_id, phone, email from public.truck_listings where owner_id is not null
    on conflict (listing_id) do nothing;
    alter table public.truck_listings drop column phone;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'truck_listings' and column_name = 'email') then
    alter table public.truck_listings drop column email;
  end if;
end $$;

alter table public.listing_contacts enable row level security;
revoke all on public.listing_contacts from anon;
drop policy if exists "contacts_select_allowed" on public.listing_contacts;
drop policy if exists "contacts_insert_owner" on public.listing_contacts;
drop policy if exists "contacts_update_owner" on public.listing_contacts;
drop policy if exists "contacts_delete_owner" on public.listing_contacts;
create policy "contacts_select_allowed" on public.listing_contacts for select using (
  owner_id = auth.uid() or public.is_admin()
  or exists (select 1 from public.bookings b
             where b.listing_id = listing_contacts.listing_id
               and b.renter_id = auth.uid()
               and b.status in ('accepted', 'paid'))
);
create policy "contacts_insert_owner" on public.listing_contacts for insert with check (
  public.is_admin()
  or (owner_id = auth.uid() and exists (select 1 from public.truck_listings l where l.id = listing_id and l.owner_id = auth.uid()))
);
create policy "contacts_update_owner" on public.listing_contacts for update
  using (owner_id = auth.uid() or public.is_admin())
  with check (
    public.is_admin()
    or (owner_id = auth.uid() and exists (select 1 from public.truck_listings l where l.id = listing_id and l.owner_id = auth.uid()))
  );
create policy "contacts_delete_owner" on public.listing_contacts for delete
  using (owner_id = auth.uid() or public.is_admin());

-- ---------- bookings ----------
alter table public.bookings enable row level security;
drop policy if exists "Bookings visible to owner or renter" on public.bookings;
drop policy if exists "Insert bookings" on public.bookings;
drop policy if exists "Owners update their bookings" on public.bookings;
drop policy if exists "bookings_select" on public.bookings;
drop policy if exists "bookings_insert_renter" on public.bookings;
drop policy if exists "bookings_update_parties" on public.bookings;
drop policy if exists "bookings_delete_admin" on public.bookings;
create policy "bookings_select" on public.bookings for select
  using (renter_id = auth.uid() or owner_id = auth.uid() or public.is_admin());
create policy "bookings_insert_renter" on public.bookings for insert
  with check (renter_id = auth.uid());
create policy "bookings_update_parties" on public.bookings for update
  using (renter_id = auth.uid() or owner_id = auth.uid() or public.is_admin())
  with check (renter_id = auth.uid() or owner_id = auth.uid() or public.is_admin());
create policy "bookings_delete_admin" on public.bookings for delete using (public.is_admin());

-- Status rules. Runs before trg_set_booking_owner (triggers fire in name order).
--   renter: create as 'requested'; cancel own booking while requested/accepted/payment_pending
--   owner:  requested -> accepted | declined
--   admin / server: anything (only they can set 'paid')
create or replace function public.guard_booking() returns trigger
language plpgsql set search_path = public as $$
begin
  if public.is_service() or public.is_admin() then return new; end if;

  if tg_op = 'INSERT' then
    new.status := 'requested';
    new.owner_id := null;               -- filled from the listing by trg_set_booking_owner
    new.payment_status := null;
    new.stripe_session_id := null;
    new.amount_cents := null;
    new.platform_fee_cents := null;
    new.paid_at := null;
    return new;
  end if;

  if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'Only the booking status can be changed';
  end if;
  if new.status is not distinct from old.status then return new; end if;

  if auth.uid() = old.owner_id and old.status = 'requested' and new.status in ('accepted', 'declined') then
    return new;
  end if;
  if auth.uid() = old.renter_id and old.status in ('requested', 'accepted', 'payment_pending') and new.status = 'cancelled' then
    return new;
  end if;
  raise exception 'Booking status change from % to % is not allowed', old.status, new.status;
end $$;
drop trigger if exists trg_guard_booking on public.bookings;
create trigger trg_guard_booking before insert or update on public.bookings
for each row execute function public.guard_booking();

commit;
