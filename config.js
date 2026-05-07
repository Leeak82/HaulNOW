// HaulNOW production config
// Public Supabase URL + anon/publishable key are safe for browser apps.
// Never put a Supabase service_role key or Stripe secret key in this file.

window.HAULNOW_CONFIG = {
  SUPABASE_URL: "https://ywmeizpynnmbpndywqkm.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_qb2nb8i7HHja5qwBwcr1nA_IqnjQSED",

  // Replace this after deploying the /server folder to Render, Railway, Fly.io, etc.
  // Example: https://haulnow-stripe-server.onrender.com
  STRIPE_API_URL: "http://localhost:4242"
};
