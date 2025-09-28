
const makeWASocket = require("@adiwajshing/baileys").default;
const { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, makeInMemoryStore } = require("@adiwajshing/baileys");
const P = require("pino");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { nanoid } = require("nanoid");
const { db } = require("./store");
const catalog = require("./catalog");
const settings = require("./settings");
const { formatCurrency, calcShipping, applyCoupon, haversineKm, pickupSlots } = require("./utils");

const QR_IMAGE = path.join(__dirname, "public", "qr_code.png");
const API_BASE = process.env.API_BASE || "http://localhost:3000";

const STATES = {
  START: "START",
  CHOOSING: "CHOOSING",
  CART: "CART",
  CHECKOUT_NAME: "CHECKOUT_NAME",
  CHECKOUT_ADDRESS: "CHECKOUT_ADDRESS",
  CHECKOUT_DISTANCE: "CHECKOUT_DISTANCE",
  CHECKOUT_COUPON: "CHECKOUT_COUPON",
  CHECKOUT_METHOD: "CHECKOUT_METHOD",
  PAYMENT: "PAYMENT",
  DONE: "DONE"
};

function hero() {
  return `${settings.brand.accent} *${catalog.shopName}*\n_${settings.brand.tagline}_\n` +
         `Jam buka: ${settings.storeHours}\nKontak: ${catalog.contact}\n\n`;
}

function menuText() {
  const c1 = catalog.flavors.map((f, i) => `${i+1}. ${f.name} — ${formatCurrency(f.price)}  ${f.stock<=0?"(habis)":" "}`).join("\n");
  const c2 = catalog.promos.map((p, i) => `P${i+1}. ${p.name} — ${formatCurrency(p.price)}  ${p.stock<=0?"(habis)":" "}`).join("\n");
  return hero() +
`*Varian pcs:*\n${c1}\n\n` +
`*Paket hemat:*\n${c2}\n\n` +
`🛒 Tambah item cepat:\n• Ketik *1x3* (varian #1, 3 pcs)\n• Ketik *P1* (paket #1)\n• Atau format bebas: *Beli: Original x2, Cokelat x1*\n\n` +
`Perintah: *cart*, *checkout*, *status*, *help*`;
}

function cartText(cart) {
  if (!cart.length) return "Keranjang kosong. Ketik *menu* untuk memilih donat.";
  let total = 0;
  const lines = cart.map((it, idx) => {
    const lineTotal = it.price * (it.qty || 1);
    total += lineTotal;
    return `${idx+1}. ${it.name} x${it.qty || 1} — ${formatCurrency(lineTotal)}`;
  });
  lines.push(`\nSubtotal: *${formatCurrency(total)}*`);
  lines.push("\nKetik *hapus <no>* untuk menghapus item. Ketik *checkout* untuk lanjut.");
  return lines.join("\n");
}

async function ensureUser(jid) {
  await db.read();
  if (!db.data.users[jid]) {
    db.data.users[jid] = { state: STATES.START, cart: [], profile: {}, last_order_id: null };
    await db.write();
  }
  return db.data.users[jid];
}

async function setUser(jid, patch) {
  await db.read();
  db.data.users[jid] = { ...(db.data.users[jid]||{}), ...patch };
  await db.write();
}

async function appendOrder(order) {
  await db.read();
  db.data.orders.push(order);
  await db.write();
}

function parseAdd(text) {
  const t = text.replace(/\s+/g,'').toLowerCase();
  let m = t.match(/^p(\d+)$/i);
  if (m) {
    const idx = parseInt(m[1])-1;
    const bundle = catalog.promos[idx];
    if (!bundle || (bundle.stock||0)<=0) return null;
    return { id: bundle.id, name: bundle.name, price: bundle.price, qty: 1, type: "bundle" };
  }
  m = t.match(/^(\d+)x?(\d+)?$/);
  if (!m) return null;
  const idx = parseInt(m[1])-1;
  const qty = Math.max(1, parseInt(m[2]||"1"));
  const item = catalog.flavors[idx];
  if (!item || (item.stock||0) < qty) return null;
  return { id: item.id, name: item.name, price: item.price, qty, type: "flavor" };
}

