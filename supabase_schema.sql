-- Run this inside Supabase SQL editor

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamp default now()
);

create table truck_listings (
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

create table bookings (
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

-- Enable RLS
alter table profiles enable row level security;
alter table truck_listings enable row level security;
alter table bookings enable row level security;

-- Basic policies (simple version)
create policy "Public listings" on truck_listings
for select using (true);

create policy "Insert own listings" on truck_listings
for insert with check (auth.uid() = owner_id);

create policy "Bookings visible to owner or renter" on bookings
for select using (auth.uid() = owner_id or auth.uid() = renter_id);

create policy "Insert bookings" on bookings
for insert with check (auth.uid() = renter_id);
