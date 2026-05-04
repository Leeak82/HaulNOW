const cfg = window.HAULNOW_CONFIG || {};
let db = null;
let currentUser = null;
let listings = [];
let bookings = [];
let editingListingId = null;

const $ = (id) => document.getElementById(id);
const safe = (id) => $(id) || { textContent: "", innerHTML: "", value: "", style: {}, onclick: null, onsubmit: null, addEventListener: () => {} };

const demoListings = [
  { id: "demo-1", title: "Ford F-350 Super Duty", type: "Pickup Truck", city: "Tacoma, WA", rate: 120, rate_type: "day", driver_option: "With or without driver", capacity: "4,200 lb payload", use_case: "Moving, hauling, dump runs", owner: "HaulNOW Demo Owner", phone: "253-555-0123", email: "owner@example.com", image: "", verified: true, rating: "New" },
  { id: "demo-2", title: "26 ft Box Truck With Liftgate", type: "Box Truck", city: "Seattle, WA", rate: 95, rate_type: "hour", driver_option: "Driver included only", capacity: "26 ft box / liftgate", use_case: "Furniture, appliances, business deliveries", owner: "HaulNOW Demo Fleet", phone: "206-555-0188", email: "fleet@example.com", image: "", verified: true, rating: "New" }
];

function toast(message) {
  const box = safe("toast");
  box.textContent = message;
  if (box.classList) {
    box.classList.add("show");
    setTimeout(() => box.classList.remove("show"), 1800);
  } else alert(message);
}

function driverIncluded(x) { return x.driver_option === "Driver included only" || x.driver_option === "With or without driver"; }
function selfDrive(x) { return x.driver_option === "Self-drive only" || x.driver_option === "With or without driver"; }
function setStatus(text, ok = true) { safe("modePill").textContent = text; safe("dbNotice").textContent = ok ? "Ready to browse" : "Showing sample listings until live listings are added"; }

if (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_URL.includes("PASTE")) {
  db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  setStatus("Live marketplace connected", true);
} else setStatus("Preview marketplace", false);

async function ensureProfile() {
  if (!db || !currentUser) return false;
  const { error } = await db.from("profiles").upsert({ id: currentUser.id, email: currentUser.email }, { onConflict: "id" });
  if (error) {
    console.error("Profile repair failed", error);
    toast("Profile save blocked. Run the profile policy SQL fix.");
    return false;
  }
  return true;
}

async function init() {
  try { await loadUser(); await loadListings(); await loadBookings(); }
  catch (err) { console.error(err); listings = demoListings; setStatus("Preview marketplace", false); }
  wireControls(); render(); renderBookings();
}

async function loadUser() {
  if (!db) return;
  const { data } = await db.auth.getUser();
  currentUser = data?.user || null;
  if (currentUser) await ensureProfile();
  safe("userBox").textContent = currentUser ? `Signed in as ${currentUser.email}` : "Not signed in";
}

async function signIn() {
  if (!db) return toast("Database not connected yet");
  const email = safe("authEmail").value.trim();
  const password = safe("authPassword").value;
  if (!email || !password) return toast("Enter email and password");
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) return toast(error.message);
  toast("Signed in");
  await init();
}

async function signUp() {
  if (!db) return toast("Database not connected yet");
  const email = safe("authEmail").value.trim();
  const password = safe("authPassword").value;
  if (!email || !password) return toast("Enter email and password");
  const { error } = await db.auth.signUp({ email, password });
  if (error) return toast(error.message);
  toast("Account created. Sign in if needed.");
}

async function signOut() { if (db) await db.auth.signOut(); currentUser = null; editingListingId = null; safe("userBox").textContent = "Not signed in"; render(); toast("Signed out"); }

async function loadListings() {
  if (!db) { listings = demoListings; return; }
  const { data, error } = await db.from("truck_listings").select("*").eq("is_active", true).order("created_at", { ascending: false });
  if (error) { console.error(error); listings = demoListings; setStatus("Preview marketplace", false); return; }
  listings = data && data.length ? data : demoListings;
}

