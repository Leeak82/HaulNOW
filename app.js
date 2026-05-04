const cfg = window.HAULNOW_CONFIG || {};
let db = null;
let currentUser = null;
let listings = [];
let bookings = [];

const $ = (id) => document.getElementById(id);

if (cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("PASTE")) {
  db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  $("modePill").textContent = "🌐 Live marketplace connected";
  $("dbNotice").textContent = "Connected to Supabase";
}

async function init() {
  await loadUser();
  await loadListings();
  await loadBookings();
  render();
}

async function loadUser() {
  if (!db) return;
  const { data } = await db.auth.getUser();
  currentUser = data.user;
  $("userBox").textContent = currentUser
    ? `Signed in as ${currentUser.email}`
    : "Not signed in";
}

async function signIn() {
  const email = $("authEmail").value;
  const password = $("authPassword").value;
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) return alert(error.message);
  await init();
}

async function signUp() {
  const email = $("authEmail").value;
  const password = $("authPassword").value;
  const { error } = await db.auth.signUp({ email, password });
  if (error) return alert(error.message);
  alert("Account created");
}

async function signOut() {
  await db.auth.signOut();
  currentUser = null;
  render();
}

async function loadListings() {
  if (!db) return;
  const { data } = await db.from("truck_listings").select("*");
  listings = data || [];
}

async function loadBookings() {
  if (!db || !currentUser) return;
  const { data } = await db
    .from("bookings")
    .select("*")
    .or(`owner_id.eq.${currentUser.id},renter_id.eq.${currentUser.id}`);
  bookings = data || [];
}

async function createListing(e) {
  e.preventDefault();
  if (!currentUser) return alert("Sign in first");

  const item = {
    owner_id: currentUser.id,
    title: $("title").value,
    type: $("type").value,
    city: $("city").value,
    rate: Number($("rate").value),
    rate_type: $("rateType").value,
    driver_option: $("driverOption").value,
    capacity: $("capacity").value,
    use_case: $("useCase").value,
    owner: $("owner").value,
    phone: $("phone").value,
    email: $("email").value,
    image: $("image").value,
    is_active: true
  };

  const { error } = await db.from("truck_listings").insert(item);
  if (error) return alert(error.message);

  await loadListings();
  render();
}

async function requestBooking(id) {
  if (!currentUser) return alert("Sign in first");
  const { error } = await db.from("bookings").insert({
    listing_id: id,
    renter_id: currentUser.id,
    renter_email: currentUser.email,
    status: "requested"
  });
  if (error) return alert(error.message);
  await loadBookings();
  renderBookings();
}

async function updateBooking(id, status) {
  await db.from("bookings").update({ status }).eq("id", id);
  await loadBookings();
  renderBookings();
}

function render() {
  $("statListings").textContent = listings.length;
  $("truckGrid").innerHTML = listings
    .map(
      (x) => `
      <div class="card truck">
        <div class="body">
          <h3>${x.title}</h3>
          <p>${x.city}</p>
          <button class="btn primary" onclick="requestBooking('${x.id}')">Request</button>
        </div>
      </div>`
    )
    .join("");
}

function renderBookings() {
  $("bookingList").innerHTML = bookings
    .map(
      (b) => `
      <div class="bookingRow">
        ${b.status}
        <button onclick="updateBooking('${b.id}','accepted')">Accept</button>
        <button onclick="updateBooking('${b.id}','declined')">Decline</button>
      </div>`
    )
    .join("");
}

$("signInBtn").onclick = signIn;
$("signUpBtn").onclick = signUp;
$("signOutBtn").onclick = signOut;
$("listingForm").onsubmit = createListing;
$("refreshBookingsBtn").onclick = loadBookings;

init();