function parseBeliText(text) {
  const m = text.match(/^beli\s*:\s*(.+)$/i);
  if (!m) return null;
  const items = [];
  const parts = m[1].split(",");
  for (const part of parts) {
    const mm = part.trim().match(/^(.+?)\s*x\s*(\d+)$/i);
    if (!mm) return null;
    const varian = mm[1].trim().toLowerCase();
    const qty = parseInt(mm[2], 10);
    if (!(qty > 0)) return null;
    const prod = catalog.flavors.find(p => p.name.toLowerCase() === varian);
    if (prod && (prod.stock||0) >= qty) {
      items.push({ id: prod.id, name: prod.name, price: prod.price, qty, type: "flavor" });
      continue;
    }
    const pack = catalog.promos.find(p => p.name.toLowerCase() === varian);
    if (pack && (pack.stock||0) >= qty) {
      items.push({ id: pack.id, name: pack.name, price: pack.price, qty, type: "bundle" });
      continue;
    }
    return { error: `Varian/paket "${mm[1].trim()}" tidak ditemukan / stok kurang.` };
  }
  return { items };
}

async function createPayment(order) {
  const { data } = await axios.post(`${API_BASE}/api/create-payment`, { order_id: order.id, amount: order.total });
  return data.link;
}

function receipt(order) {
  const lines = [
    `${settings.brand.accent} *Terima kasih! Order #${order.id}*`,
    `Nama: ${order.name}`,
    `Alamat: ${order.address}`,
    ``,
    ...order.items.map(it => `• ${it.name} x${it.qty} — ${formatCurrency(it.price * it.qty)}`),
    ``,
    `Subtotal: ${formatCurrency(order.subtotal)}`
  ];
  if (order.coupon && order.discount>0) lines.push(`Diskon (${order.coupon}): -${formatCurrency(order.discount)}`);
  if (order.shipping_fee>0) lines.push(`Ongkir: ${formatCurrency(order.shipping_fee)}`);
  lines.push(`*Total: ${formatCurrency(order.total)}*`);
  lines.push(`Metode: ${order.method === "COD" ? "COD / Pickup" : "Payment Gateway"}`);
  if (order.payment?.link) {
    lines.push(`Pembayaran: ${order.payment.status === "PAID" ? "✅ Lunas" : "⏳ Menunggu"}`);
    if (order.payment.status !== "PAID") lines.push(`Bayar di sini: ${order.payment.link}`);
  } else if (order.method === "COD") {
    lines.push(`Siapkan uang pas saat kurir tiba / saat pickup.`);
  }
  lines.push(`\nPickup: ${catalog.addressPickup}`);
  lines.push(`Catatan: ${catalog.deliveryNote}`);
  return lines.join("\n");
}

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const { version } = await fetchLatestBaileysVersion();
  const store = makeInMemoryStore({ logger: P({ level: "silent" }) });

  const sock = makeWASocket({
    version,
    printQRInTerminal: true,
    auth: state,
    logger: P({ level: "silent" })
  });

  store.bind(sock.ev);
  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      const QRCode = require("qrcode");
      QRCode.toFile(QR_IMAGE, qr, { width: 512 }, (err) => {
        if (err) console.error("QR write error:", err);
      });
    }
    if (connection === "close") {
      const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) connectToWhatsApp();
    } else if (connection === "open") {
      console.log("✅ WhatsApp connected");
      if (fs.existsSync(QR_IMAGE)) fs.unlinkSync(QR_IMAGE);
    }
  });

  async function sendMenu(jid) {
    const sections = [
      {
        title: "Varian per pcs",
        rows: catalog.flavors.map((f, i) => ({
          title: `${i+1}. ${f.name}`,
          rowId: `add:${i+1}x1`,
          description: `${formatCurrency(f.price)} • Stok: ${f.stock}`
        }))
      },
      {
        title: "Paket Hemat",
        rows: catalog.promos.map((p, i) => ({
          title: `P${i+1}. ${p.name}`,
          rowId: `add:P${i+1}`,
          description: `${formatCurrency(p.price)} • Stok: ${p.stock}`
        }))
      }
    ];
    await sock.sendMessage(jid, {
      text: menuText(),
      footer: "Pilih dari list di bawah atau ketik manual.",
      listType: 1,
      title: "Menu Donat",
      buttonText: "Lihat Menu",
      sections
    });
    await sock.sendMessage(jid, {
      text: "Aksi cepat:",
      templateButtons: [
        { index: 1, quickReplyButton: { displayText: "🛒 Cart", id: "cmd:cart" } },
        { index: 2, quickReplyButton: { displayText: "✅ Checkout", id: "cmd:checkout" } },
        { index: 3, quickReplyButton: { displayText: "❓ Help", id: "cmd:help" } }
      ]
    });
  }

  function extractText(msg) {
    if (msg.message?.listResponseMessage) {
      return msg.message.listResponseMessage.singleSelectReply?.selectedRowId || "";
    }
    if (msg.message?.templateButtonReplyMessage) {
      return msg.message.templateButtonReplyMessage.selectedId || "";
    }
    if (msg.message?.locationMessage) {
      return "__LOCATION__";
    }
    if (msg.message?.conversation) return msg.message.conversation;
    if (msg.message?.extendedTextMessage) return msg.message.extendedTextMessage.text || "";
    if (msg.message?.imageMessage?.caption) return msg.message.imageMessage.caption;
    if (msg.message?.videoMessage?.caption) return msg.message.videoMessage.caption;
    return "";
  }

  async function isAdmin(jid) {

    return settings.admins.includes(jid);
  }

  sock.ev.on("messages.upsert", async (m) => {
    const msg = m.messages && m.messages[0];
    if (!msg || !msg.message) return;
    const jid = msg.key.remoteJid;
    const textRaw = extractText(msg);
    if (!textRaw) return;
    const text = textRaw.trim();

    // Handle location pin
    if (text === "__LOCATION__") {
      const loc = msg.message.locationMessage;
      const userLatLon = { lat: loc.degreesLatitude, lon: loc.degreesLongitude };
      const km = Math.round(haversineKm(catalog.storeCoords, userLatLon) * 10) / 10;
      const ship = calcShipping(km);
      await setUser(jid, { distanceKm: km });
      const note = ship.allowed ? `Ongkir: ${formatCurrency(ship.fee)}.` : `Di luar radius layanan, silakan pilih pickup.`;
      await sock.sendMessage(jid, { text: `Lokasi diterima. Jarak dari toko ~ ${km} km. ${note}` });
      return;
    }

    const user = await ensureUser(jid);

    // Parser "Beli: Varian xJumlah"
    const beli = parseBeliText(text);
    if (beli) {
      if (beli.error) { await sock.sendMessage(jid, { text: beli.error }); return; }
      const cartNew = user.cart || [];
      cartNew.push(...beli.items);
      await setUser(jid, { cart: cartNew, state: STATES.CHOOSING });
      const subtotal = cartNew.reduce((a,b)=>a+b.price*(b.qty||1),0);
      const lines = [
        "✅ Pesanan kamu:",
        ...cartNew.map(it => `• ${it.name} x${it.qty} — ${formatCurrency(it.price * it.qty)}`),
        `Total sementara: *${formatCurrency(subtotal)}*`,
        "",
        "Ketik *checkout* untuk lanjut, atau *menu* untuk tambah item."
      ];
      await sock.sendMessage(jid, { text: lines.join("\n") });
      return;
    }

    // Buttons/list
    
    // ==== Admin UI triggers ====
    if (await isAdmin(jid) && (/^!admin$/i.test(text) || /^admin$/i.test(text))) {
      return sendAdminMenu(jid);
    }
    if (await isAdmin(jid) && text.startsWith("admin:")) {
      const parts = text.split(":");
      const action = parts[1];
      if (action === "orders") return adminListRecentOrders(jid);
      if (action === "stock") {
        const f = catalog.flavors.map(x => `${x.name}: ${x.stock}`).join("\n");
        const p = catalog.promos.map(x => `${x.name}: ${x.stock}`).join("\n");
        return sock.sendMessage(jid, { text: `Stok:\n${f}\n\nPaket:\n${p}` });
      }
      if (action === "order" && parts[2]) {
        return adminShowOrderActions(jid, parts[2]);
      }
      if (action === "paid" && parts[2]) {
        return adminMarkPaid(jid, parts[2]);
      }
      if (action === "status" && parts[2] && parts[3]) {
        return adminSetStatus(jid, parts[2], parts[3]);
      }
      if (action === "markpaid") {
        await db.read();
        const r = db.data.orders.slice(-5).reverse().map(o=>o.id).join(", ");
        return sock.sendMessage(jid, { text: `Pilih order dari daftar: admin:orders → pilih salah satu. ID contoh: ${r}` });
      }
      if (action === "setstatus") {
        return sock.sendMessage(jid, { text: "Pilih order dulu: admin:orders → pilih → gunakan tombol status." });
      }
    }
    // ==== end Admin UI triggers ====

    if (text.startsWith("cmd:")) {
      const cmd = text.split(":")[1];
      if (cmd === "cart") return sock.sendMessage(jid, { text: cartText(user.cart||[]) });
      if (cmd === "checkout") { 
        if (!user.cart.length) return sock.sendMessage(jid, { text: "Keranjang kosong. Ketik *menu* dahulu." });
        await setUser(jid, { state: STATES.CHECKOUT_NAME });
        return sock.sendMessage(jid, { text: "Nama pemesan?" });
      }
      if (cmd === "help") return sock.sendMessage(jid, { text: helpText() });
    }

    if (text.startsWith("add:")) {
      const t = text.replace(/^add:/, "");
      const item = parseAdd(t);
      if (!item) return sock.sendMessage(jid, { text: "Maaf, stok tidak cukup / input tidak dikenal." });
      const cart = user.cart || [];
      cart.push(item);
      await setUser(jid, { cart, state: STATES.CHOOSING });
      return sock.sendMessage(jid, { text: `Ditambahkan: ${item.name} x${item.qty}.\n\n${cartText(cart)}` });
    }

    // Global commands
    if (/^menu$/i.test(text)) return sendMenu(jid);
    if (/^help$/i.test(text)) return sock.sendMessage(jid, { text: helpText() });
    if (/^cart$/i.test(text)) return sock.sendMessage(jid, { text: cartText(user.cart || []) });
    if (/^status$/i.test(text)) {
      await db.read();
      const order = db.data.orders.find(o => o.id === user.last_order_id);
      if (!order) return sock.sendMessage(jid, { text: "Belum ada order. Ketik *menu* untuk mulai." });
      return sock.sendMessage(jid, { text: `Status Order #${order.id}: ${order.payment?.status || order.status}\n\n${receipt(order)}` });
    }
    if (/^hapus\s+(\d+)$/i.test(text)) {
      const idx = parseInt(text.match(/^hapus\s+(\d+)/i)[1]) - 1;
      user.cart.splice(idx, 1);
      await setUser(jid, { cart: user.cart });
      return sock.sendMessage(jid, { text: cartText(user.cart) });
    }
    if (/^checkout$/i.test(text)) {
      if (!user.cart.length) return sock.sendMessage(jid, { text: "Keranjang kosong. Ketik *menu* untuk memilih donat." });
      await setUser(jid, { state: STATES.CHECKOUT_NAME });
      return sock.sendMessage(jid, { text: "Nama pemesan?" });
    }

    // Admin shortcuts
    if (/^!orders$/i.test(text) && await isAdmin(jid)) {
      await db.read();
      const recent = db.data.orders.slice(-10).reverse().map(o => `#${o.id} ${o.name} — ${formatCurrency(o.total)} — ${o.payment?.status || o.status}`).join("\n");
      return sock.sendMessage(jid, { text: recent || "Belum ada order." });
    }
    if (/^!stock$/i.test(text) && await isAdmin(jid)) {
      const f = catalog.flavors.map(x => `${x.name}: ${x.stock}`).join("\n");
      const p = catalog.promos.map(x => `${x.name}: ${x.stock}`).join("\n");
      return sock.sendMessage(jid, { text: `Stok:\n${f}\n\nPaket:\n${p}` });
    }
    if (/^!addstock\s+(.+)\s+(\d+)$/i.test(text) && await isAdmin(jid)) {
      const m2 = text.match(/^!addstock\s+(.+)\s+(\d+)$/i);
      const name = m2[1].trim().toLowerCase(), qty = parseInt(m2[2],10);
      const tgt = catalog.flavors.find(x=>x.name.toLowerCase()===name) || catalog.promos.find(x=>x.name.toLowerCase()===name);
      if (!tgt) return sock.sendMessage(jid, { text: "Varian/paket tidak ditemukan." });
      tgt.stock += qty;
      return sock.sendMessage(jid, { text: `Stok ${tgt.name} ditambah ${qty}. Sekarang: ${tgt.stock}` });
    }
    if (/^!order\s+(\w+)$/i.test(text) && await isAdmin(jid)) {
      await db.read();
      const oid = text.match(/^!order\s+(\w+)$/i)[1];
      const o = db.data.orders.find(x=>x.id===oid);
      if (!o) return sock.sendMessage(jid, { text: "Order tidak ditemukan." });
      const summary = [
        `#${o.id} — ${o.name} (${o.address})`,
        ...o.items.map(it=>`• ${it.name} x${it.qty} — ${formatCurrency(it.price*it.qty)}`),
        `Total: ${formatCurrency(o.total)} (${o.method})`,
        `Status: ${o.payment?.status || o.status}`
      ];
      return sock.sendMessage(jid, { text: summary.join("\n") });
    }

    // State machine
    switch (user.state) {
      case STATES.START:
      case STATES.CHOOSING: {
        const item = parseAdd(text);
        if (!item) return sendMenu(jid);
        const cart = user.cart || [];
        cart.push(item);
        await setUser(jid, { cart, state: STATES.CHOOSING });
        return sock.sendMessage(jid, { text: `Ditambahkan: ${item.name} x${item.qty}.\n\n${cartText(cart)}` });
      }
      case STATES.CHECKOUT_NAME: {
        user.profile.name = text;
        await setUser(jid, { state: STATES.CHECKOUT_ADDRESS, profile: user.profile });
        return sock.sendMessage(jid, { text: "Alamat lengkap (jika *pickup*, ketik: pickup):" });
      }
      case STATES.CHECKOUT_ADDRESS: {
        if (/^pickup$/i.test(text)) {
          user.profile.address = "(Pickup)";
          await setUser(jid, { state: STATES.CHECKOUT_COUPON, profile: user.profile, distanceKm: null });
          const slots = pickupSlots().slice(0,6);
          await sock.sendMessage(jid, { text: "Punya kode kupon? ketik kuponnya atau ketik *skip*." });
          await sock.sendMessage(jid, { text: "Pilih jam pickup (ketik salah satu jika ingin):\n" + slots.map(s=>`• ${s}`).join("\n") });
          return;
        } else {
          user.profile.address = text;
          await setUser(jid, { state: STATES.CHECKOUT_DISTANCE, profile: user.profile });
          return sock.sendMessage(jid, { text: "Kirim *Lokasi (pin)* via WhatsApp (ikon klip ➜ Location), atau ketik jarak (km), contoh: 3" });
        }
      }
      case STATES.CHECKOUT_DISTANCE: {
        const km = parseFloat(text.replace(",", "."));
        if (Number.isNaN(km) || km <= 0) return sock.sendMessage(jid, { text: "Masukkan angka jarak yang benar (contoh: 3)" });
        const ship = calcShipping(km);
        await setUser(jid, { state: STATES.CHECKOUT_COUPON, distanceKm: km });
        if (!ship.allowed) {
          return sock.sendMessage(jid, { text: "Alamat di luar jangkauan COD. Silakan pilih pickup. Punya kupon? ketik kuponnya atau *skip*." });
        }
        return sock.sendMessage(jid, { text: `Ongkir: ${formatCurrency(ship.fee)}. Punya kupon? ketik kuponnya atau *skip*.` });
      }
      case STATES.CHECKOUT_COUPON: {
        let couponCode = null;
        if (!/^skip$/i.test(text)) couponCode = text.trim().toUpperCase();
        await setUser(jid, { state: STATES.CHECKOUT_METHOD, couponCode });
        return sock.sendMessage(jid, { text: "Metode pembayaran: ketik *cod* (bayar di tempat/pickup) atau *pg* (payment gateway):" });
      }
      case STATES.CHECKOUT_METHOD: {
        const method = text.toLowerCase();
        if (!["cod", "pg"].includes(method)) return sock.sendMessage(jid, { text: "Pilih *cod* atau *pg*." });

        const cart = user.cart || [];
        for (const it of cart) {
          const src = it.type === "bundle" ? catalog.promos.find(p=>p.id===it.id) : catalog.flavors.find(f=>f.id===it.id);
          if (!src || (src.stock||0) < (it.qty||1)) {
            return sock.sendMessage(jid, { text: `Stok tidak cukup untuk ${it.name}. Silakan kurangi jumlah / pilih varian lain.` });
          }
        }

        const subtotal = cart.reduce((a, b) => a + b.price * (b.qty || 1), 0);
        const ship = user.distanceKm ? calcShipping(user.distanceKm) : { fee: 0, allowed: true };
        const couponRes = applyCoupon(subtotal, user.couponCode);

        const order = {
          id: nanoid(8),
          jid,
          name: user.profile.name,
          address: user.profile.address,
          distance_km: user.distanceKm || null,
          items: cart,
          subtotal,
          discount: couponRes.discount,
          coupon: couponRes.code,
          shipping_fee: ship.allowed ? ship.fee : 0,
          total: (couponRes.total) + (ship.allowed ? ship.fee : 0),
          method: method === "cod" ? "COD" : "GATEWAY",
          payment: { status: method === "cod" ? "COD" : "PENDING", link: null },
          status: "CREATED",
          created_at: new Date().toISOString()
        };

        if (method === "pg") {
          const link = await createPayment(order);
          order.payment.link = link;
        }

        for (const it of cart) {
          const src = it.type === "bundle" ? catalog.promos.find(p=>p.id===it.id) : catalog.flavors.find(f=>f.id===it.id);
          if (src) src.stock -= (it.qty||1);
        }

        await appendOrder(order);
        await setUser(jid, { state: STATES.DONE, cart: [], last_order_id: order.id });

        for (const adminJid of settings.admins) {
          await sock.sendMessage(adminJid, { text: `🔔 Order baru #${order.id} dari ${order.name}\nTotal ${formatCurrency(order.total)}\nMetode: ${order.method}` }).catch(()=>{});
        }

        return sock.sendMessage(jid, { text: receipt(order) });
      }
      case STATES.DONE: {
        return sock.sendMessage(jid, { text: "Order sudah dibuat. Ketik *status* untuk cek, atau *menu* untuk order lagi." });
      }
      default:
        return sendMenu(jid);
    }
  });

  return sock;
}

function helpText() {
  return `${settings.brand.accent} *Cara Order Singkat*\n` +
`1) Ketik *menu* → pilih varian/paket dari list atau format *Beli: ...*\n` +
`2) Tambah jumlah cepat: *1x3* (varian #1 tiga buah) / *P1*\n` +
`3) Cek *cart*, hapus item: *hapus 2*\n` +
`4) *checkout* → isi nama, alamat (atau *pickup*), lalu kirim *lokasi* atau jarak (km), kupon (opsional), pilih bayar (*cod*/*pg*)\n` +
`5) Cek *status* untuk melihat progress order.\n\n` +
`Tips: tekan tombol cepat *Cart*, *Checkout*, *Help* di bawah pesan.`;
}

module.exports = { connectToWhatsApp };
