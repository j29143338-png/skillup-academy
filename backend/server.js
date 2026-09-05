/**
 * SkillUp Academy — Backend API
 * Express + PostgreSQL (Neon/Render) with local-file fallback for dev.
 *
 * Storage:
 *   - If DATABASE_URL is set → PostgreSQL (persistent, production)
 *   - Else → local ./data.json file (dev only, NOT persistent on Render)
 *
 * Auth:
 *   - HTTP Basic Auth on every /admin/* route except /admin/login, /admin/logout
 *   - Credentials from ADMIN_USERNAME / ADMIN_PASSWORD_HASH (bcrypt) env vars.
 *     Set ADMIN_PASSWORD_HASH in production — see README for how to generate it.
 *     ADMIN_PASSWORD (plaintext) is a dev-only fallback and logs a warning.
 */

// Reads backend/.env when present, so local runs can pick up DATABASE_URL and
// the admin credentials without exporting them by hand every session. The file
// is gitignored and never leaves the machine. On Render there is no .env and
// the real environment variables are used, so this is a no-op there.
// `quiet` suppresses the banner dotenv v17 prints on every start.
require("dotenv").config({ path: require("path").join(__dirname, ".env"), quiet: true });

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { ensureCabinetSchema, ensureOwner, sessionUser } = require("./cabinet");
const { cabinetRouter } = require("./cabinetApi");

const PORT = process.env.PORT || 8000;
const ADMIN_USER = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || "";
const ADMIN_PASSWORD_PLAINTEXT = process.env.ADMIN_PASSWORD || "";
const DATABASE_URL = process.env.DATABASE_URL || "";

if (!ADMIN_PASSWORD_HASH) {
  console.warn(
    "⚠️  ADMIN_PASSWORD_HASH not set — falling back to plaintext ADMIN_PASSWORD comparison (dev only). " +
    "Set ADMIN_PASSWORD_HASH in production, see README."
  );
}

async function checkAdminCredentials(user, pass) {
  if (user !== ADMIN_USER) return false;
  if (ADMIN_PASSWORD_HASH) {
    // A malformed hash makes bcrypt reject — treat that as a failed login,
    // never as an unhandled rejection that would hang the request.
    try {
      return await bcrypt.compare(pass || "", ADMIN_PASSWORD_HASH);
    } catch (e) {
      console.error("bcrypt.compare failed — check ADMIN_PASSWORD_HASH format:", e.message);
      return false;
    }
  }
  return !!ADMIN_PASSWORD_PLAINTEXT && pass === ADMIN_PASSWORD_PLAINTEXT;
}

// ── Simple in-memory rate limiter (per IP + bucket) ─────────────────────────
// Not distributed — fine for a single Render instance. Resets on restart.
const rateBuckets = new Map();
// Drop buckets nothing has touched for an hour so the map can't grow forever.
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [key, hits] of rateBuckets) {
    if (!hits.length || hits[hits.length - 1] < cutoff) rateBuckets.delete(key);
  }
}, 30 * 60 * 1000).unref();

function rateLimit(bucket, max, windowMs) {
  return (req, res, next) => {
    // req.ip resolves through the trusted proxy hops configured on the app
    // (see "trust proxy" below). Reading X-Forwarded-For directly is not safe:
    // a client can send its own value and rotate it to get a fresh bucket on
    // every request, which defeats the limit entirely.
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const key = `${bucket}:${ip}`;
    const now = Date.now();
    const hits = (rateBuckets.get(key) || []).filter((t) => now - t < windowMs);
    if (hits.length >= max) {
      return res.status(429).json({ detail: "Too many requests, please try again later." });
    }
    hits.push(now);
    rateBuckets.set(key, hits);
    next();
  };
}

// ── Basic input sanitising ──────────────────────────────────────────────────
function clean(value, maxLen = 500) {
  return String(value ?? "").trim().slice(0, maxLen);
}

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (ALLOWED_ORIGINS.length === 0) {
  console.warn("⚠️  ALLOWED_ORIGIN not set — CORS is open to any origin (dev only). Set it in production.");
}

const app = express();

// Render (like most PaaS) puts exactly one proxy in front of the app. Trusting
// that single hop makes req.ip the address the proxy actually saw, rather than
// whatever the client claims in X-Forwarded-For. Override with TRUST_PROXY if
// the deployment ever gains or loses a hop.
app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 1));

app.use(
  cors(
    ALLOWED_ORIGINS.length
      ? { origin: ALLOWED_ORIGINS }
      : {}
  )
);
app.use(express.json({ limit: "5mb" }));