async function loadBookings() {
  if (!db || !currentUser) { bookings = []; return; }
  const { data, error } = await db.from("bookings").select("*").or(`owner_id.eq.${currentUser.id},renter_id.eq.${currentUser.id}`).order("created_at", { ascending: false });
  if (error) { console.error(error); bookings = []; return; }
  bookings = data || [];
}

function getListingFormItem() {
  return {
    title: safe("title").value.trim(), type: safe("type").value, city: safe("city").value.trim(), rate: Number(safe("rate").value), rate_type: safe("rateType").value,
    driver_option: safe("driverOption").value, capacity: safe("capacity").value.trim(), use_case: safe("useCase").value.trim(), owner: safe("owner").value.trim(),
    phone: safe("phone").value.trim(), email: safe("email").value.trim(), image: safe("image").value.trim(), is_active: true
  };
}

async function createListing(e) {
  e.preventDefault();
  if (!db) return toast("Database not connected yet");
  if (!currentUser) return toast("Sign in first");
  if (!(await ensureProfile())) return;

  const item = getListingFormItem();
  if (!item.title || !item.city || !item.rate || !item.owner || !item.phone) return toast("Fill out title, city, rate, owner, and phone");

  if (editingListingId) {
    const { error } = await db.from("truck_listings").update(item).eq("id", editingListingId).eq("owner_id", currentUser.id);
    if (error) return toast(error.message);
    editingListingId = null;
    toast("Listing updated");
  } else {
    const { error } = await db.from("truck_listings").insert({ ...item, owner_id: currentUser.id, rating: "New" });
    if (error) return toast(error.message);
    toast("Truck listed");
  }

  safe("listingForm").reset?.();
  safe("listingSubmitText").textContent = "Publish listing";
  await loadListings(); render(); location.hash = "browse";
}

function editListing(id) {
  const listing = listings.find((x) => String(x.id) === String(id));
  if (!listing) return toast("Listing not found");
  if (!currentUser || listing.owner_id !== currentUser.id) return toast("Only the owner can edit this listing");
  editingListingId = listing.id;
  safe("title").value = listing.title || "";
  safe("type").value = listing.type || "Pickup Truck";
  safe("city").value = listing.city || "";
  safe("rate").value = listing.rate || "";
  safe("rateType").value = listing.rate_type || "day";
  safe("driverOption").value = listing.driver_option || "With or without driver";
  safe("capacity").value = listing.capacity || "";
  safe("useCase").value = listing.use_case || "";
  safe("owner").value = listing.owner || "";
  safe("phone").value = listing.phone || "";
  safe("email").value = listing.email || "";
  safe("image").value = listing.image || "";
  safe("listingSubmitText").textContent = "Save changes";
  location.hash = "list";
  toast("Editing listing");
}

async function deleteListing(id) {
  if (!db) return toast("Database not connected yet");
  if (!currentUser) return toast("Sign in first");
  const ok = confirm("Remove this listing from public view?");
  if (!ok) return;
  const { error } = await db.from("truck_listings").update({ is_active: false }).eq("id", id).eq("owner_id", currentUser.id);
  if (error) return toast(error.message);
  toast("Listing removed");
  await loadListings(); render();
}

async function requestBooking(id) {
  if (String(id).startsWith("demo")) return toast("Sign in and add a real listing to test bookings");
  if (!db) return toast("Database not connected yet");
  if (!currentUser) return toast("Sign in first");
  await ensureProfile();
  const note = prompt("Message to owner? Example: Need truck Friday morning") || "";
  const { error } = await db.from("bookings").insert({ listing_id: id, renter_id: currentUser.id, renter_email: currentUser.email, status: "requested", note });
  if (error) return toast(error.message);
  toast("Booking requested"); await loadBookings(); renderBookings(); location.hash = "dashboard";
}

async function updateBooking(id, status) { if (!db) return toast("Database not connected yet"); const { error } = await db.from("bookings").update({ status }).eq("id", id); if (error) return toast(error.message); toast("Booking updated"); await loadBookings(); renderBookings(); }

