import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const PORT = process.env.PORT || 4242;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

app.use(cors({ origin: CLIENT_URL }));

app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const bookingId = session.metadata?.booking_id;

    if (bookingId) {
      const { error } = await supabase
        .from('bookings')
        .update({
          status: 'paid',
          payment_status: session.payment_status,
          stripe_session_id: session.id,
          paid_at: new Date().toISOString()
        })
        .eq('id', bookingId);

      if (error) console.error('Booking payment update failed:', error.message);
    }
  }

  res.json({ received: true });
});

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, app: 'HaulNOW Stripe server' });
});

app.post('/create-checkout-session', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '').trim();
    const { booking_id } = req.body;

    if (!token) return res.status(401).json({ error: 'Sign in required' });
    if (!booking_id) return res.status(400).json({ error: 'Missing booking_id' });

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    const user = userData?.user;

    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid session. Sign in again.' });
    }

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, listing_id, renter_id, renter_email, status, truck_listings(title, rate, rate_type, city)')
      .eq('id', booking_id)
      .single();

    if (bookingError || !booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.renter_id !== user.id) return res.status(403).json({ error: 'Only the renter can pay this booking' });
    if (booking.status === 'paid') return res.status(400).json({ error: 'Booking already paid' });

    const listing = booking.truck_listings;
    const rate = Number(listing?.rate || 0);
    if (!rate || rate < 1) return res.status(400).json({ error: 'Listing has invalid rate' });

    const rentalCents = Math.round(rate * 100);
    const platformFeeCents = Math.max(500, Math.round(rentalCents * 0.1));
    const totalCents = rentalCents + platformFeeCents;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: booking.renter_email || user.email || undefined,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `HaulNOW Booking: ${listing?.title || 'Truck rental'}`,
              description: `${listing?.city || 'Local truck'} · $${rate}/${listing?.rate_type || 'booking'} + HaulNOW fee`
            },
            unit_amount: totalCents
          },
          quantity: 1
        }
      ],
      metadata: {
        booking_id: booking.id,
        listing_id: booking.listing_id,
        renter_id: booking.renter_id
      },
      success_url: `${CLIENT_URL}?payment=success#dashboard`,
      cancel_url: `${CLIENT_URL}?payment=cancelled#dashboard`
    });

    await supabase
      .from('bookings')
      .update({
        status: 'payment_pending',
        payment_status: 'checkout_created',
        stripe_session_id: session.id,
        amount_cents: totalCents,
        platform_fee_cents: platformFeeCents
      })
      .eq('id', booking.id);

    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout failed:', err);
    res.status(500).json({ error: 'Could not create checkout session' });
  }
});

app.listen(PORT, () => {
  console.log(`HaulNOW Stripe server running on port ${PORT}`);
});
