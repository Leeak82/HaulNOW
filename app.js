const cfg = window.HAULNOW_CONFIG || {};
let supabase = null;

if (cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes('PASTE')) {
  supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
}

async function createBooking(listingId) {
  const note = prompt("Message to owner?") || "";

  if (!supabase) {
    alert("Database not connected yet");
    return;
  }

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    alert("Sign in first");
    return;
  }

  const { error } = await supabase.from("bookings").insert({
    listing_id: listingId,
    renter_id: user.id,
    renter_email: user.email,
    status: "requested",
    note
  });

  if (error) {
    alert(error.message);
  } else {
    alert("Booking requested. Contact owner to pay.");
  }
}

async function loadBookings() {
  if (!supabase) return;

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) return;

  const { data } = await supabase
    .from("bookings")
    .select("*")
    .or(`owner_id.eq.${user.id},renter_id.eq.${user.id}`);

  console.log("Bookings:", data);
}
