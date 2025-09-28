
const settings = require("./settings");

function formatCurrency(n) {
  try { return "Rp" + Number(n||0).toLocaleString("id-ID"); } catch { return "Rp" + (n||0); }
}

function calcShipping(distanceKm) {
  if (distanceKm == null) return { fee: 0, allowed: false, reason: "unknown_distance" };
  if (distanceKm > settings.shipping.maxRadiusKm) return { fee: 0, allowed: false, reason: "out_of_radius" };
  for (const t of settings.shipping.tiers) {
    if (distanceKm <= t.maxKm) return { fee: t.fee, allowed: true };
  }
  return { fee: settings.shipping.tiers.at(-1).fee, allowed: true };
}

function applyCoupon(subtotal, code) {
  if (!code) return { subtotal, discount: 0, total: subtotal, note: null, code: null };
  const c = settings.coupons[code.toUpperCase()];
  if (!c) return { subtotal, discount: 0, total: subtotal, note: "Kode tidak dikenal", code: null };
  let discount = 0;
  if (c.type === "percent") discount = Math.floor((subtotal * c.value) / 100);
  if (c.type === "flat") discount = c.value;
  const total = Math.max(0, subtotal - discount);
  return { subtotal, discount, total, note: c.note, code: code.toUpperCase() };
}

function haversineKm(a, b) {
  const toRad = d => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat/2), sinDLon = Math.sin(dLon/2);
  const h = sinDLat*sinDLat + Math.cos(la1)*Math.cos(la2)*sinDLon*sinDLon;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function pickupSlots() {
  const slots = [];
  for (let h=9; h<=19; h++) {
    for (let m of [0,30]) {
      slots.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")} WIB`);
    }
  }
  return slots;
}

module.exports = { formatCurrency, calcShipping, applyCoupon, haversineKm, pickupSlots };
