/**
 * server.js — Spider-Man Backend (Production Ready)
 * ─────────────────────────────────────────────────────────
 * Deployed on Render — uses environment variables for config
 *
 * Routes:
 *   GET  /                      → health check
 *   POST /api/login             → verify Firebase idToken
 *   GET  /api/products          → list all products
 *   POST /api/products          → add product (admin only)
 *   PUT  /api/products/:id      → edit product (admin only)
 *   DELETE /api/products/:id    → delete product (admin only)
 *   GET  /api/cart/:uid         → fetch user cart
 *   POST /api/cart/:uid         → save user cart
 *   POST /api/orders            → place order
 *   GET  /api/orders/:uid       → user order history
 *   GET  /api/admin/orders      → all orders (admin only)
 */

require("dotenv").config();

const express = require("express");
const cors    = require("cors");
const admin   = require("firebase-admin");

const app  = express();
const PORT = process.env.PORT || 5000;

// ── CORS CONFIGURATION ─────────────────────────────────────────
// Allow requests from your Vercel frontend domain
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL || "http://localhost:5500",
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:8080"
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    // Allow any Vercel preview/production domain
    if (origin.endsWith(".vercel.app") || ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.use(express.json());

// Request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ── FIREBASE ADMIN INIT ─────────────────────────────────────────
let adminReady = false;
let db;
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "admin@spiderman.com,admin@spidey.com").split(",").map(e => e.trim());

try {
  let credential;

  if (process.env.FIREBASE_KEY) {
    // Production: parse service account from environment variable
    const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);
    credential = admin.credential.cert(serviceAccount);
    console.log("🔐 Using FIREBASE_KEY from environment variable.");
  } else {
    // Local development fallback: try serviceAccountKey.json
    try {
      const serviceAccount = require("./serviceAccountKey.json");
      credential = admin.credential.cert(serviceAccount);
      console.log("📁 Using local serviceAccountKey.json (dev mode).");
    } catch {
      throw new Error("No Firebase credentials found.");
    }
  }

  admin.initializeApp({ credential });
  db         = admin.firestore();
  adminReady = true;
  console.log("✅ Firebase Admin SDK initialised.");
} catch (err) {
  console.warn("⚠️  Firebase Admin SDK NOT initialised:", err.message);
  console.warn("   Set FIREBASE_KEY env variable with your service account JSON.");
}

// ── HELPERS ─────────────────────────────────────────────────────
async function verifyToken(req) {
  const h       = req.headers.authorization || "";
  const idToken = h.startsWith("Bearer ") ? h.slice(7) : req.body?.idToken;
  if (!idToken) throw { status: 401, message: "idToken required." };
  return await admin.auth().verifyIdToken(idToken);
}

async function verifyAdmin(req) {
  const decoded = await verifyToken(req);
  if (!ADMIN_EMAILS.includes(decoded.email)) {
    throw { status: 403, message: "Admin access required." };
  }
  return decoded;
}

function notReady(res) {
  return res.status(503).json({ success: false, error: "Backend not configured — Firebase credentials missing." });
}

// ── HEALTH CHECK ─────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({
    status: "🕷️ Spider-Man Backend is live!",
    message: "Backend running",
    adminReady,
    timestamp: new Date().toISOString()
  });
});

app.get("/api", (_req, res) => {
  res.json({ status: "🕷️ Spider-Man Backend API is live!", adminReady });
});

// ══════════════════════════════════════════════════
//  PRODUCTS
// ══════════════════════════════════════════════════

