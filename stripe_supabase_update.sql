-- HaulNOW Stripe payment update
-- Run this in Supabase SQL Editor after the original supabase_schema.sql.

alter table bookings
add column if not exists payment_status text,
add column if not exists stripe_session_id text,
add column if not exists amount_cents integer,
add column if not exists platform_fee_cents integer,
add column if not exists paid_at timestamptz;

create index if not exists idx_bookings_stripe_session_id
on bookings(stripe_session_id);

-- Optional: allow renters to see their own payment fields through existing booking select policy.
-- The current policy already allows renter/owner visibility, so no extra select policy is needed.
