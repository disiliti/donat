
# WhatsApp Donut Bot — Plus

Fitur:
- UI interaktif (List & Quick Buttons)
- Parsing pesanan bebas: `Beli: Original x2, Cokelat x1`
- Kirim Lokasi untuk ongkir otomatis (haversine) + radius layanan
- COD / Pickup (slot jam) / Payment Gateway (link + webhook)
- Kupon diskon (percent/flat)
- Stok real-time, receipt rapi, tracking `status`
- Admin: `!orders`, `!stock`, `!addstock <nama> <qty>`, `!order <id>`

## Jalankan
```
npm install
npm start
```
Scan QR di terminal (WhatsApp > Linked devices).

## Konfigurasi
- `catalog.js`: varian, paket, `storeCoords`, alamat pickup
- `settings.js`: admin JID, ongkir tiers/radius, kupon, brand, jam buka
- `utils.js`: ongkir, rupiah, haversine, slot pickup

## Payment Gateway
- Endpoint demo: `POST /api/create-payment` → `{ link }`
- Webhook demo: `POST /api/payment-webhook`
Ganti implementasi sesuai gateway (OrderKuota/Midtrans/Xendit) lalu isi `API_BASE` env jika perlu.
