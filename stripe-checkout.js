// HaulNOW Stripe checkout helper
// Loads after app.js and adds secure payment buttons to renter bookings.

(function () {
  const cfg = window.HAULNOW_CONFIG || {};
  const stripeApiUrl = cfg.STRIPE_API_URL || "http://localhost:4242";
  const stripeDb = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
    : null;

  let renterBookings = [];

  function toast(message) {
    const box = document.getElementById("toast");
    if (!box) return alert(message);
    box.textContent = message;
    box.classList.add("show");
    setTimeout(() => box.classList.remove("show"), 1800);
  }

  async function getSession() {
    if (!stripeDb?.auth) return null;
    const { data } = await stripeDb.auth.getSession();
    return data?.session || null;
  }

  async function loadRenterBookings() {
    const session = await getSession();
    const user = session?.user;
    if (!stripeDb || !user) return [];

    const { data, error } = await stripeDb
      .from("bookings")
      .select("id, renter_id, status, payment_status, created_at")
      .eq("renter_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Could not load renter bookings for Stripe buttons", error);
      return [];
    }

    renterBookings = data || [];
    return renterBookings;
  }

  async function payBooking(bookingId) {
    try {
      const session = await getSession();
      const token = session?.access_token;
      if (!token) return toast("Sign in first");

      toast("Opening secure checkout...");
      const res = await fetch(`${stripeApiUrl}/create-checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ booking_id: bookingId })
      });

      const data = await res.json();
      if (!res.ok || !data.url) return toast(data.error || "Stripe checkout failed");
      window.location.href = data.url;
    } catch (err) {
      console.error(err);
      toast("Payment server is not reachable yet");
    }
  }

  async function addPaymentButtons() {
    const bookings = await loadRenterBookings();
    if (!bookings.length) return;

    document.querySelectorAll(".bookingRow").forEach((row, index) => {
      const booking = bookings[index];
      if (!booking) return;
      if (["paid", "declined", "cancelled_by_admin"].includes(booking.status)) return;
      if (row.querySelector(".stripePayBtn")) return;

      const actions = row.querySelector(".bookingActions") || row;
      const btn = document.createElement("button");
      btn.className = "btn primary stripePayBtn";
      btn.type = "button";
      btn.textContent = "Pay Securely";
      btn.onclick = () => payBooking(booking.id);
      actions.prepend(btn);
    });
  }

  const observer = new MutationObserver(() => addPaymentButtons());
  const startObserver = () => {
    const bookingList = document.getElementById("bookingList");
    if (bookingList) observer.observe(bookingList, { childList: true, subtree: true });
    addPaymentButtons();
  };

  window.payBooking = payBooking;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserver);
  } else {
    startObserver();
  }
})();