// Every write is a read-modify-write of a single JSON row, so two mutating
// requests running at once can both read the old value and the second save
// silently discards the first (a lost application or review). Mutating requests
// are rare and fast here, so serialising them is the simplest correct fix and
// keeps each handler's load -> modify -> save sequence atomic.
const WRITE_LOCK_TIMEOUT_MS = 15000;
let writeChain = Promise.resolve();
app.use((req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  writeChain = writeChain.then(
    () =>
      new Promise((resolve) => {
        let done = false;
        const release = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve();
        };
        // Safety valve: never let one stuck response block every later write.
        const timer = setTimeout(release, WRITE_LOCK_TIMEOUT_MS);
        res.on("finish", release);
        res.on("close", release);
        next();
      })
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE LAYER
// ─────────────────────────────────────────────────────────────────────────────

let pool = null;
let STORAGE_MODE = "local file (NOT persistent)";

if (DATABASE_URL) {
  const { Pool } = require("pg");
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  STORAGE_MODE = "PostgreSQL (persistent)";
}

const LOCAL_FILE = path.join(__dirname, "data.json");

// ─────────────────────────────────────────────────────────────────────────────
// SEED VERSIONING
// seedData() used to run only when storage was empty; after that the stored
// copy always won. That left every environment stranded on whatever the
// catalogue looked like the first time it started — a second dev machine with
// an older data.json, and the production database, both kept serving stale
// courses while the code moved on, with no sign anything was wrong.
//
// Stamping the stored blob with the seed version lets each environment notice
// it is behind and pull the catalogue forward on the next request.
//
// BUMP SEED_VERSION whenever the catalogue inside seedData() changes,
// otherwise the change reaches nobody who already has data.
// ─────────────────────────────────────────────────────────────────────────────
const SEED_VERSION = 2;

// The collections seedData owns and may overwrite. Everything else is left
// exactly as stored: applications and feedbacks sent by visitors, and results
// entered through the admin panel, are never touched by a refresh.
const SEEDED_COLLECTIONS = ["courses", "teachers", "prices", "testimonials"];

// Returns the data to store when `stored` is behind the current seed, or null
// when it is already current and nothing needs writing.
function withCurrentSeed(stored) {
  // Only ever move forward. A developer running an older checkout against the
  // shared database must not drag the catalogue back to their seed.
  if (stored && Number(stored._seedVersion) >= SEED_VERSION) return null;
  const seeded = seedData();
  const next = { ...seeded, ...stored };
  for (const key of SEEDED_COLLECTIONS) next[key] = seeded[key];
  next._seedVersion = SEED_VERSION;
  return next;
}

async function ensureTable() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS skillup_data (
      id INT PRIMARY KEY,
      data JSONB NOT NULL
    )
  `);
}

async function loadData() {
  if (pool) {
    await ensureTable();
    const res = await pool.query("SELECT data FROM skillup_data WHERE id = 1");
    if (res.rows.length > 0) {
      const refreshed = withCurrentSeed(res.rows[0].data);
      if (!refreshed) return res.rows[0].data;
      await pool.query("UPDATE skillup_data SET data = $1 WHERE id = 1", [refreshed]);
      console.log(`Catalogue refreshed to seed version ${SEED_VERSION}`);
      return refreshed;
    }
    const seeded = withCurrentSeed(null);
    await pool.query("INSERT INTO skillup_data (id, data) VALUES (1, $1)", [seeded]);
    return seeded;
  }
  // Local file fallback
  if (fs.existsSync(LOCAL_FILE)) {
    try {
      const stored = JSON.parse(fs.readFileSync(LOCAL_FILE, "utf8"));
      const refreshed = withCurrentSeed(stored);
      if (!refreshed) return stored;
      fs.writeFileSync(LOCAL_FILE, JSON.stringify(refreshed, null, 2));
      console.log(`Catalogue refreshed to seed version ${SEED_VERSION}`);
      return refreshed;
    } catch (e) {
      console.error("Failed to parse local data.json, reseeding:", e.message);
    }
  }
  const seeded = withCurrentSeed(null);
  fs.writeFileSync(LOCAL_FILE, JSON.stringify(seeded, null, 2));
  return seeded;
}

async function saveData(data) {
  if (pool) {
    await ensureTable();
    await pool.query(
      `INSERT INTO skillup_data (id, data) VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET data = $1`,
      [data]
    );
    return;
  }
  fs.writeFileSync(LOCAL_FILE, JSON.stringify(data, null, 2));
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH MIDDLEWARE
// ─────────────────────────────────────────────────────────────────────────────

async function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";

  // Preferred: a cabinet session belonging to an admin or owner. That way the
  // catalogue is edited by a named person whose actions are attributable, and
  // no shared password has to exist anywhere.
  if (auth.startsWith("Bearer ")) {
    const user = await sessionUser(pool, auth);
    if (user && !user.disabled && (user.role === "admin" || user.role === "owner")) {
      req.user = user;
      return next();
    }
    return res.status(401).json({ detail: "Not authenticated" });
  }

  // Legacy: the single shared ADMIN_USERNAME/ADMIN_PASSWORD. Kept so a running
  // deployment does not lock itself out mid-rollout, and so the panel still
  // works before any admin account exists. Once every admin has a cabinet
  // account, delete both variables and this path stops being reachable.
  if (!auth.startsWith("Basic ")) {
    return res.status(401).json({ detail: "Not authenticated" });
  }
  try {
    const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
    const idx = decoded.indexOf(":");
    const user = decoded.slice(0, idx);
    const pass = decoded.slice(idx + 1);
    if (await checkAdminCredentials(user, pass)) return next();
  } catch {}
  return res.status(401).json({ detail: "Not authenticated" });
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE DEFINITIONS (mounted at both "/" and "/api")
// ─────────────────────────────────────────────────────────────────────────────

const router = express.Router();

router.get("/", async (req, res) => {
  res.json({ status: "OK", storage: STORAGE_MODE });
});

// ── AUTH ──────────────────────────────────────────────────────────────────
router.post("/admin/login", rateLimit("admin-login", 10, 5 * 60 * 1000), async (req, res) => {
  const { username, password } = req.body || {};
  if (await checkAdminCredentials(username, password)) {
    return res.json({ success: true });
  }
  return res.status(401).json({ detail: "Invalid credentials" });
});

router.post("/admin/logout", (req, res) => {
  res.json({ success: true });
});

// ── PUBLIC ────────────────────────────────────────────────────────────────
router.get("/courses", async (req, res) => {
  const data = await loadData();
  res.json(data.courses);
});

router.get("/courses/:id", async (req, res) => {
  const data = await loadData();
  const id = parseInt(req.params.id, 10);
  const course = data.courses.find((c) => c.id === id);
  if (!course) return res.status(404).json({ detail: "Not found" });
  const teachers = data.teachers.filter((t) =>
    (course.teacher_ids || []).includes(t.id)
  );
  res.json({ ...course, teachers });
});

router.get("/teachers", async (req, res) => {
  const data = await loadData();
  res.json(data.teachers);
});

router.get("/prices", async (req, res) => {
  const data = await loadData();
  res.json(data.prices);
});

router.get("/testimonials", async (req, res) => {
  const data = await loadData();
  res.json(data.testimonials);
});

router.get("/results", async (req, res) => {
  const data = await loadData();
  res.json(data.results || []);
});

router.get("/feedbacks", async (req, res) => {
  const data = await loadData();
  res.json(data.feedbacks.filter((f) => f.approved));
});

router.post("/feedbacks", rateLimit("feedbacks", 10, 60 * 60 * 1000), async (req, res) => {
  const data = await loadData();
  const body = req.body || {};
  const text = clean(body.text, 2000);
  if (!text) return res.status(400).json({ detail: "Review text is required" });
  const nextId = Math.max(0, ...data.feedbacks.map((f) => f.id)) + 1;
  const fb = {
    id: nextId,
    name: clean(body.name, 100) || "Anonymous",
    course: clean(body.course, 150),
    rating: Math.min(5, Math.max(1, parseInt(body.rating, 10) || 5)),
    text,
    date: new Date().toISOString(),
    approved: false,
  };
  data.feedbacks.push(fb);
  await saveData(data);
  res.json({ success: true });
});

router.post("/apply", rateLimit("apply", 15, 60 * 60 * 1000), async (req, res) => {
  const data = await loadData();
  const body = req.body || {};
  const name = clean(body.name, 100);
  const phone = clean(body.phone, 30);
  if (!name || !phone) return res.status(400).json({ detail: "Name and phone are required" });
  const nextId = Math.max(0, ...data.applications.map((a) => a.id)) + 1;
  const entry = {
    id: nextId,
    name,
    phone,
    age: clean(body.age, 10),
    telegram: clean(body.telegram, 100),
    course: clean(body.course, 150),
    format: clean(body.format, 50),
    days: clean(body.days, 200),
    time: clean(body.time, 100),
    purpose: clean(body.purpose, 30) || "trial",
    message: clean(body.message, 1000),
    date: new Date().toISOString(),
    status: "new",
  };
  data.applications.push(entry);
  await saveData(data);
  res.json({ success: true });
});

// ── ADMIN (Basic Auth required) ──────────────────────────────────────────
router.get("/admin/applications", requireAdmin, async (req, res) => {
  const data = await loadData();
  res.json(data.applications);
});

// An application arrives, someone rings the person, and then what? Without a
// status the list only ever grows and nobody can tell which ones are dealt
// with. These are the four states the front desk actually works in.
const APPLICATION_STATUSES = ["new", "contacted", "enrolled", "declined"];

router.patch("/admin/applications/:id", requireAdmin, async (req, res) => {
  const status = clean(req.body?.status, 20);
  if (!APPLICATION_STATUSES.includes(status)) {
    return res.status(400).json({ detail: `status must be one of: ${APPLICATION_STATUSES.join(", ")}` });
  }
  const id = parseInt(req.params.id, 10);
  const data = await loadData();
  const application = data.applications.find((a) => a.id === id);
  if (!application) return res.status(404).json({ detail: "Not found" });

  application.status = status;
  application.note = clean(req.body?.note, 500) || application.note || "";
  // Who moved it and when: the same accountability the cabinet gives every
  // other action, now that a named person is signed in rather than a shared
  // password. req.user is absent only on the legacy Basic auth path.
  application.handled_by = req.user ? req.user.email : "admin";
  application.handled_at = new Date().toISOString();
  await saveData(data);
  res.json(application);
});

router.get("/admin/feedbacks", requireAdmin, async (req, res) => {
  const data = await loadData();
  res.json(data.feedbacks);
});

router.put("/admin/feedbacks/:id/approve", requireAdmin, async (req, res) => {
  const data = await loadData();
  const id = parseInt(req.params.id, 10);
  const fb = data.feedbacks.find((f) => f.id === id);
  if (!fb) return res.status(404).json({ detail: "Not found" });
  fb.approved = true;
  await saveData(data);
  res.json(fb);
});

router.delete("/admin/feedbacks/:id", requireAdmin, async (req, res) => {
  const data = await loadData();
  const id = parseInt(req.params.id, 10);
  data.feedbacks = data.feedbacks.filter((f) => f.id !== id);
  await saveData(data);
  res.json({ success: true });
});

router.put("/admin/prices/:id", requireAdmin, async (req, res) => {
  const data = await loadData();
  const id = parseInt(req.params.id, 10);
  const idx = data.prices.findIndex((p) => p.id === id);
  if (idx === -1) return res.status(404).json({ detail: "Not found" });
  data.prices[idx] = { ...data.prices[idx], ...req.body, id };
  await saveData(data);
  res.json(data.prices[idx]);
});

router.post("/admin/courses", requireAdmin, async (req, res) => {
  const data = await loadData();
  const body = req.body || {};
  const newId = Math.max(0, ...data.courses.map((c) => c.id)) + 1;
  const course = {
    id: newId,
    category: body.category || "",
    icon: body.icon || "📚",
    title: body.title || "",
    description: body.description || "",
    audience: body.audience || "",
    program: body.program || [],
    formats: body.formats || [],
    duration: body.duration || "",
    levels: body.levels || "",
    teacher_ids: body.teacher_ids || [],
    price_individual: body.price_individual || "",
    note: body.note || "",
  };
  data.courses.push(course);
  await saveData(data);
  res.json(course);
});

router.put("/admin/courses/:id", requireAdmin, async (req, res) => {
  const data = await loadData();
  const id = parseInt(req.params.id, 10);
  const idx = data.courses.findIndex((c) => c.id === id);
  if (idx === -1) return res.status(404).json({ detail: "Not found" });
  data.courses[idx] = { ...data.courses[idx], ...req.body, id };
  await saveData(data);
  res.json(data.courses[idx]);
});

router.delete("/admin/courses/:id", requireAdmin, async (req, res) => {
  const data = await loadData();
  const id = parseInt(req.params.id, 10);
  data.courses = data.courses.filter((c) => c.id !== id);
  await saveData(data);
  res.json({ success: true });
});

router.post("/admin/teachers", requireAdmin, async (req, res) => {
  const data = await loadData();
  const body = req.body || {};
  const newId = Math.max(0, ...data.teachers.map((t) => t.id)) + 1;
  const teacher = {
    id: newId,
    name: body.name || "",
    subject: body.subject || "",
    experience: body.experience || "",
    photo:
      body.photo ||
      `https://api.dicebear.com/7.x/avataaars/svg?seed=${newId}`,
    short_bio: body.short_bio || "",
    full_bio: body.full_bio || "",
    education: body.education || "",
    certifications: body.certifications || [],
    achievements: body.achievements || [],
  };
  data.teachers.push(teacher);
  await saveData(data);
  res.json(teacher);
});

