# HaulNOW Stripe Setup

This repo now has a Stripe Checkout backend in `/server` and a browser helper in `stripe-checkout.js`.

## What was added

- `server/server.js` creates Stripe Checkout sessions and handles Stripe webhooks.
- `server/package.json` installs the backend dependencies.
- `server/.env.example` shows the required environment variables.
- `stripe-checkout.js` adds a `Pay Securely` button for renter bookings.
- `stripe_supabase_update.sql` adds payment tracking columns to the `bookings` table.
- `config.js` now has `STRIPE_API_URL` for the deployed backend URL.

## Step 1: Run the Supabase payment update

Open Supabase SQL Editor and run:

```sql
-- Paste the contents of stripe_supabase_update.sql here
```

## Step 2: Get Stripe keys

In Stripe Dashboard, stay in test mode first.

Get:

- `STRIPE_SECRET_KEY`, starts with `sk_test_`
- `STRIPE_WEBHOOK_SECRET`, starts with `whsec_`

Do not paste these into `config.js`, GitHub, or frontend files.

## Step 3: Get Supabase server key

In Supabase:

Project Settings → API

Get:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Do not expose the service role key in browser code.

## Step 4: Deploy `/server`

Deploy the `/server` folder to a Node host like Render, Railway, Fly.io, or similar.

Set environment variables on the host:

```bash
PORT=4242
CLIENT_URL=https://YOUR-HAULNOW-SITE-URL
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY=sk_test_YOUR_SECRET_KEY
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET
```

## Step 5: Add webhook in Stripe

Stripe Dashboard → Developers → Webhooks → Add endpoint

Endpoint URL:

```text
https://YOUR-SERVER-URL/webhook
```

Select event:

```text
checkout.session.completed
```

After creating it, copy the signing secret and use it as:

```text
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Step 6: Connect frontend to backend

In `config.js`, replace:

```js
STRIPE_API_URL: "http://localhost:4242"
```

with your deployed backend URL, for example:

```js
STRIPE_API_URL: "https://haulnow-stripe-server.onrender.com"
```

## Step 7: Test payment

Use Stripe test card:

```text
4242 4242 4242 4242
```

Any future expiration date, any CVC, any ZIP.

Flow:

1. Sign in.
2. Request a booking.
3. Open Bookings.
4. Click `Pay Securely`.
5. Complete test checkout.
6. Stripe webhook updates booking status to `paid`.

## Notes

Current pricing logic charges the listing rate plus a HaulNOW platform fee of 10%, minimum $5.

This is a first production-style Stripe Checkout setup. Stripe Connect payouts to truck owners should be added later when the owner payment flow is ready.
