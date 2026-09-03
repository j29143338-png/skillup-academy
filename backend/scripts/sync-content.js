/**
 * One-off maintenance script: push content changes from seedData() into a
 * database that is already populated.
 *
 * Why this exists: seedData() only runs when the database is empty, so editing
 * server.js does not change a live site. The admin panel covers day-to-day
 * edits but cannot add a price row or backfill a new field, so changes like a
 * new course or a reworked price list need this script.
 *
 * What it touches:
 *   - prices  — replaced with the list from seedData()
 *   - courses — missing courses are added; for courses that already exist only
 *               the fields this work changed are updated (audience, formats,
 *               price_individual). Titles, descriptions, programs, levels and
 *               teacher assignments are left alone, so anything edited through
 *               the admin panel survives.
 *
 * Never touched: applications, reviews, teachers, results.
 *
 * Usage (from the backend directory):
 *   node scripts/sync-content.js          # dry run
 *   node scripts/sync-content.js --apply  # write
 *
 * The connection string is read from backend/.env (gitignored) or from
 * DATABASE_URL in the environment.
 */

const fs = require("fs");
const path = require("path");

// Read backend/.env before requiring the server, which reads process.env as it
// loads. Keeps the connection string in a gitignored file rather than in a
// shell command that would land in history.
if (!process.env.DATABASE_URL) {
  const envFile = path.join(__dirname, "..", ".env");
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
      if (line.trim().startsWith("#")) continue;
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      const value = m[2].replace(/^["']|["']$/g, "");
      if (!process.env[m[1]]) process.env[m[1]] = value;
    }
  }
}

if (!process.env.DATABASE_URL) {
  console.error(
    [
      "DATABASE_URL is not set.",
      "Put it in backend/.env (that file is gitignored):",
      "  DATABASE_URL=postgres://...",
    ].join("\n")
  );
  process.exit(1);
}

const { seedData, loadData, saveData } = require("../server");

const APPLY = process.argv.includes("--apply");

// Only these course fields are overwritten on a course that already exists.
const COURSE_FIELDS_TO_UPDATE = ["audience", "formats", "price_individual"];

const show = (v) => {
  if (v === undefined || v === null || v === "") return "—";
  return Array.isArray(v) ? v.join(", ") : String(v);
};
const same = (a, b) =>
  Array.isArray(a) || Array.isArray(b)
    ? JSON.stringify(a || []) === JSON.stringify(b || [])
    : (a ?? "") === (b ?? "");

(async () => {
  const data = await loadData();
  const seed = seedData();

  // These are never modified; printed so it is visible they survived the run.
  const untouched = {
    applications: (data.applications || []).length,
    reviews: (data.feedbacks || []).length,
    teachers: (data.teachers || []).length,
    results: (data.results || []).length,
  };
  console.log(
    "Left untouched: " +
      Object.entries(untouched)
        .map(([k, v]) => `${v} ${k}`)
        .join(", ") +
      "\n"
  );

  let changed = 0;

  // ── PRICES ────────────────────────────────────────────────────────────────
  console.log("PRICES");
  const currentPrices = data.prices || [];
  const nextPrices = seed.prices;
  const priceById = new Map(currentPrices.map((p) => [p.id, p]));
  const priceFields = ["course", "individual", "mini_group", "group"];

  for (const row of nextPrices) {
    const before = priceById.get(row.id);
    if (!before) {
      console.log(`  + NEW  #${row.id} ${row.course}`);
      for (const f of priceFields.slice(1)) console.log(`         ${f}: ${show(row[f])}`);
      changed++;
      continue;
    }
    const diff = priceFields.filter((f) => !same(before[f], row[f]));
    if (!diff.length) continue;
    console.log(`  ~ EDIT #${row.id} ${row.course}`);
    for (const f of diff) console.log(`         ${f}: ${show(before[f])}  →  ${show(row[f])}`);
    changed++;
  }
  for (const r of currentPrices.filter((p) => !nextPrices.some((n) => n.id === p.id))) {
    console.log(`  ! GONE #${r.id} ${r.course} — not in the new list, would be removed`);
    changed++;
  }
  if (!changed) console.log("  (no price changes)");

  // ── COURSES ───────────────────────────────────────────────────────────────
  console.log("\nCOURSES");
  const courses = data.courses || [];
  const byId = new Map(courses.map((c) => [c.id, c]));
  const added = [];
  let courseChanges = 0;

  for (const row of seed.courses) {
    const before = byId.get(row.id);
    if (!before) {
      console.log(`  + NEW  #${row.id} ${row.title}`);
      added.push(row);
      courseChanges++;
      continue;
    }
    const diff = COURSE_FIELDS_TO_UPDATE.filter((f) => !same(before[f], row[f]));
    if (!diff.length) continue;
    console.log(`  ~ EDIT #${row.id} ${before.title}`);
    for (const f of diff) console.log(`         ${f}: ${show(before[f])}  →  ${show(row[f])}`);
    courseChanges++;
  }
  if (!courseChanges) console.log("  (no course changes)");
  changed += courseChanges;

  if (!changed) {
    console.log("\nNothing to do — the database already matches.");
    process.exit(0);
  }
  if (!APPLY) {
    console.log("\nDry run — nothing written. Re-run with --apply to save.");
    process.exit(0);
  }

  data.prices = nextPrices;
  for (const row of seed.courses) {
    const existing = byId.get(row.id);
    if (!existing) continue;
    for (const f of COURSE_FIELDS_TO_UPDATE) existing[f] = row[f];
  }
  data.courses = [...courses, ...added].sort((a, b) => a.id - b.id);

  await saveData(data);
  console.log(`\nSaved. ${data.prices.length} price rows and ${data.courses.length} courses are now live.`);
  process.exit(0);
})().catch((e) => {
  console.error("sync-content failed:", e.message);
  process.exit(1);
});