router.put("/admin/teachers/:id", requireAdmin, async (req, res) => {
  const data = await loadData();
  const id = parseInt(req.params.id, 10);
  const idx = data.teachers.findIndex((t) => t.id === id);
  if (idx === -1) return res.status(404).json({ detail: "Not found" });
  data.teachers[idx] = { ...data.teachers[idx], ...req.body, id };
  await saveData(data);
  res.json(data.teachers[idx]);
});

router.delete("/admin/teachers/:id", requireAdmin, async (req, res) => {
  const data = await loadData();
  const id = parseInt(req.params.id, 10);
  data.teachers = data.teachers.filter((t) => t.id !== id);
  await saveData(data);
  res.json({ success: true });
});

router.post("/admin/results", requireAdmin, async (req, res) => {
  const data = await loadData();
  if (!data.results) data.results = [];
  const body = req.body || {};
  const newId = Math.max(0, ...data.results.map((r) => r.id)) + 1;
  const result = {
    id: newId,
    name: clean(body.name, 100),
    course: clean(body.course, 150),
    result: clean(body.result, 200),
    date: clean(body.date, 30),
    certificate_url: clean(body.certificate_url, 500),
  };
  data.results.push(result);
  await saveData(data);
  res.json(result);
});

router.put("/admin/results/:id", requireAdmin, async (req, res) => {
  const data = await loadData();
  if (!data.results) data.results = [];
  const id = parseInt(req.params.id, 10);
  const idx = data.results.findIndex((r) => r.id === id);
  if (idx === -1) return res.status(404).json({ detail: "Not found" });
  data.results[idx] = { ...data.results[idx], ...req.body, id };
  await saveData(data);
  res.json(data.results[idx]);
});