function renderTypes() {
  const select = safe("typeFilter");
  if (!select.innerHTML && select !== $("typeFilter")) return;
  const current = select.value || "All";
  const types = ["All", ...new Set(listings.map((x) => x.type).filter(Boolean))];
  select.innerHTML = types.map((t) => `<option>${t}</option>`).join("");
  select.value = types.includes(current) ? current : "All";
}

function render() {
  renderTypes();
  const q = (safe("search").value || "").toLowerCase();
  const driver = safe("driverFilter").value || "All";
  const type = safe("typeFilter").value || "All";
  const shown = listings.filter((x) => {
    const hay = `${x.title} ${x.city} ${x.type} ${x.use_case} ${x.capacity} ${x.owner}`.toLowerCase();
    return hay.includes(q) && (driver === "All" || (driver === "With Driver" && driverIncluded(x)) || (driver === "Self-Drive" && selfDrive(x))) && (type === "All" || x.type === type);
  });
  safe("statListings").textContent = listings.length; safe("statDriver").textContent = listings.filter(driverIncluded).length; safe("statBookings").textContent = bookings.length; safe("resultCount").textContent = shown.length; safe("emptyState").style.display = shown.length ? "none" : "block";
  safe("truckGrid").innerHTML = shown.map((x) => {
    const ownerControls = currentUser && x.owner_id === currentUser.id ? `<div class="contacts" style="margin-top:10px"><button class="btn green" onclick="editListing('${x.id}')">Edit</button><button class="btn danger" onclick="deleteListing('${x.id}')">Remove</button></div>` : "";
    return `<article class="card truck"><div class="img">${x.image ? `<img src="${x.image}" alt="${x.title}">` : `<div style="height:100%;display:grid;place-items:center;font-size:3rem">🚚</div>`}<div class="price">$${x.rate}/${x.rate_type}</div>${x.verified ? `<div class="verified">Verified</div>` : ``}</div><div class="body"><div class="top"><div><h3>${x.title}</h3><div class="loc">📍 ${x.city}</div></div><div class="rating">⭐ ${x.rating || "New"}</div></div><div class="badges"><span class="badge">${x.type}</span><span class="badge">${x.driver_option}</span></div><div class="info"><p><b>Capacity:</b> ${x.capacity || "Ask owner"}</p><p><b>Best for:</b> ${x.use_case || "General hauling"}</p><p><b>Owner:</b> ${x.owner || "Owner"}</p></div><div class="contacts"><button class="btn primary" onclick="requestBooking('${x.id}')">Request Booking</button><a class="btn" href="tel:${x.phone || ""}">Call</a></div>${ownerControls}</div></article>`;
  }).join("");
}

function renderBookings() {
  safe("statBookings").textContent = bookings.length;
  if (!bookings.length) { safe("bookingList").innerHTML = `<div class="empty">No bookings yet.</div>`; return; }
  safe("bookingList").innerHTML = bookings.map((b) => `<div class="bookingRow"><span class="dot">${b.status === "accepted" ? "✓" : b.status === "declined" ? "×" : "!"}</span><div><b>Status: ${b.status}</b><div class="small">Renter: ${b.renter_email || "Unknown"}</div><div class="small">${b.note || ""}</div></div><div class="bookingActions"><button class="btn green" onclick="updateBooking('${b.id}','accepted')">Accept</button><button class="btn danger" onclick="updateBooking('${b.id}','declined')">Decline</button></div></div>`).join("");
}

function wireControls() {
  safe("signInBtn").onclick = signIn; safe("signUpBtn").onclick = signUp; safe("signOutBtn").onclick = signOut; safe("listingForm").onsubmit = createListing; safe("refreshBookingsBtn").onclick = async () => { await loadBookings(); renderBookings(); }; safe("clearFormBtn").onclick = () => { editingListingId = null; safe("listingForm").reset?.(); safe("listingSubmitText").textContent = "Publish listing"; }; ["search", "driverFilter", "typeFilter"].forEach((id) => safe(id).addEventListener("input", render));
}

init();
