/**
 * SkillUp Academy — personal cabinets (student / parent / teacher / admin / owner)
 *
 * Everything role-related lives here so server.js stays the public-site API.
 * server.js calls ensureCabinetSchema() at startup and mounts cabinetRouter().
 *
 * Auth model:
 *   - Each person logs in with their own email + password (bcrypt hash).
 *   - Login issues an opaque random token; only its SHA-256 is stored, so a
 *     database leak does not hand out working sessions. Tokens expire, and
 *     logout deletes the row, so a token cannot outlive an explicit logout.
 *   - The token travels as `Authorization: Bearer <token>`. Cookies would need
 *     SameSite=None across the Netlify/Render origin split; a bearer token
 *     avoids that entirely.
 *
 * Rules from backend/ARCHITECTURE.md that the code must keep honouring:
 *   - Contract (12 months) and package (12 lessons) are two separate numbers.
 *   - No rescheduling. A missed lesson still counts as delivered, so marking
 *     attendance always consumes one lesson from the package.
 *   - No self-serve freeze.
 *   - Teacher money is shown net of tax withholding, never gross-as-net.
 *   - Every query scopes by user/role, never by "is logged in".
 */

const crypto = require("crypto");
const bcrypt = require("bcryptjs");

// A DATE has no time and no timezone, but node-pg turns one into a JS Date at
// local midnight — which then serialises to the day before once UTC is applied.
// A contract ending 2027-01-01 reached the browser as 2026-12-31 from Tashkent.
// Hand DATE columns back as the plain YYYY-MM-DD string they already are.
// (1082 is the DATE type; timestamps are untouched.)
require("pg").types.setTypeParser(1082, (value) => value);

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const BCRYPT_ROUNDS = 10;

// Named constants because the two are easy to conflate and the brief is
// explicit that they are independent (see ARCHITECTURE.md).
const CONTRACT_MONTHS = 12;
const PACKAGE_LESSONS = 12;

const ROLES = ["student", "parent", "teacher", "admin", "owner"];
const STAFF = ["admin", "owner"];

const newToken = () => crypto.randomBytes(32).toString("hex");
const hashToken = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");
const normEmail = (e) => String(e ?? "").trim().toLowerCase();

// ─────────────────────────────────────────────────────────────────────────────
// SCHEMA
// The five tables server.js used to create as "future" scaffolding are owned
// here now, alongside the ones the dashboards actually needed.
// ─────────────────────────────────────────────────────────────────────────────
async function ensureCabinetSchema(pool) {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('student','parent','teacher','admin','owner')),
      full_name TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_by INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS contracts (
      id SERIAL PRIMARY KEY,
      student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      contract_start DATE NOT NULL,
      contract_end DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS lesson_packages (
      id SERIAL PRIMARY KEY,
      student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      contract_id INTEGER REFERENCES contracts(id) ON DELETE SET NULL,
      lessons_paid INTEGER NOT NULL DEFAULT 0,
      lessons_used INTEGER NOT NULL DEFAULT 0,
      purchased_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS schedule_slots (
      id SERIAL PRIMARY KEY,
      student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
      time TEXT NOT NULL,
      format TEXT NOT NULL CHECK (format IN ('group','individual'))
    );

    CREATE TABLE IF NOT EXISTS action_log (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      target TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ
    );

    -- A parent sees exactly the children linked here, and nothing else.
    CREATE TABLE IF NOT EXISTS parent_links (
      parent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (parent_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS groups (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      course_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS group_members (
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (group_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS homework (
      id SERIAL PRIMARY KEY,
      teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
      student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT,
      due_date DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS homework_submissions (
      id SERIAL PRIMARY KEY,
      homework_id INTEGER NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text TEXT,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      grade TEXT,
      teacher_comment TEXT,
      graded_at TIMESTAMPTZ,
      UNIQUE (homework_id, student_id)
    );

    -- status has no 'rescheduled' value on purpose: the brief rules it out, and
    -- both values below consume a lesson.
    CREATE TABLE IF NOT EXISTS attendance (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      lesson_date DATE NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('present','missed')),
      comment TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (student_id, lesson_date)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount NUMERIC(14,2) NOT NULL,
      currency TEXT NOT NULL DEFAULT 'UZS',
      paid_at DATE NOT NULL,
      note TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Teacher pay. tax_percent is what gets withheld; the cabinet only ever
    -- shows the net figure, per ARCHITECTURE.md.
    CREATE TABLE IF NOT EXISTS teacher_rates (
      teacher_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      per_lesson NUMERIC(14,2) NOT NULL DEFAULT 0,
      tax_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'UZS'
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON auth_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_slots_student ON schedule_slots(student_id);
    CREATE INDEX IF NOT EXISTS idx_slots_teacher ON schedule_slots(teacher_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
    CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id);
    CREATE INDEX IF NOT EXISTS idx_homework_group ON homework(group_id);
  `);

  // Older databases created schedule_slots without teacher_id (server.js used
  // to own this table). Add it rather than making anyone drop the table.
  await pool.query(
    `ALTER TABLE schedule_slots ADD COLUMN IF NOT EXISTS teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL`
  );
  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`
  );
}

// The first owner cannot be created through the UI — nobody is logged in yet.
// OWNER_EMAIL / OWNER_PASSWORD seed it once, and afterwards reset it.
async function ensureOwner(pool) {
  if (!pool) return;
  const email = normEmail(process.env.OWNER_EMAIL);
  const password = process.env.OWNER_PASSWORD || "";
  if (!email || !password) return;
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await pool.query(
    `INSERT INTO users (email, password_hash, role, full_name)
     VALUES ($1, $2, 'owner', $3)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash, role = 'owner', is_active = TRUE`,
    [email, hash, process.env.OWNER_NAME || "Owner"]
  );
  console.log(`Owner account ready: ${email}`);
}

module.exports = {
  ensureCabinetSchema,
  ensureOwner,
  ROLES,
  STAFF,
  CONTRACT_MONTHS,
  PACKAGE_LESSONS,
  newToken,
  hashToken,
  normEmail,
  SESSION_TTL_MS,
  RESET_TTL_MS,
  BCRYPT_ROUNDS,
};