router.delete("/admin/results/:id", requireAdmin, async (req, res) => {
  const data = await loadData();
  if (!data.results) data.results = [];
  const id = parseInt(req.params.id, 10);
  data.results = data.results.filter((r) => r.id !== id);
  await saveData(data);
  res.json({ success: true });
});

// The cabinets ride on the same router so they inherit the "/" + "/api"
// mounting below, and so /auth and /cabinet resolve the same way in both
// environments. rateLimit and clean are shared rather than reimplemented.
router.use(cabinetRouter({ pool, rateLimit, clean }));

// Mount router at both "/" and "/api" so it works for prod (Render, no prefix)
// and local dev (frontend calls with "/api" prefix on localhost)
app.use("/", router);
app.use("/api", router);

// ── 404 + error handling ──────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ detail: "Not found" });
});

app.use((err, req, res, next) => {
  // A malformed or oversized body is the caller's mistake, not a server fault,
  // so it is logged as a note rather than filed under server errors.
  if (err.type === "entity.parse.failed" || err instanceof SyntaxError) {
    console.warn("Rejected a malformed JSON body from", req.ip);
    return res.status(400).json({ detail: "Invalid JSON body" });
  }
  if (err.type === "entity.too.large") {
    console.warn("Rejected an oversized body from", req.ip);
    return res.status(413).json({ detail: "Payload too large" });
  }
  console.error("Unhandled error:", err);
  // Never echo err.message: it can leak database, schema or filesystem detail.
  res.status(500).json({ detail: "Internal server error" });
});

