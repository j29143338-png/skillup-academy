/**
 * One-off maintenance script: push the price list from seedData() into the
 * live data row.
 *
 * Why this exists: seedData() only runs when the database is empty, so editing
 * the price list in server.js does not change a database that is already
 * populated. The admin panel can edit an existing price row but cannot add a
 * new one, so new courses (TOEFL, SAT Math & English) need this script.
 *
 * Only `prices` is touched. Applications, reviews, teachers, courses and
 * results are left exactly as they are.
 *
 * Usage (from the backend directory):
 *   DATABASE_URL="postgres://..." node scripts/sync-prices.js          # dry run
 *   DATABASE_URL="postgres://..." node scripts/sync-prices.js --apply  # write
 */

const { seedData, loadData, saveData } = require("../server");

const APPLY = process.argv.includes("--apply");

(async () => {
  const data = await loadData();
  const current = data.prices || [];
  const next = seedData().prices;

  console.log(`Current rows: ${current.length}  →  new rows: ${next.length}\n`);

  const byId = new Map(current.map((p) => [p.id, p]));
  const fields = ["course", "individual", "mini_group", "group"];

  for (const row of next) {
    const before = byId.get(row.id);
    if (!before) {
      console.log(`+ NEW  #${row.id} ${row.course}`);
      for (const f of fields.slice(1)) console.log(`       ${f}: ${row[f] ?? "—"}`);
      continue;
    }
    const changes = fields.filter((f) => (before[f] ?? null) !== (row[f] ?? null));
    if (!changes.length) {
      console.log(`= same #${row.id} ${row.course}`);
      continue;
    }
    console.log(`~ EDIT #${row.id} ${row.course}`);
    for (const f of changes) console.log(`       ${f}: ${before[f] ?? "—"}  →  ${row[f] ?? "—"}`);
    byId.delete(row.id);
  }

  const removed = current.filter((p) => !next.some((n) => n.id === p.id));
  if (removed.length) {
    console.log(`\n! These rows exist in the database but not in the new list:`);
    for (const r of removed) console.log(`  #${r.id} ${r.course}`);
    console.log(`  They would be dropped from the price table.`);
  }

  if (!APPLY) {
    console.log(`\nDry run — nothing written. Re-run with --apply to save.`);
    process.exit(0);
  }

  data.prices = next;
  await saveData(data);
  console.log(`\nSaved. ${next.length} price rows are now live.`);
  process.exit(0);
})().catch((e) => {
  console.error("sync-prices failed:", e.message);
  process.exit(1);
});
