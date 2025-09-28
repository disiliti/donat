
module.exports = {
  admins: [
    // contoh: "6281234567890@s.whatsapp.net"
  ],
  shipping: {
    tiers: [
      { maxKm: 2, fee: 5000 },
      { maxKm: 5, fee: 10000 },
      { maxKm: 8, fee: 15000 }
    ],
    maxRadiusKm: 8
  },
  coupons: {
    "ENAK10": { type: "percent", value: 10, note: "Diskon 10% semua item" },
    "HEMAT5": { type: "flat", value: 5000, note: "Potongan Rp5.000" }
  },
  brand: { accent: "🍩", tagline: "Donat baru goreng, lembut & legit!" },
  storeHours: "Setiap hari 08:00–20:00 WIB"
};
