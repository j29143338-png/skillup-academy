/**
 * One-off: copy this project's database to another PostgreSQL server.
 *
 * Written because the site's data is small and entirely known — one JSONB row
 * holding the catalogue, plus the cabinet tables — so a full pg_dump/pg_restore
 * (and a local PostgreSQL install to run them) is more machinery than the job
 * needs. This talks to both servers with the `pg` client the app already uses.
 *
 * Usage (from the backend directory), with both URLs in backend/.env:
 *   DATABASE_URL=<source>  TARGET_DATABASE_URL=<destination>
 *   node scripts/migrate-db.js            # dry run: reports what it would copy
 *   node scripts/migrate-db.js --commit   # actually writes to the destination
 *
 * The source is only ever read. The destination must be empty for a table, or
 * the script refuses to touch it — rerunning is safe and never merges two
 * datasets into a mess.
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });

const { Pool } = require("pg");
const { ensureCabinetSchema } = require("../cabinet");

const COMMIT = process.argv.includes("--commit");

// Order matters: a row can only reference rows already copied.
const TABLES = [
  "skillup_data",
  "users",
  "contracts",
  "lesson_packages",
  "schedule_slots",
  "groups",
  "group_members",
  "parent_links",
  "homework",
  "homework_submissions",
  "attendance",
  "payments",
  "teacher_rates",
  "action_log",
];

// Sessions and reset codes are deliberately not copied: they are short-lived,
// tied to the old deployment, and everyone can simply sign in again.
const SKIPPED = ["auth_sessions", "password_resets"];

// Never print a connection string. Enough to tell two servers apart, and no
// more — these end up in logs and screenshots.
const describe = (url) => {
  try {
    const u = new URL(url);
    return `${u.hostname}/${u.pathname.replace(/^\//, "")}`;
  } catch {
    return "(unparseable URL)";
  }
};

const exists = async (pool, table) => {
  const { rows } = await pool.query("SELECT to_regclass($1) AS t", [`public.${table}`]);
  return rows[0].t !== null;
};

const countRows = async (pool, table) => {
  if (!(await exists(pool, table))) return null;
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
  return rows[0].n;
};

async function copyTable(source, target, table) {
  const { rows } = await source.query(`SELECT * FROM ${table}`);
  if (!rows.length) return 0;
  const columns = Object.keys(rows[0]);
  const quoted = columns.map((c) => `"${c}"`).join(", ");
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
  for (const row of rows) {
    await target.query(
      `INSERT INTO ${table} (${quoted}) VALUES (${placeholders})`,
      columns.map((c) => row[c])
    );
  }
  // SERIAL columns keep their own counter, which a straight INSERT of existing
  // ids does not advance. Without this the next insert collides on the primary
  // key. skillup_data has a plain INT id and no sequence, hence the guard.
  if (columns.includes("id") && table !== "skillup_data") {
    await target.query(
      `SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1))`,
      [table]
    );
  }
  return rows.length;
}

async function main() {
  const SOURCE_URL = process.env.DATABASE_URL;
  const TARGET_URL = process.env.TARGET_DATABASE_URL;
  if (!SOURCE_URL || !TARGET_URL) {
    console.error("Set both DATABASE_URL (source) and TARGET_DATABASE_URL (destination) in backend/.env");
    process.exit(1);
  }
  if (SOURCE_URL === TARGET_URL) {
    console.error("Source and destination are the same server. Nothing to do.");
    process.exit(1);
  }

  const ssl = { rejectUnauthorized: false };
  const source = new Pool({ connectionString: SOURCE_URL, ssl });
  const target = new Pool({ connectionString: TARGET_URL, ssl });

  console.log(`from: ${describe(SOURCE_URL)}`);
  console.log(`to:   ${describe(TARGET_URL)}`);
  console.log(COMMIT ? "mode: COMMIT — the destination will be written\n" : "mode: dry run — nothing will be written\n");

  try {
    // The destination needs the tables before anything can land in them. The
    // catalogue table is created by the app, so create it here too.
    if (COMMIT) {
      await target.query("CREATE TABLE IF NOT EXISTS skillup_data (id INT PRIMARY KEY, data JSONB NOT NULL)");
      await ensureCabinetSchema(target);
    }

    let copied = 0;
    let blocked = 0;
    for (const table of TABLES) {
      const from = await countRows(source, table);
      if (from === null) {
        console.log(`  ${table.padEnd(22)} not on the source — skipped`);
        continue;
      }
      if (from === 0) {
        console.log(`  ${table.padEnd(22)} empty`);
        continue;
      }
      const to = COMMIT ? await countRows(target, table) : 0;
      if (to > 0) {
        console.log(`  ${table.padEnd(22)} ${from} rows — DESTINATION NOT EMPTY (${to}), left alone`);
        blocked++;
        continue;
      }
      if (!COMMIT) {
        console.log(`  ${table.padEnd(22)} ${from} rows would be copied`);
        continue;
      }
      const n = await copyTable(source, target, table);
      copied += n;
      console.log(`  ${table.padEnd(22)} ${n} rows copied`);
    }

    console.log(`\nnot copied on purpose: ${SKIPPED.join(", ")}`);

    if (COMMIT) {
      console.log("\nVerifying...");
      let mismatch = 0;
      for (const table of TABLES) {
        const a = await countRows(source, table);
        const b = await countRows(target, table);
        if (a === null) continue;
        if (a !== b) {
          console.log(`  MISMATCH ${table}: source ${a}, destination ${b}`);
          mismatch++;
        }
      }
      // The catalogue is the one thing whose loss would be visible to visitors,
      // so it gets checked by content and not just by row count.
      const sd = await source.query("SELECT data FROM skillup_data WHERE id = 1");
      const td = await target.query("SELECT data FROM skillup_data WHERE id = 1");
      const same = JSON.stringify(sd.rows[0]?.data) === JSON.stringify(td.rows[0]?.data);
      console.log(`  catalogue matches byte for byte: ${same ? "yes" : "NO"}`);
      if (!same) mismatch++;

      console.log(`\n${copied} rows copied, ${blocked} tables left alone, ${mismatch} problems`);
      process.exitCode = mismatch === 0 ? 0 : 1;
    } else {
      console.log("\nDry run only. Re-run with --commit to copy.");
    }
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((e) => {
  console.error("\nMigration failed:", e.message);
  process.exit(1);
});
