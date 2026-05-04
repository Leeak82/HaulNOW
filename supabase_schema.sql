-- HaulNOW database setup

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamp default now()
);

create table if not exists truck_listings (
  id uuid default gen_random_uuid() primary key,
  owner_id uuid references profiles(id),
  title text,
  type text,
  city text,
  rate numeric,
  rate_type text,
  driver_option text,
  capacity text,
  use_case text,
  owner text,
  phone text,
  email text,
  image text,
  verified boolean default false,
  rating text,
  is_active boolean default true,
  created_at timestamp default now()
);

create table if not exists bookings (
  id uuid default gen_random_uuid() primary key,
  listing_id uuid references truck_listings(id),
  owner_id uuid,
  renter_id uuid,
  renter_email text,
  status text default 'requested',
  start_text text,
  note text,
  created_at timestamp default now()
);

alter table profiles enable row level security;
alter table truck_listings enable row level security;
alter table bookings enable row level security;

drop policy if exists "Public listings" on truck_listings;
drop policy if exists "Insert own listings" on truck_listings;
drop policy if exists "Bookings visible to owner or renter" on bookings;
drop policy if exists "Insert bookings" on bookings;
drop policy if exists "Owners update their bookings" on bookings;

create policy "Public listings" on truck_listings
for select using (true);

create policy "Insert own listings" on truck_listings
for insert with check (auth.uid() = owner_id);

create policy "Bookings visible to owner or renter" on bookings
for select using (auth.uid() = owner_id or auth.uid() = renter_id);

create policy "Insert bookings" on bookings
for insert with check (auth.uid() = renter_id);

create policy "Owners update their bookings" on bookings
for update using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create or replace function set_booking_owner()
returns trigger as $$
begin
  select owner_id into new.owner_id
  from truck_listings
  where id = new.listing_id;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_set_booking_owner on bookings;

create trigger trg_set_booking_owner
before insert on bookings
for each row
execute function set_booking_owner();

update bookings
set owner_id = truck_listings.owner_id
from truck_listings
where bookings.listing_id = truck_listings.id
and bookings.owner_id is null;