// Only start listening when run directly, so maintenance scripts can require
// this file for seedData() without booting a second server.
if (require.main === module) startServer();

function startServer() {
  app.listen(PORT, () => {
    console.log(`SkillUp Academy API running on port ${PORT}`);
    console.log(`Storage mode: ${STORAGE_MODE}`);
    ensureCabinetSchema(pool)
      .then(() => ensureOwner(pool))
      .then(() => {
        if (pool) console.log("Cabinet schema ready (users/roles/schedule/homework/attendance/payments)");
      })
      // The public site does not depend on these tables, so a schema problem
      // must not stop the server from serving courses and prices.
      .catch((e) => console.error("Cabinet schema setup failed (public site unaffected):", e.message));
  });
}

module.exports = { app, seedData, loadData, saveData };

// ─────────────────────────────────────────────────────────────────────────────
// SEED DATA
// ─────────────────────────────────────────────────────────────────────────────
function seedData() {
  return {
    courses: [
      { id:1,  category:"English", icon:"🌍", title:"General English",                    description:"Comprehensive English for all levels. Build fluency in speaking, writing, reading and listening.",       program:["Grammar A1–C2","Conversational fluency","Business English","Reading & writing","Listening comprehension"],                              formats:["Group (up to 4)","Individual","Mini-group (2)"],  duration:"3–12 months",        levels:"A1 – C2",                audience:"Anyone building everyday and working English, from beginner to confident fluency", teacher_ids:[1,2], price_individual:"2,500,000 UZS/month", note:"" },
      { id:2,  category:"English", icon:"📊", title:"IELTS Preparation",                   description:"Targeted IELTS prep for band 6.5–8.0. Expert strategies across all four skills.",                       program:["Writing Task 1 & 2","Speaking Part 1–3","Reading techniques","Listening mastery","Mock tests & feedback"],             formats:["Group (up to 4)","Individual","Intensive crash course"], duration:"2–6 months",         levels:"B1 – C1",                audience:"Applicants to universities or immigration programmes that ask for an IELTS band", teacher_ids:[1,2], price_individual:"3,500,000 UZS/month", note:"" },
      { id:3,  category:"English", icon:"🎯", title:"CEFR Preparation",                    description:"Official CEFR level certification prep A1–C2. Internationally recognised qualification.",               program:["CEFR level diagnostics","Level-specific grammar","Exam technique per level","Speaking & writing prep","Mock CEFR exams"],  formats:["Group (up to 4)","Individual","Mini-group (2)"],  duration:"2–8 months",         levels:"A1 – C2",                audience:"Those who need an official CEFR certificate for study or work", teacher_ids:[1,2], price_individual:"", note:"" },
      { id:4,  category:"Math",    icon:"📐", title:"Math in Russian",                     description:"Mathematics taught in Russian. School curriculum, olympiad prep, and university foundation.",            program:["Algebra & number theory","Geometry & trigonometry","Functions & calculus","Probability & statistics","Problem-solving"],    formats:["Individual"],  duration:"3–12 months",        levels:"Grade 5 – 11",           audience:"School students taking maths in Russian — school syllabus, olympiads, university entry", teacher_ids:[3],   price_individual:"3,000,000 UZS/month", note:"" },
      { id:5,  category:"Math",    icon:"🏫", title:"Westminster Lyceum & University Prep", description:"Targeted preparation for Westminster Lyceum and Westminster University entrance exams.",                 program:["Westminster exam format","Math & English integrated prep","Critical thinking","Past paper practice","Interview preparation"], formats:["Individual"],         duration:"3–9 months",         levels:"Grade 9 – 12",           audience:"Applicants to Westminster Lyceum and Westminster University", teacher_ids:[3],   price_individual:"4,000,000 UZS/month", note:"" },
      { id:6,  category:"Math",    icon:"🎓", title:"SAT Math",                            description:"SAT Math prep covering Heart of Algebra, Advanced Math, and Data Analysis.",                            program:["Heart of Algebra","Advanced Math","Problem Solving & Data Analysis","Geometry","Calculator & No-Calculator sections"],       formats:["Individual"],                     duration:"3–6 months",         levels:"Grade 10–12",            audience:"Applicants to universities that ask for SAT results", teacher_ids:[3],   price_individual:"4,000,000 UZS/month", note:"" },
      { id:7,  category:"Math",    icon:"🏅", title:"Milliy Sertifikat",                   description:"Preparation for Uzbekistan's national certificate exam in Mathematics.",                                 program:["National curriculum review","Exam format & marking","Common question types","Speed & accuracy","Full mock exams"],           formats:["Individual only"],  duration:"2–6 months",         levels:"Grade 9 – 11",           audience:"Those sitting Uzbekistan's national certificate exam in mathematics", teacher_ids:[3],   price_individual:"1,600,000 – 4,000,000 UZS/month", note:"" },
      { id:8,  category:"Math",    icon:"🔬", title:"CSCA — Math & Physics",               description:"Preparation for the Chinese Standard Certificate Assessment in Math and Physics.",                       program:["CSCA exam format","Advanced Mathematics","Physics problem-solving","Chinese academic terms","Mock exams"],                  formats:["Individual only"],  duration:"4–12 months",         levels:"Intermediate – Advanced",audience:"Applicants preparing for the Chinese Standard Certificate Assessment in maths and physics", teacher_ids:[3,4], price_individual:"1,600,000 – 4,000,000 UZS/month", note:"" },
      { id:9,  category:"Russian", icon:"🇷🇺",title:"Russian for Foreigners",              description:"Russian for non-native speakers — taught entirely in English.",                                         program:["Cyrillic & phonetics","Core grammar in English","Everyday conversation","Reading & writing","Russian culture"],             formats:["Individual only","Mini-group (2)"],           duration:"Flexible",           levels:"A1 – B2",                audience:"Non-native speakers who want to learn Russian through English", teacher_ids:[5],   price_individual:"2,000,000 UZS/month", note:"Taught in English. Individual & mini-group only." },
      { id:10, category:"Uzbek",   icon:"🇺🇿",title:"Uzbek for Foreigners",               description:"Uzbek for non-native speakers — taught entirely in English.",                                           program:["Uzbek alphabet & pronunciation","Essential grammar in English","Daily conversation","Reading & writing","Culture"],           formats:["Individual only","Mini-group (2)"],           duration:"Flexible",           levels:"A1 – B1",                audience:"Expats and foreign professionals living or working in Uzbekistan", teacher_ids:[6],   price_individual:"2,000,000 UZS/month", note:"Taught in English. Individual & mini-group only." },
      { id:11, category:"German",  icon:"🇩🇪",title:"German Language (A1 → C2)",          description:"German from zero to C2. Full Goethe Institut certificate preparation included.",                       program:["German phonetics & alphabet","Grammar A1–C2","Conversational German","Goethe exam strategies","Mock Goethe exams"],          formats:["Individual only"],           duration:"6 months – 3 years", levels:"A1 – C2",                audience:"Those learning German from zero, including towards Goethe certification", teacher_ids:[7],   price_individual:"1,600,000 – 4,000,000 UZS/month", note:"Individual only." },
      { id:13, category:"English", icon:"📝", title:"TOEFL Preparation",                 description:"Preparation for the updated TOEFL iBT: four sections in under two hours, scored on the 1–6 band scale aligned to CEFR.", program:["Reading — adaptive section, academic passages and everyday texts","Listening — conversations, announcements and academic talks","Speaking — repetition and interview tasks","Writing — email, sentence building and academic discussion","Full mock tests with feedback on each section"],       formats:["Group (up to 4)","Individual","Mini-group (2)"], duration:"2–6 months",         levels:"B1 – C1",                audience:"Applicants to universities that accept TOEFL results", teacher_ids:[1,2], price_individual:"2,000,000 UZS/month", note:"Test updated in January 2026: results are reported on a 1–6 scale (band 4 corresponds to CEFR B2); the 0–120 score is also shown during the transition period." },
      { id:12, category:"Spanish", icon:"🇪🇸",title:"Spanish Language",                   description:"Spanish from beginner to advanced with expert instructors.",                                             program:["Spanish phonetics","Core grammar A1–C1","Conversational Spanish","Reading & writing","DELE/SIELE exam prep"],              formats:["Individual only"],  duration:"Flexible",           levels:"A1 – C1",                audience:"Those learning Spanish from beginner level, including for DELE and SIELE", teacher_ids:[8],   price_individual:"1,600,000 – 4,000,000 UZS/month", note:"" },
    ],
    teachers: [
      { id:1, name:"Sarah Mitchell",   subject:"General English & IELTS",      experience:"8 years",  photo:"https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah&backgroundColor=b6e3f4",   short_bio:"Cambridge CELTA certified IELTS examiner with 8 years of experience.",              full_bio:"Sarah Mitchell holds an M.A. in Applied Linguistics from the University of Manchester. A certified IELTS examiner and Cambridge CELTA instructor, her students achieve average band improvements of 1.5 in just 3 months.", education:"M.A. Applied Linguistics, University of Manchester",        certifications:["Cambridge CELTA","IELTS Examiner","DELTA Module 1"],           achievements:["100+ students scored 7.0+ IELTS","Published IELTS prep guides","Former British Council teacher"] },
      { id:2, name:"James Anderson",   subject:"CEFR & SAT English",           experience:"6 years",  photo:"https://api.dicebear.com/7.x/avataaars/svg?seed=James&backgroundColor=c0aede",   short_bio:"SAT & CEFR specialist. Former Princeton Review instructor, scored 1580 SAT.",       full_bio:"James Anderson scored 1580 on the SAT and is a former Princeton Review instructor. He specialises in CEFR certification and SAT English strategic prep.",                                                                 education:"B.A. English Literature, Yale University",                          certifications:["Princeton Review Certified","SAT Specialist","CEFR Assessor"], achievements:["200+ average score improvement","Former Princeton Review lead","98th percentile SAT scorer"] },
      { id:3, name:"Dr. Amir Karimov", subject:"Mathematics (all programs)",   experience:"10 years", photo:"https://api.dicebear.com/7.x/avataaars/svg?seed=Amir&backgroundColor=ffd5dc",   short_bio:"PhD Math. Westminster, SAT, Milliy Sertifikat & CSCA specialist.",                  full_bio:"Dr. Amir Karimov holds a PhD in Pure Mathematics. His 92% Westminster acceptance rate and 50+ perfect SAT Math scores speak for themselves.",                                                                             education:"Ph.D. Pure Mathematics, National University of Uzbekistan",         certifications:["PhD Mathematics","SAT Specialist","Westminster Prep Certified"],achievements:["50+ perfect SAT Math 800s","92% Westminster acceptance rate","Published 3 textbooks"] },
      { id:4, name:"Li Wei Chen",      subject:"Chinese Exams & CSCA",         experience:"7 years",  photo:"https://api.dicebear.com/7.x/avataaars/svg?seed=LiWei&backgroundColor=d1f7c4",  short_bio:"Native Mandarin speaker, CSCA examiner from Peking University.",                    full_bio:"Li Wei Chen graduated from Peking University and specialises in CSCA Math & Physics preparation. 200+ students have passed CSCA under her guidance.",                                                                     education:"B.Ed. Teaching Chinese as Foreign Language, Peking University",     certifications:["HSK Level 6","CSCA Examiner","Physics Specialist"],            achievements:["200+ CSCA passers","Immersive Mandarin curriculum","Guest lecturer at 3 universities"] },
      { id:5, name:"Natalia Ivanova",  subject:"Russian for Foreigners",       experience:"9 years",  photo:"https://api.dicebear.com/7.x/avataaars/svg?seed=Natalia&backgroundColor=ffeaa7", short_bio:"RFL certified. Teaches Russian entirely through English.",                           full_bio:"Natalia Ivanova holds an M.A. in Russian Philology and teaches Russian exclusively through English — making grammar accessible to international students.",                                                                 education:"M.A. Russian Philology, St Petersburg State University",            certifications:["RFL Certified Teacher","TORFL Examiner"],                      achievements:["Students from 20+ countries","English-medium Russian method","Former Pushkin Institute teacher"] },
      { id:6, name:"Zulfiya Nazarova", subject:"Uzbek for Foreigners",         experience:"5 years",  photo:"https://api.dicebear.com/7.x/avataaars/svg?seed=Zulfiya&backgroundColor=a8edea", short_bio:"Native Uzbek speaker. Teaches Uzbek through English for expats & foreigners.",      full_bio:"Zulfiya Nazarova specialises in teaching Uzbek as a foreign language through English. She has worked with diplomatic corps and business professionals.",                                                                   education:"B.A. Uzbek Linguistics, National University of Uzbekistan",         certifications:["UFL Certified Teacher","Uzbek Language Instructor"],           achievements:["100+ foreigners achieved conversational Uzbek","Worked with diplomatic corps","English-medium Uzbek curriculum"] },
      { id:7, name:"Klaus Müller",     subject:"German Language & Goethe Prep",experience:"5 years",  photo:"https://api.dicebear.com/7.x/avataaars/svg?seed=Klaus&backgroundColor=dfe6e9",  short_bio:"Native German speaker. Goethe Institut certified A1–C2 instructor from Munich.",    full_bio:"Klaus Müller is a native German speaker from Munich, Goethe Institut certified. He guides students from absolute beginner to C2 with custom plans.",                                                                      education:"B.A. German Language & Literature, Ludwig Maximilian University",   certifications:["Goethe Institut Certified","DaF Instructor","C2 Proficiency"], achievements:["80+ Goethe exam passers","Full A1–C2 program","Custom plans for every student"] },
      { id:8, name:"Isabella García",  subject:"Spanish Language",             experience:"6 years",  photo:"https://api.dicebear.com/7.x/avataaars/svg?seed=Isabella&backgroundColor=fdcb6e", short_bio:"Native Spanish speaker from Madrid. DELE examiner with 6 years experience.",        full_bio:"Isabella García is a DELE examiner from Madrid. Her communicative teaching method delivers fast, real-world results from A1 to C1.",                                                                                       education:"B.A. Hispanic Philology, Complutense University of Madrid",         certifications:["DELE Examiner","SIELE Instructor","Instituto Cervantes Certified"],achievements:["100+ DELE exam passers","Full A1–C1 curriculum","Former Instituto Cervantes teacher"] },
    ],
    prices: [
      { id:1,  course:"General English",        individual:"2,500,000 UZS/month", mini_group:"2,000,000 UZS/month", group:"1,200,000 UZS/month" },
      { id:2,  course:"IELTS Preparation",       individual:"3,500,000 UZS/month", mini_group:"3,000,000 UZS/month", group:"1,500,000 UZS/month" },
      { id:3,  course:"CEFR Preparation",        individual:null,                  mini_group:null,                  group:"1,200,000 UZS/month" },
      { id:13, course:"TOEFL Preparation",       individual:"2,000,000 UZS/month", mini_group:"1,800,000 UZS/month", group:"1,200,000 UZS/month" },
      { id:4,  course:"Math in Russian",         individual:"3,000,000 UZS/month", mini_group:null,                  group:null },
      { id:5,  course:"Westminster Prep",        individual:"4,000,000 UZS/month", mini_group:null,                  group:null },
      { id:6,  course:"SAT — Math",              individual:"4,000,000 UZS/month", mini_group:null,                  group:null },
      { id:14, course:"SAT — Math & English",    individual:"4,600,000 UZS/month", mini_group:null,                  group:null },
      { id:9,  course:"Russian for Foreigners",  individual:"2,000,000 UZS/month", mini_group:"1,800,000 UZS/month", group:null },
      { id:10, course:"Uzbek for Foreigners",    individual:"2,000,000 UZS/month", mini_group:"1,800,000 UZS/month", group:null },
      { id:7,  course:"Milliy Sertifikat",       individual:"1,600,000 – 4,000,000 UZS/month", mini_group:null,   group:null },
      { id:8,  course:"CSCA Math & Physics",     individual:"1,600,000 – 4,000,000 UZS/month", mini_group:null, group:null },
      { id:11, course:"German (A1–C2)",          individual:"1,600,000 – 4,000,000 UZS/month", mini_group:null,   group:null },
      { id:12, course:"Spanish",                 individual:"1,600,000 – 4,000,000 UZS/month", mini_group:null,   group:null },
    ],
    testimonials: [
      { id:1, name:"Zulfiya Rahimova", course:"IELTS Preparation",    score:"Band 7.5",  text:"SkillUp Academy changed my life. I went from 5.5 to 7.5 in 4 months. Sarah's methods are incredible!", avatar:"ZR", rating:5 },
      { id:2, name:"Bobur Tashmatov",  course:"SAT Math",             score:"790/800",   text:"Dr. Karimov is the best math teacher I've ever had. Crystal-clear explanations and real strategies.",   avatar:"BT", rating:5 },
      { id:3, name:"Anna Schmidt",     course:"Russian for Foreigners",score:"B1 Level",  text:"Natalia is incredibly patient. After 6 months in English, I can hold full Russian conversations!",     avatar:"AS", rating:5 },
      { id:4, name:"Marcus Bauer",     course:"German Language",      score:"Goethe B2", text:"Klaus took me from zero to B2 in 14 months. I passed the Goethe exam on my first attempt!",           avatar:"MB", rating:5 },
      { id:5, name:"Kamola Yusupova",  course:"Westminster Prep",     score:"Accepted",  text:"Dr. Karimov's Westminster prep was extraordinary. I got accepted on my first application!",             avatar:"KY", rating:5 },
    ],
    feedbacks: [],
    applications: [],
    results: [],
  };
}
