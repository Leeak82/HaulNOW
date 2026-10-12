const cfg = window.HAULNOW_CONFIG || {};
let db = null;
let currentUser = null;
let isAdmin = false;
let listings = [];
let bookings = [];
let editingListingId = null;
let contacts = {};
const esc = window.escapeHtml;

const $ = (id) => document.getElementById(id);
const safe = (id) => $(id) || { textContent: "", innerHTML: "", value: "", style: {}, onclick: null, onsubmit: null, addEventListener: () => {} };

const demoListings = [
  { id: "demo-1", title: "Ford F-350 Super Duty", type: "Pickup Truck", city: "Denver, CO", rate: 120, rate_type: "day", driver_option: "With or without driver", capacity: "4,200 lb payload", use_case: "Moving, hauling, dump runs", owner: "HaulNOW Demo Owner", image: "", verified: true, rating: "New" },
  { id: "demo-2", title: "26 ft Box Truck With Liftgate", type: "Box Truck", city: "Seattle, WA", rate: 95, rate_type: "hour", driver_option: "Driver included only", capacity: "26 ft box / liftgate", use_case: "Furniture, appliances, business deliveries", owner: "HaulNOW Demo Fleet", image: "", verified: true, rating: "New" }
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
  window.haulnowDb = db; // single shared client (stripe-checkout.js reuses it)
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

async function loadAdminStatus() {
  isAdmin = false;
  if (!db || !currentUser) return;
  const { data, error } = await db.from("profiles").select("role").eq("id", currentUser.id).maybeSingle();
  if (!error && data?.role === "admin") isAdmin = true;
}

async function init() {
  try { await loadUser(); await loadAdminStatus(); await loadListings(); await loadContacts(); await loadBookings(); }
  catch (err) { console.error(err); listings = demoListings; setStatus("Preview marketplace", false); }
  wireControls(); render(); renderBookings();
}

async function loadUser() {
  if (!db) return;
  const { data } = await db.auth.getUser();
  currentUser = data?.user || null;
  if (currentUser) await ensureProfile();
  safe("userBox").textContent = currentUser ? `Signed in as ${currentUser.email}${isAdmin ? " · Admin" : ""}` : "Not signed in";
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

async function signOut() { if (db) await db.auth.signOut(); currentUser = null; isAdmin = false; editingListingId = null; safe("userBox").textContent = "Not signed in"; render(); toast("Signed out"); }

async function loadListings() {
  if (!db) { listings = demoListings; return; }
  const { data, error } = await db.from("truck_listings").select("*").eq("is_active", true).order("created_at", { ascending: false });
  if (error) { console.error(error); listings = demoListings; setStatus("Preview marketplace", false); return; }
  listings = data && data.length ? data : demoListings;
}

// Owner phone/email live in listing_contacts. RLS only returns rows the viewer may see:
// their own listings, admins, or renters whose booking for that listing is accepted or paid.
async function loadContacts() {
  contacts = {};
  if (!db || !currentUser) return;
  const { data, error } = await db.from("listing_contacts").select("listing_id, phone, email");
  if (error) { console.error(error); return; }
  (data || []).forEach((c) => { contacts[c.listing_id] = c; });
}

async function loadBookings() {
  if (!db || !currentUser) { bookings = []; return; }
  let query = db.from("bookings").select("*").order("created_at", { ascending: false });
  if (!isAdmin) query = query.or(`owner_id.eq.${currentUser.id},renter_id.eq.${currentUser.id}`);
  const { data, error } = await query;
  if (error) { console.error(error); bookings = []; return; }
  bookings = data || [];
}

function getListingFormItem() {
  return {
    title: safe("title").value.trim(), type: safe("type").value, city: safe("city").value.trim(), rate: Number(safe("rate").value), rate_type: safe("rateType").value,
    driver_option: safe("driverOption").value, capacity: safe("capacity").value.trim(), use_case: safe("useCase").value.trim(), owner: safe("owner").value.trim(),
    image: safe("image").value.trim(), is_active: true
  };
}

async function createListing(e) {
  e.preventDefault();
  if (!db) return toast("Database not connected yet");
  if (!currentUser) return toast("Sign in first");
  if (!(await ensureProfile())) return;

  const item = getListingFormItem();
  const contact = { phone: safe("phone").value.trim(), email: safe("email").value.trim() };
  if (!item.title || !item.city || !item.rate || !item.owner || !contact.phone) return toast("Fill out title, city, rate, owner, and phone");
  if (item.image && !window.safeImageUrl(item.image)) return toast("Photo URL must start with http:// or https://");
  let listingId = editingListingId;
  const wasEditing = Boolean(editingListingId);
  let listingOwner = currentUser.id;

  if (editingListingId) {
    let query = db.from("truck_listings").update(item).eq("id", editingListingId);
    if (!isAdmin) query = query.eq("owner_id", currentUser.id);
    const { error } = await query;
    if (error) return toast(error.message);
    listingOwner = listings.find((x) => String(x.id) === String(listingId))?.owner_id || currentUser.id;
    editingListingId = null;
  } else {
    const { data, error } = await db.from("truck_listings").insert({ ...item, owner_id: currentUser.id, rating: "New" }).select("id").single();
    if (error) return toast(error.message);
    listingId = data.id;
  }
  const { error: contactError } = await db.from("listing_contacts").upsert({ listing_id: listingId, owner_id: listingOwner, ...contact }, { onConflict: "listing_id" });
  if (contactError) return toast("Listing saved, but contact info failed: " + contactError.message);
  toast(wasEditing ? "Listing updated" : "Truck listed");

  safe("listingForm").reset?.();
  safe("listingSubmitText").textContent = "Publish listing";
  await loadListings(); await loadContacts(); render(); location.hash = "browse";
}

function canManageListing(listing) { return currentUser && (isAdmin || listing.owner_id === currentUser.id); }

function editListing(id) {
  const listing = listings.find((x) => String(x.id) === String(id));
  if (!listing) return toast("Listing not found");
  if (!canManageListing(listing)) return toast("You do not have permission to edit this listing");
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
  safe("phone").value = contacts[listing.id]?.phone || "";
  safe("email").value = contacts[listing.id]?.email || "";
  safe("image").value = listing.image || "";
  safe("listingSubmitText").textContent = "Save changes";
  location.hash = "list";
  toast(isAdmin ? "Admin editing listing" : "Editing listing");
}

async function deleteListing(id) {
  if (!db) return toast("Database not connected yet");
  if (!currentUser) return toast("Sign in first");
  const listing = listings.find((x) => String(x.id) === String(id));
  if (!listing) return toast("Listing not found");
  if (!canManageListing(listing)) return toast("You do not have permission to remove this listing");
  const ok = confirm(isAdmin ? "Admin remove this listing from public view?" : "Remove this listing from public view?");
  if (!ok) return;
  let query = db.from("truck_listings").update({ is_active: false }).eq("id", id);
  if (!isAdmin) query = query.eq("owner_id", currentUser.id);
  const { error } = await query;
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

async function updateBooking(id, status) { if (!db) return toast("Database not connected yet"); const { error } = await db.from("bookings").update({ status }).eq("id", id); if (error) return toast(error.message); toast("Booking updated"); await loadBookings(); await loadContacts(); render(); renderBookings(); }

async function cancelBooking(id) {
  if (!confirm("Cancel this booking request?")) return;
  await updateBooking(id, "cancelled");
}

async function adminCancelBooking(id) {
  if (!isAdmin) return toast("Admin access required");
  const ok = confirm("Admin cancel this booking?");
  if (!ok) return;
  await updateBooking(id, "cancelled_by_admin");
}

function renderTypes() {
  const select = safe("typeFilter");
  if (!select.innerHTML && select !== $("typeFilter")) return;
  const current = select.value || "All";
  const types = ["All", ...new Set(listings.map((x) => x.type).filter(Boolean))];
  select.innerHTML = types.map((t) => `<option>${esc(t)}</option>`).join("");
  select.value = types.includes(current) ? current : "All";
}

function render() {
  renderTypes();
  safe("userBox").textContent = currentUser ? `Signed in as ${currentUser.email}${isAdmin ? " · Admin" : ""}` : "Not signed in";
  const q = (safe("search").value || "").toLowerCase();
  const driver = safe("driverFilter").value || "All";
  const type = safe("typeFilter").value || "All";
  const shown = listings.filter((x) => {
    const hay = `${x.title} ${x.city} ${x.type} ${x.use_case} ${x.capacity} ${x.owner}`.toLowerCase();
    return hay.includes(q) && (driver === "All" || (driver === "With Driver" && driverIncluded(x)) || (driver === "Self-Drive" && selfDrive(x))) && (type === "All" || x.type === type);
  });
  safe("statListings").textContent = listings.length; safe("statDriver").textContent = listings.filter(driverIncluded).length; safe("statBookings").textContent = bookings.length; safe("resultCount").textContent = shown.length; safe("emptyState").style.display = shown.length ? "none" : "block";
  safe("truckGrid").innerHTML = shown.map((x) => {
    const id = esc(x.id);
    const img = window.safeImageUrl(x.image);
    const contact = contacts[x.id];
    const tel = contact ? window.safeTel(contact.phone) : "";
    const contactHtml = contact
      ? `${tel ? `<a class="btn" href="tel:${esc(tel)}">Call</a>` : ""}${contact.email ? `<a class="btn" href="mailto:${esc(encodeURIComponent(contact.email).replace(/%40/g, "@"))}">Email</a>` : ""}`
      : `<span class="small">Contact shared after the owner accepts your booking</span>`;
    const ownerControls = canManageListing(x) ? `<div class="contacts" style="margin-top:10px"><button class="btn green" data-action="edit" data-id="${id}">${isAdmin && x.owner_id !== currentUser?.id ? "Admin Edit" : "Edit"}</button><button class="btn danger" data-action="delete" data-id="${id}">${isAdmin && x.owner_id !== currentUser?.id ? "Admin Remove" : "Remove"}</button></div>` : "";
    return `<article class="card truck"><div class="img">${img ? `<img src="${esc(img)}" alt="${esc(x.title)}" loading="lazy" referrerpolicy="no-referrer">` : `<div style="height:100%;display:grid;place-items:center;font-size:3rem">🚚</div>`}<div class="price">$${esc(x.rate)}/${esc(x.rate_type)}</div>${x.verified ? `<div class="verified">Verified</div>` : ``}</div><div class="body"><div class="top"><div><h3>${esc(x.title)}</h3><div class="loc">📍 ${esc(x.city)}</div></div><div class="rating">⭐ ${esc(x.rating || "New")}</div></div><div class="badges"><span class="badge">${esc(x.type)}</span><span class="badge">${esc(x.driver_option)}</span>${isAdmin ? `<span class="badge">Admin view</span>` : ``}</div><div class="info"><p><b>Capacity:</b> ${esc(x.capacity || "Ask owner")}</p><p><b>Best for:</b> ${esc(x.use_case || "General hauling")}</p><p><b>Owner:</b> ${esc(x.owner || "Owner")}</p></div><div class="contacts"><button class="btn primary" data-action="book" data-id="${id}">Request Booking</button>${contactHtml}</div>${ownerControls}</div></article>`;
  }).join("");
}

function renderBookings() {
  safe("statBookings").textContent = bookings.length;
  if (!bookings.length) { safe("bookingList").innerHTML = `<div class="empty">No bookings yet.</div>`; return; }
  safe("bookingList").innerHTML = bookings.map((b) => {
    const id = esc(b.id);
    const isOwner = currentUser && b.owner_id === currentUser.id;
    const isRenter = currentUser && b.renter_id === currentUser.id;
    let actions = "";
    if (isOwner && b.status === "requested") actions += `<button class="btn green" data-action="accept" data-id="${id}">Accept</button><button class="btn danger" data-action="decline" data-id="${id}">Decline</button>`;
    if (isRenter && ["requested", "accepted", "payment_pending"].includes(b.status)) actions += `<button class="btn danger" data-action="cancel" data-id="${id}">Cancel</button>`;
    if (isAdmin && !["paid", "cancelled", "cancelled_by_admin", "declined"].includes(b.status)) actions += `<button class="btn danger" data-action="admin-cancel" data-id="${id}">Admin Cancel</button>`;
    return `<div class="bookingRow" data-booking-id="${id}"><span class="dot">${b.status === "accepted" || b.status === "paid" ? "✓" : b.status === "declined" ? "×" : "!"}</span><div><b>Status: ${esc(b.status)}</b><div class="small">Renter: ${esc(b.renter_email || "Unknown")}</div><div class="small">${esc(b.note || "")}</div></div><div class="bookingActions">${actions}</div></div>`;
  }).join("");
}

// One delegated click handler instead of inline onclick="fn('id')" strings, so ids are never parsed as JS.
const ACTIONS = { edit: editListing, delete: deleteListing, book: requestBooking, accept: (id) => updateBooking(id, "accepted"), decline: (id) => updateBooking(id, "declined"), cancel: cancelBooking, "admin-cancel": adminCancelBooking };
document.addEventListener("click", (e) => {
  const el = e.target.closest?.("[data-action]");
  if (!el || !ACTIONS[el.dataset.action]) return;
  e.preventDefault();
  ACTIONS[el.dataset.action](el.dataset.id);
});

function wireControls() {
  safe("signInBtn").onclick = signIn; safe("signUpBtn").onclick = signUp; safe("signOutBtn").onclick = signOut; safe("listingForm").onsubmit = createListing; safe("refreshBookingsBtn").onclick = async () => { await loadBookings(); renderBookings(); }; safe("clearFormBtn").onclick = () => { editingListingId = null; safe("listingForm").reset?.(); safe("listingSubmitText").textContent = "Publish listing"; }; ["search", "driverFilter", "typeFilter"].forEach((id) => safe(id).addEventListener("input", render));
}

init();