// GET /api/products — public
app.get("/api/products", async (_req, res) => {
  if (!adminReady) {
    // Static fallback when Firebase is not configured
    return res.json({ success: true, products: [
      {
        id: "spiderman-mask-v1",
        name: "Spider-Man Premium Mask",
        description: "Movie-accurate, high-density ABS shell with magnetic lenses and premium fabric.",
        price: 50,
        oldPrice: 89.99,
        discount: "44% OFF",
        emoji: "🕷️",
        category: "Marvel Collectibles",
        rating: 4.9,
        reviews: 2847,
        stock: true,
        limited: true,
        image: "https://images.unsplash.com/photo-1635863138275-d9b33299680b?w=400"
      }
    ]});
  }
  try {
    const snap = await db.collection("products").orderBy("createdAt", "desc").get();
    const products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ success: true, products });
  } catch (err) {
    console.error("Products fetch error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/products — admin only
app.post("/api/products", async (req, res) => {
  if (!adminReady) return notReady(res);
  try {
    await verifyAdmin(req);
    const data = { ...req.body, createdAt: admin.firestore.FieldValue.serverTimestamp() };
    delete data.idToken;
    const ref = await db.collection("products").add(data);
    res.status(201).json({ success: true, id: ref.id, message: "Product created." });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// PUT /api/products/:id — admin only
app.put("/api/products/:id", async (req, res) => {
  if (!adminReady) return notReady(res);
  try {
    await verifyAdmin(req);
    const data = { ...req.body, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    delete data.idToken;
    await db.collection("products").doc(req.params.id).update(data);
    res.json({ success: true, message: "Product updated." });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// DELETE /api/products/:id — admin only
app.delete("/api/products/:id", async (req, res) => {
  if (!adminReady) return notReady(res);
  try {
    await verifyAdmin(req);
    await db.collection("products").doc(req.params.id).delete();
    res.json({ success: true, message: "Product deleted." });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════
//  AUTH LOGIN
// ══════════════════════════════════════════════════
app.post("/api/login", async (req, res) => {
  if (!adminReady) return notReady(res);
  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ success: false, error: "idToken required." });
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    return res.json({ success: true, uid: decoded.uid, email: decoded.email, name: decoded.name || null });
  } catch (err) {
    return res.status(401).json({ success: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════
//  CART
// ══════════════════════════════════════════════════
app.get("/api/cart/:uid", async (req, res) => {
  if (!adminReady) return notReady(res);
  try {
    const decoded = await verifyToken(req);
    if (decoded.uid !== req.params.uid) return res.status(403).json({ success: false, error: "Forbidden." });
    const snap = await db.collection("carts").doc(req.params.uid).get();
    res.json({ success: true, cart: snap.exists ? (snap.data().cart || []) : [] });
  } catch (err) { res.status(err.status||500).json({ success: false, error: err.message }); }
});

app.post("/api/cart/:uid", async (req, res) => {
  if (!adminReady) return notReady(res);
  try {
    const decoded = await verifyToken(req);
    if (decoded.uid !== req.params.uid) return res.status(403).json({ success: false, error: "Forbidden." });
    const { cart } = req.body;
    if (!Array.isArray(cart)) return res.status(400).json({ success: false, error: "cart must be array." });
    await db.collection("carts").doc(req.params.uid).set({ cart, updatedAt: new Date().toISOString() });
    res.json({ success: true, message: "Cart saved." });
  } catch (err) { res.status(err.status||500).json({ success: false, error: err.message }); }
});

// ══════════════════════════════════════════════════
//  ORDERS
// ══════════════════════════════════════════════════
app.post("/api/orders", async (req, res) => {
  if (!adminReady) return notReady(res);
  try {
    const decoded  = await verifyToken(req);
    const { cart, total, ...rest } = req.body;
    if (!Array.isArray(cart) || !cart.length) return res.status(400).json({ success: false, error: "cart required." });

    const orderId  = "SPD-" + Math.random().toString(36).slice(2,8).toUpperCase();
    const orderDoc = { orderId, userId: decoded.uid, email: decoded.email, cart, total: total || 0, ...rest, status: "confirmed", createdAt: new Date().toISOString() };

    await db.collection("orders").doc(orderId).set(orderDoc);
    // Clear cart
    await db.collection("carts").doc(decoded.uid).set({ cart: [], updatedAt: new Date().toISOString() });

    console.log(`✅ Order placed: ${orderId}`);
    res.status(201).json({ success: true, orderId });
  } catch (err) { res.status(err.status||500).json({ success: false, error: err.message }); }
});

app.get("/api/orders/:uid", async (req, res) => {
  if (!adminReady) return notReady(res);
  try {
    const decoded = await verifyToken(req);
    if (decoded.uid !== req.params.uid) return res.status(403).json({ success: false, error: "Forbidden." });
    const snap   = await db.collection("orders").where("userId","==",req.params.uid).orderBy("createdAt","desc").get();
    res.json({ success: true, orders: snap.docs.map(d => d.data()) });
  } catch (err) { res.status(err.status||500).json({ success: false, error: err.message }); }
});

// GET /api/admin/orders — admin only
app.get("/api/admin/orders", async (req, res) => {
  if (!adminReady) return notReady(res);
  try {
    await verifyAdmin(req);
    const snap = await db.collection("orders").orderBy("createdAt","desc").get();
    res.json({ success: true, orders: snap.docs.map(d => d.data()) });
  } catch (err) { res.status(err.status||500).json({ success: false, error: err.message }); }
});

// ── 404 + ERROR ──────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "Route not found." }));
app.use((err, _req, res, _next) => { console.error("💥", err); res.status(500).json({ error: "Internal server error." }); });

// ── START ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🕷️  Spider-Man Backend running on port ${PORT}`);
  console.log(`   Admin SDK: ${adminReady}`);
  console.log(`   Environment: ${process.env.NODE_ENV || "development"}\n`);
});