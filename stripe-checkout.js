// HaulNOW Stripe checkout helper
// Loads after app.js and adds secure payment buttons to renter bookings.

(function () {
  const cfg = window.HAULNOW_CONFIG || {};
  const stripeApiUrl = cfg.STRIPE_API_URL || "http://localhost:4242";
  const stripeDb = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
    : null;

  let visibleBookings = [];

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

  async function loadVisibleBookings() {
    const session = await getSession();
    const user = session?.user;
    if (!stripeDb || !user) return [];

    const { data, error } = await stripeDb
      .from("bookings")
      .select("id, owner_id, renter_id, status, payment_status, created_at")
      .or(`owner_id.eq.${user.id},renter_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Could not load bookings for Stripe buttons", error);
      return [];
    }

    visibleBookings = data || [];
    return visibleBookings;
  }

  async function payBooking(bookingId) {
    try {
      const session = await getSession();
      const token = session?.access_token;
      if (!token) return toast("Sign in first");

      if (stripeApiUrl.includes("localhost") && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
        return toast("Payment server is not deployed yet");
      }

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
    const bookings = await loadVisibleBookings();
    if (!bookings.length) return;

    document.querySelectorAll(".bookingRow").forEach((row, index) => {
      const booking = bookings[index];
      if (!booking) return;
      if (booking.renter_id !== bookings[index].renter_id) return;
      if (["paid", "declined", "cancelled_by_admin"].includes(booking.status)) return;
      if (booking.renter_id !== bookings[index].renter_id) return;
      if (row.querySelector(".stripePayBtn")) return;

      getSession().then((session) => {
        if (!session?.user || booking.renter_id !== session.user.id) return;
        const actions = row.querySelector(".bookingActions") || row;
        const btn = document.createElement("button");
        btn.className = "btn primary stripePayBtn";
        btn.type = "button";
        btn.textContent = "Pay Securely";
        btn.onclick = () => payBooking(booking.id);
        actions.prepend(btn);
      });
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
