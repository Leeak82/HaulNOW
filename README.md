# HaulNOW

HaulNOW is a marketplace prototype for connecting people who need hauling, moving, or dump runs with truck owners and drivers who have available capacity.

I built it as a practical marketplace project while learning frontend workflows, backend services, Supabase-backed data, Stripe checkout integration, deployment structure, and the awkward reality that marketplaces need both sides to work at the same time.

## Product Concept

Two primary users:

### Customers

- post a hauling / moving / dump job
- describe the load and destination
- review available hauling options
- move through a checkout / payment flow

### Truck Owners / Drivers

- make a truck or hauling service available
- accept work
- provide driver-inclusive or truck-only options depending on the listing model

## Repository Structure

The current repository contains:

- static/mobile-friendly web client files
- a Node.js backend in `server/`
- Stripe checkout work
- Supabase schema / update SQL
- PWA-related files
- deployment wrapper scripts

## Backend

The root package delegates backend startup to the server project:

```bash
npm install
npm start
```

Development mode:

```bash
npm run dev
```

The backend uses:

- Node.js
- Express
- Stripe
- Supabase
- CORS
- environment-based configuration

## Payments

Stripe integration is separated into server-side work rather than exposing secret credentials in frontend code.

See [`STRIPE_SETUP.md`](STRIPE_SETUP.md) for setup notes.

## Data

Supabase-related schema work is included in:

- `supabase_schema.sql`
- `stripe_supabase_update.sql`

## Current Status

HaulNOW is a functional marketplace prototype / work in progress, not a claim of production marketplace readiness.

Before a real public launch it would still need areas such as stronger authentication, production payment verification, trust/safety controls, job lifecycle hardening, dispute handling, driver/truck verification, and full end-to-end deployment testing.

## What I Learned Building It

This project has been useful for learning how frontend interactions, backend APIs, payment services, database state, environment configuration, and deployment all connect in a marketplace-style application.