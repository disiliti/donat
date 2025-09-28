# Donut Bot WA — Production Repo

Bot WhatsApp jualan donat dengan fitur:
- Menu interaktif (List & Quick Replies)
- Format bebas: `Beli: Original x2, Cokelat x1`
- Kirim **Lokasi (pin)** → hitung ongkir otomatis (Haversine, radius & tier)
- **Pickup** + slot jam
- **Kupon** (percent/flat)
- **Payment Gateway** (link demo + webhook) / **COD**
- **Admin UI** (chat): `admin` / `!admin` → panel interaktif (Mark PAID, set status)
- Perintah admin lama: `!orders`, `!stock`, `!addstock <nama> <qty>`, `!order <ID>`
- Penyimpanan LowDB (`db.json`)

## Struktur
```
app/                  # Source Node.js bot (WhatsApp + API)
  index.js
  server.js
  whatsapp.js
  utils.js
  catalog.js
  settings.js
  store.js
  package.json
scripts/              # Installer & CLI
  install.sh
  update.sh
  uninstall.sh
  donat              # CLI menu (symlink/copy to /usr/local/bin/donat)
```

## Quick Start (Git)
```bash
# 1) Clone
git clone https://github.com/disiliti/donat.git
cd donat

# 2) Install (Ubuntu/Debian)
sudo bash scripts/install.sh

# 3) Buka menu CLI
donat

# 4) (Pertama kali) Set admin JID & Scan QR
#   - dari menu pilih: "1. Set Admin" → masukkan 62812XXXXXXX
#   - pilih: "2. Scan QR" → scan dari WhatsApp
```

## Konfigurasi Penting
- Koordinat toko: `app/catalog.js`
```js
storeCoords: { lat: -6.200000, lon: 106.816666 } // ganti ke titik toko
```
- Admin JID (otomatis di-setup via menu `donat`):
```js
admins: ["62812XXXXXXX@s.whatsapp.net"]
```

## Perintah CLI
Ketik `donat` di VPS untuk membuka menu:
- **1. Masukkan Nomor Admin** → simpan ke `settings.js`
- **2. Scan Nomor Bot (QR)** → stop PM2 sementara, tampilkan QR di terminal
- **3. Restart Bot**
- **4. Status Bot**
- **5. Logs Bot (live)**
- **6. Update dari Git**
- **7. Uninstall Bot**
- **8. Edit Koordinat Toko**
- **9. Keluar**

### Update
```bash
donat         # pilih menu 6 (Update)
# atau
sudo bash scripts/update.sh
```

### Uninstall
```bash
donat         # pilih menu 7 (Uninstall)
# atau
sudo bash scripts/uninstall.sh
```

## Catatan
- Bot berjalan sebagai proses **PM2** bernama `donutbot`.
- Folder data (auth WA + db.json) berada di `app/` (pastikan backup sebelum reinstall).
- Payment gateway masih demo. Ganti integrasi di `app/server.js` atau `createPayment()` pada `app/whatsapp.js`.
