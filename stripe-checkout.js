// HaulNOW Stripe checkout helper
// Loads after app.js and adds secure payment buttons to renter bookings.

(function () {
  const cfg = window.HAULNOW_CONFIG || {};
  const stripeApiUrl = cfg.STRIPE_API_URL || "http://localhost:4242";

  function toast(message) {
    const box = document.getElementById("toast");
    if (!box) return alert(message);
    box.textContent = message;
    box.classList.add("show");
    setTimeout(() => box.classList.remove("show"), 1800);
  }

  async function getAccessToken() {
    if (!window.db?.auth) return null;
    const { data } = await window.db.auth.getSession();
    return data?.session?.access_token || null;
  }

  async function payBooking(bookingId) {
    try {
      const token = await getAccessToken();
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

  function addPaymentButtons() {
    if (!Array.isArray(window.bookings) || !window.currentUser) return;

    document.querySelectorAll(".bookingRow").forEach((row, index) => {
      const booking = window.bookings[index];
      if (!booking || booking.renter_id !== window.currentUser.id) return;
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

  const oldRenderBookings = window.renderBookings;
  if (typeof oldRenderBookings === "function") {
    window.renderBookings = function patchedRenderBookings() {
      oldRenderBookings();
      addPaymentButtons();
    };
  }

  window.payBooking = payBooking;
  setTimeout(addPaymentButtons, 600);
})();
