/**
 * SkillUp Academy — cabinet routes.
 *
 * Mounted by server.js as cabinetRouter({ pool, rateLimit, clean }); the two
 * helpers are passed in rather than duplicated so the rate limiter stays one
 * shared set of buckets and sanitising behaves identically to the public API.
 *
 * Access rules are enforced per query, not per page. A student's id comes from
 * the session, never from the request body, and a parent may only name a child
 * that parent_links actually links to them. See backend/ARCHITECTURE.md.
 */

const bcrypt = require("bcryptjs");
const express = require("express");

const {
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
} = require("./cabinet");

const int = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

function cabinetRouter({ pool, rateLimit, clean }) {
  const router = express.Router();

  // Cabinets are relational; the JSON-file dev fallback cannot serve them.
  // Fail loudly and early rather than throwing a confusing SQL error later.
  const requireDb = (req, res, next) => {
    if (!pool) {
      return res.status(503).json({
        detail:
          "Cabinets need PostgreSQL. Set DATABASE_URL (backend/.env locally) and restart.",
      });
    }
    next();
  };

  async function log(userId, action, target) {
    try {
      await pool.query(
        "INSERT INTO action_log (user_id, action, target) VALUES ($1, $2, $3)",
        [userId, String(action).slice(0, 200), target == null ? null : String(target).slice(0, 200)]
      );
    } catch (e) {
      // An audit write must never take a request down with it.
      console.error("action_log write failed:", e.message);
    }
  }

  // ── Session ───────────────────────────────────────────────────────────────
  async function requireAuth(req, res, next) {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) {
      return res.status(401).json({ detail: "Not authenticated" });
    }
    try {
      const { rows } = await pool.query(
        `SELECT u.id, u.email, u.role, u.full_name, u.is_active, s.expires_at
           FROM auth_sessions s
           JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = $1`,
        [hashToken(header.slice(7).trim())]
      );
      const row = rows[0];
      if (!row) return res.status(401).json({ detail: "Not authenticated" });
      if (new Date(row.expires_at).getTime() < Date.now()) {
        await pool.query("DELETE FROM auth_sessions WHERE token_hash = $1", [
          hashToken(header.slice(7).trim()),
        ]);
        return res.status(401).json({ detail: "Session expired" });
      }
      if (!row.is_active) return res.status(403).json({ detail: "Account disabled" });
      req.user = { id: row.id, email: row.email, role: row.role, full_name: row.full_name };
      next();
    } catch (e) {
      console.error("auth lookup failed:", e.message);
      res.status(500).json({ detail: "Auth check failed" });
    }
  }

  const requireRole =
    (...allowed) =>
    (req, res, next) =>
      allowed.includes(req.user.role)
        ? next()
        : res.status(403).json({ detail: "Not allowed for this role" });

  // Whose data is being asked for. A student is always themselves. A parent
  // must pass ?student_id=, and it must be one of their linked children.
  async function resolveSubject(req, res) {
    if (req.user.role === "student") return req.user.id;
    if (req.user.role === "parent") {
      const wanted = int(req.query.student_id);
      const { rows } = await pool.query(
        "SELECT student_id FROM parent_links WHERE parent_id = $1 ORDER BY student_id",
        [req.user.id]
      );
      if (!rows.length) {
        res.status(404).json({ detail: "No child is linked to this account yet" });
        return null;
      }
      if (wanted == null) return rows[0].student_id;
      if (!rows.some((r) => r.student_id === wanted)) {
        res.status(403).json({ detail: "Not your child" });
        return null;
      }
      return wanted;
    }
    res.status(403).json({ detail: "Not allowed for this role" });
    return null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // AUTH
  // ───────────────────────────────────────────────────────────────────────────
  router.post(
    "/auth/login",
    requireDb,
    rateLimit("cabinet-login", 10, 5 * 60 * 1000),
    async (req, res) => {
      const email = normEmail(req.body?.email);
      const password = String(req.body?.password ?? "");
      const { rows } = await pool.query(
        "SELECT id, email, role, full_name, password_hash, is_active FROM users WHERE email = $1",
        [email]
      );
      const user = rows[0];
      // Same reply for "no such email" and "wrong password" so the form cannot
      // be used to find out who has an account here.
      const ok = user && user.is_active && (await bcrypt.compare(password, user.password_hash).catch(() => false));
      if (!ok) return res.status(401).json({ detail: "Wrong email or password" });

      const token = newToken();
      await pool.query(
        "INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
        [hashToken(token), user.id, new Date(Date.now() + SESSION_TTL_MS)]
      );
      // Opportunistic cleanup; keeps the table from collecting dead rows.
      pool.query("DELETE FROM auth_sessions WHERE expires_at < now()").catch(() => {});
      await log(user.id, "login", user.email);
      res.json({
        token,
        expires_in: Math.floor(SESSION_TTL_MS / 1000),
        user: { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
      });
    }
  );

  router.post("/auth/logout", requireDb, requireAuth, async (req, res) => {
    const header = req.headers.authorization || "";
    await pool.query("DELETE FROM auth_sessions WHERE token_hash = $1", [
      hashToken(header.slice(7).trim()),
    ]);
    await log(req.user.id, "logout", req.user.email);
    res.json({ success: true });
  });

  router.get("/auth/me", requireDb, requireAuth, async (req, res) => {
    let children = [];
    if (req.user.role === "parent") {
      const { rows } = await pool.query(
        `SELECT u.id, u.full_name, u.email
           FROM parent_links l JOIN users u ON u.id = l.student_id
          WHERE l.parent_id = $1 ORDER BY u.full_name`,
        [req.user.id]
      );
      children = rows;
    }
    res.json({ ...req.user, children });
  });

  router.post("/auth/password/change", requireDb, requireAuth, async (req, res) => {
    const current = String(req.body?.current_password ?? "");
    const next = String(req.body?.new_password ?? "");
    if (next.length < 8) {
      return res.status(400).json({ detail: "New password must be at least 8 characters" });
    }
    const { rows } = await pool.query("SELECT password_hash FROM users WHERE id = $1", [req.user.id]);
    const ok = await bcrypt.compare(current, rows[0].password_hash).catch(() => false);
    if (!ok) return res.status(400).json({ detail: "Current password is wrong" });
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
      await bcrypt.hash(next, BCRYPT_ROUNDS),
      req.user.id,
    ]);
    // Changing a password ends every other session for that account.
    await pool.query("DELETE FROM auth_sessions WHERE user_id = $1", [req.user.id]);
    await log(req.user.id, "password.change", req.user.email);
    res.json({ success: true, detail: "Password changed. Please sign in again." });
  });

  // No mail provider is configured, so this cannot email anyone. It mints the
  // token and prints it in the server log; staff hand it over, or use the
  // reset link from the staff cabinet. Wire an SMTP provider before relying on
  // self-serve recovery in production.
  router.post(
    "/auth/password/forgot",
    requireDb,
    rateLimit("cabinet-forgot", 5, 15 * 60 * 1000),
    async (req, res) => {
      const email = normEmail(req.body?.email);
      const { rows } = await pool.query("SELECT id FROM users WHERE email = $1 AND is_active", [email]);
      if (rows[0]) {
        const token = newToken();
        await pool.query(
          "INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
          [hashToken(token), rows[0].id, new Date(Date.now() + RESET_TTL_MS)]
        );
        console.log(`Password reset token for ${email}: ${token}`);
      }
      // Always the same answer, so this cannot be used to probe for accounts.
      res.json({ success: true, detail: "If that address has an account, a reset token has been issued." });
    }
  );

  router.post("/auth/password/reset", requireDb, rateLimit("cabinet-reset", 10, 15 * 60 * 1000), async (req, res) => {
    const token = String(req.body?.token ?? "");
    const password = String(req.body?.password ?? "");
    if (password.length < 8) {
      return res.status(400).json({ detail: "Password must be at least 8 characters" });
    }
    const { rows } = await pool.query(
      "SELECT user_id, expires_at, used_at FROM password_resets WHERE token_hash = $1",
      [hashToken(token)]
    );
    const row = rows[0];
    if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ detail: "This reset link is invalid or has expired" });
    }
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
      await bcrypt.hash(password, BCRYPT_ROUNDS),
      row.user_id,
    ]);
    await pool.query("UPDATE password_resets SET used_at = now() WHERE token_hash = $1", [hashToken(token)]);
    await pool.query("DELETE FROM auth_sessions WHERE user_id = $1", [row.user_id]);
    await log(row.user_id, "password.reset", null);
    res.json({ success: true });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // STUDENT AND PARENT
  // Every handler below reads `subject`, never a client-supplied id.
  // ───────────────────────────────────────────────────────────────────────────
  const asLearner = [requireDb, requireAuth, requireRole("student", "parent")];

  // Contract months and package lessons are returned as separate fields on
  // purpose — the brief forbids presenting one as the other.
  async function packageSummary(studentId) {
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(lessons_paid), 0)::int AS paid,
              COALESCE(SUM(lessons_used), 0)::int AS used
         FROM lesson_packages WHERE student_id = $1`,
      [studentId]
    );
    const paid = rows[0].paid;
    const used = rows[0].used;
    return { lessons_paid: paid, lessons_used: used, lessons_left: Math.max(0, paid - used), package_size: PACKAGE_LESSONS };
  }

  router.get("/cabinet/overview", ...asLearner, async (req, res) => {
    const subject = await resolveSubject(req, res);
    if (subject == null) return;

    const [student, contract, pkg, attendance, nextHomework] = await Promise.all([
      pool.query("SELECT id, full_name, email FROM users WHERE id = $1", [subject]),
      pool.query(
        `SELECT id, contract_start, contract_end FROM contracts
          WHERE student_id = $1 ORDER BY contract_end DESC LIMIT 1`,
        [subject]
      ),
      packageSummary(subject),
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE status = 'present')::int AS present,
                COUNT(*) FILTER (WHERE status = 'missed')::int  AS missed
           FROM attendance WHERE student_id = $1`,
        [subject]
      ),
      pool.query(
        `SELECT h.id, h.title, h.due_date
           FROM homework h
           LEFT JOIN group_members gm ON gm.group_id = h.group_id
          WHERE (h.student_id = $1 OR gm.student_id = $1)
            AND NOT EXISTS (SELECT 1 FROM homework_submissions s
                             WHERE s.homework_id = h.id AND s.student_id = $1)
          ORDER BY h.due_date NULLS LAST, h.id DESC LIMIT 5`,
        [subject]
      ),
    ]);

    res.json({
      student: student.rows[0] || null,
      contract: contract.rows[0]
        ? { ...contract.rows[0], term_months: CONTRACT_MONTHS }
        : null,
      package: pkg,
      attendance: attendance.rows[0],
      homework_due: nextHomework.rows,
    });
  });

  router.get("/cabinet/schedule", ...asLearner, async (req, res) => {
    const subject = await resolveSubject(req, res);
    if (subject == null) return;
    const { rows } = await pool.query(
      `SELECT s.id, s.weekday, s.time, s.format, t.full_name AS teacher_name
         FROM schedule_slots s
         LEFT JOIN users t ON t.id = s.teacher_id
        WHERE s.student_id = $1
        ORDER BY s.weekday, s.time`,
      [subject]
    );
    // Fixed on enrolment; there is deliberately no reschedule endpoint.
    res.json({ slots: rows, reschedule_allowed: false });
  });

  router.get("/cabinet/homework", ...asLearner, async (req, res) => {
    const subject = await resolveSubject(req, res);
    if (subject == null) return;
    const { rows } = await pool.query(
      `SELECT DISTINCT h.id, h.title, h.body, h.due_date, h.created_at,
              t.full_name AS teacher_name,
              s.text AS submission_text, s.submitted_at, s.grade, s.teacher_comment
         FROM homework h
         LEFT JOIN group_members gm ON gm.group_id = h.group_id
         LEFT JOIN users t ON t.id = h.teacher_id
         LEFT JOIN homework_submissions s ON s.homework_id = h.id AND s.student_id = $1
        WHERE h.student_id = $1 OR gm.student_id = $1
        ORDER BY h.due_date DESC NULLS LAST, h.id DESC`,
      [subject]
    );
    res.json(rows);
  });

  // Parents are read-mostly: they can see the homework but not answer it.
  router.post("/cabinet/homework/:id/submit", requireDb, requireAuth, requireRole("student"), async (req, res) => {
    const homeworkId = int(req.params.id);
    const text = clean(req.body?.text, 5000);
    if (!text) return res.status(400).json({ detail: "Answer text is required" });

    const { rows } = await pool.query(
      `SELECT h.id FROM homework h
         LEFT JOIN group_members gm ON gm.group_id = h.group_id
        WHERE h.id = $1 AND (h.student_id = $2 OR gm.student_id = $2) LIMIT 1`,
      [homeworkId, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ detail: "Homework not found" });

    const saved = await pool.query(
      `INSERT INTO homework_submissions (homework_id, student_id, text)
       VALUES ($1, $2, $3)
       ON CONFLICT (homework_id, student_id)
       DO UPDATE SET text = EXCLUDED.text, submitted_at = now(), grade = NULL,
                     teacher_comment = NULL, graded_at = NULL
       RETURNING id, submitted_at`,
      [homeworkId, req.user.id, text]
    );
    await log(req.user.id, "homework.submit", `homework:${homeworkId}`);
    res.json(saved.rows[0]);
  });

  router.get("/cabinet/attendance", ...asLearner, async (req, res) => {
    const subject = await resolveSubject(req, res);
    if (subject == null) return;
    const { rows } = await pool.query(
      `SELECT a.id, a.lesson_date, a.status, a.comment, t.full_name AS teacher_name
         FROM attendance a LEFT JOIN users t ON t.id = a.teacher_id
        WHERE a.student_id = $1 ORDER BY a.lesson_date DESC LIMIT 200`,
      [subject]
    );
    // Spelled out for the UI: a missed lesson is still a delivered lesson.
    res.json({ records: rows, missed_counts_as_held: true });
  });

  router.get("/cabinet/payments", ...asLearner, async (req, res) => {
    const subject = await resolveSubject(req, res);
    if (subject == null) return;
    const [payments, pkg] = await Promise.all([
      pool.query(
        `SELECT id, amount, currency, paid_at, note FROM payments
          WHERE student_id = $1 ORDER BY paid_at DESC, id DESC LIMIT 200`,
        [subject]
      ),
      packageSummary(subject),
    ]);
    res.json({ payments: payments.rows, package: pkg });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEACHER
  // ───────────────────────────────────────────────────────────────────────────
  const asTeacher = [requireDb, requireAuth, requireRole("teacher")];

  // A teacher may only ever touch students who are in one of their groups or
  // in one of their own schedule slots.
  async function teachesStudent(teacherId, studentId) {
    const { rows } = await pool.query(
      `SELECT 1
         FROM group_members gm JOIN groups g ON g.id = gm.group_id
        WHERE g.teacher_id = $1 AND gm.student_id = $2
        UNION
       SELECT 1 FROM schedule_slots WHERE teacher_id = $1 AND student_id = $2
        LIMIT 1`,
      [teacherId, studentId]
    );
    return rows.length > 0;
  }

  router.get("/cabinet/teacher/schedule", ...asTeacher, async (req, res) => {
    const { rows } = await pool.query(
      `SELECT s.id, s.weekday, s.time, s.format, u.id AS student_id, u.full_name AS student_name
         FROM schedule_slots s JOIN users u ON u.id = s.student_id
        WHERE s.teacher_id = $1 ORDER BY s.weekday, s.time`,
      [req.user.id]
    );
    res.json({ slots: rows, reschedule_allowed: false });
  });

  router.get("/cabinet/teacher/groups", ...asTeacher, async (req, res) => {
    const { rows } = await pool.query(
      `SELECT g.id, g.name, g.course_id,
              COALESCE(json_agg(json_build_object('id', u.id, 'full_name', u.full_name)
                       ORDER BY u.full_name) FILTER (WHERE u.id IS NOT NULL), '[]') AS students
         FROM groups g
         LEFT JOIN group_members gm ON gm.group_id = g.id
         LEFT JOIN users u ON u.id = gm.student_id
        WHERE g.teacher_id = $1
        GROUP BY g.id ORDER BY g.name`,
      [req.user.id]
    );
    res.json(rows);
  });

  router.get("/cabinet/teacher/students", ...asTeacher, async (req, res) => {
    const { rows } = await pool.query(
      `SELECT DISTINCT u.id, u.full_name, u.email
         FROM users u
         LEFT JOIN group_members gm ON gm.student_id = u.id
         LEFT JOIN groups g ON g.id = gm.group_id
         LEFT JOIN schedule_slots s ON s.student_id = u.id
        WHERE u.role = 'student' AND (g.teacher_id = $1 OR s.teacher_id = $1)
        ORDER BY u.full_name`,
      [req.user.id]
    );
    res.json(rows);
  });

  router.get("/cabinet/teacher/homework", ...asTeacher, async (req, res) => {
    const { rows } = await pool.query(
      `SELECT h.id, h.title, h.body, h.due_date, h.group_id, h.student_id, g.name AS group_name,
              COALESCE(json_agg(json_build_object(
                'student_id', s.student_id, 'student_name', su.full_name,
                'text', s.text, 'submitted_at', s.submitted_at,
                'grade', s.grade, 'teacher_comment', s.teacher_comment)
                ORDER BY s.submitted_at) FILTER (WHERE s.id IS NOT NULL), '[]') AS submissions
         FROM homework h
         LEFT JOIN groups g ON g.id = h.group_id
         LEFT JOIN homework_submissions s ON s.homework_id = h.id
         LEFT JOIN users su ON su.id = s.student_id
        WHERE h.teacher_id = $1
        GROUP BY h.id, g.name ORDER BY h.created_at DESC LIMIT 100`,
      [req.user.id]
    );
    res.json(rows);
  });

  router.post("/cabinet/teacher/homework", ...asTeacher, async (req, res) => {
    const title = clean(req.body?.title, 200);
    const body = clean(req.body?.body, 5000);
    const dueDate = clean(req.body?.due_date, 20) || null;
    const groupId = int(req.body?.group_id);
    const studentId = int(req.body?.student_id);
    if (!title) return res.status(400).json({ detail: "Title is required" });
    if ((groupId == null) === (studentId == null)) {
      return res.status(400).json({ detail: "Set exactly one of group_id or student_id" });
    }
    if (groupId != null) {
      const { rows } = await pool.query("SELECT 1 FROM groups WHERE id = $1 AND teacher_id = $2", [
        groupId,
        req.user.id,
      ]);
      if (!rows[0]) return res.status(403).json({ detail: "Not your group" });
    }
    if (studentId != null && !(await teachesStudent(req.user.id, studentId))) {
      return res.status(403).json({ detail: "Not your student" });
    }
    const { rows } = await pool.query(
      `INSERT INTO homework (teacher_id, group_id, student_id, title, body, due_date)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.id, groupId, studentId, title, body || null, dueDate]
    );
    await log(req.user.id, "homework.create", `homework:${rows[0].id}`);
    res.json(rows[0]);
  });

  router.post("/cabinet/teacher/homework/:id/grade", ...asTeacher, async (req, res) => {
    const homeworkId = int(req.params.id);
    const studentId = int(req.body?.student_id);
    const grade = clean(req.body?.grade, 20);
    const comment = clean(req.body?.comment, 2000);
    const { rows } = await pool.query(
      `UPDATE homework_submissions s
          SET grade = $3, teacher_comment = $4, graded_at = now()
         FROM homework h
        WHERE s.homework_id = h.id AND h.id = $1 AND s.student_id = $2 AND h.teacher_id = $5
        RETURNING s.id, s.grade, s.teacher_comment, s.graded_at`,
      [homeworkId, studentId, grade || null, comment || null, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ detail: "Submission not found" });
    await log(req.user.id, "homework.grade", `homework:${homeworkId} student:${studentId}`);
    res.json(rows[0]);
  });

  // Marking attendance consumes one lesson from the package whether the
  // student showed up or not — the brief treats a missed lesson as delivered.
  router.post("/cabinet/teacher/attendance", ...asTeacher, async (req, res) => {
    const studentId = int(req.body?.student_id);
    const status = clean(req.body?.status, 10);
    const lessonDate = clean(req.body?.lesson_date, 20);
    const comment = clean(req.body?.comment, 500);
    if (!["present", "missed"].includes(status)) {
      return res.status(400).json({ detail: "status must be 'present' or 'missed'" });
    }
    if (!lessonDate) return res.status(400).json({ detail: "lesson_date is required" });
    if (!(await teachesStudent(req.user.id, studentId))) {
      return res.status(403).json({ detail: "Not your student" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO attendance (student_id, teacher_id, lesson_date, status, comment)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (student_id, lesson_date)
         DO UPDATE SET status = EXCLUDED.status, comment = EXCLUDED.comment
         RETURNING id, (xmax = 0) AS is_new`,
        [studentId, req.user.id, lessonDate, status, comment || null]
      );
      // Only a brand-new record spends a lesson; correcting present<->missed
      // for a date already marked must not charge the student twice.
      if (inserted.rows[0].is_new) {
        await client.query(
          `UPDATE lesson_packages
              SET lessons_used = lessons_used + 1
            WHERE id = (SELECT id FROM lesson_packages
                         WHERE student_id = $1 AND lessons_used < lessons_paid
                         ORDER BY purchased_at, id LIMIT 1)`,
          [studentId]
        );
      }
      await client.query("COMMIT");
      await log(req.user.id, "attendance.mark", `student:${studentId} ${lessonDate} ${status}`);
      res.json({ success: true, id: inserted.rows[0].id, lesson_consumed: inserted.rows[0].is_new });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("attendance.mark failed:", e.message);
      res.status(500).json({ detail: "Could not save attendance" });
    } finally {
      client.release();
    }
  });

  // Net of withholding, never gross. With no rate on file the cabinet says so
  // rather than showing a zero that reads like "you earned nothing".
  router.get("/cabinet/teacher/finance", ...asTeacher, async (req, res) => {
    const [rate, lessons] = await Promise.all([
      pool.query("SELECT per_lesson, tax_percent, currency FROM teacher_rates WHERE teacher_id = $1", [
        req.user.id,
      ]),
      pool.query(
        `SELECT date_trunc('month', lesson_date)::date AS month, COUNT(*)::int AS lessons
           FROM attendance WHERE teacher_id = $1
          GROUP BY 1 ORDER BY 1 DESC LIMIT 12`,
        [req.user.id]
      ),
    ]);
    if (!rate.rows[0]) {
      return res.json({ configured: false, months: lessons.rows, detail: "No pay rate on file yet — ask the office." });
    }
    const { per_lesson, tax_percent, currency } = rate.rows[0];
    const months = lessons.rows.map((m) => {
      const gross = Number(per_lesson) * m.lessons;
      const net = gross * (1 - Number(tax_percent) / 100);
      return { month: m.month, lessons: m.lessons, net: Math.round(net) };
    });
    res.json({ configured: true, currency, tax_percent: Number(tax_percent), months, shows: "net of withholding" });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ADMIN AND OWNER
  // Every write here is written to action_log with the acting user's id, which
  // is what makes the two-administrator shift setup auditable.
  // ───────────────────────────────────────────────────────────────────────────
  const asStaff = [requireDb, requireAuth, requireRole(...STAFF)];

  router.get("/cabinet/staff/users", ...asStaff, async (req, res) => {
    const role = clean(req.query.role, 20);
    const params = [];
    let where = "";
    if (ROLES.includes(role)) {
      params.push(role);
      where = "WHERE role = $1";
    }
    const { rows } = await pool.query(
      `SELECT id, email, role, full_name, is_active, created_at FROM users ${where}
        ORDER BY role, full_name NULLS LAST, id`,
      params
    );
    res.json(rows);
  });

  router.post("/cabinet/staff/users", ...asStaff, async (req, res) => {
    const email = normEmail(req.body?.email);
    const role = clean(req.body?.role, 20);
    const fullName = clean(req.body?.full_name, 200);
    const password = String(req.body?.password ?? "");
    if (!email.includes("@")) return res.status(400).json({ detail: "A valid email is required" });
    if (!ROLES.includes(role)) return res.status(400).json({ detail: "Unknown role" });
    if (password.length < 8) return res.status(400).json({ detail: "Password must be at least 8 characters" });
    // Only an owner may mint staff accounts.
    if (STAFF.includes(role) && req.user.role !== "owner") {
      return res.status(403).json({ detail: "Only the owner can create admin or owner accounts" });
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO users (email, password_hash, role, full_name, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, email, role, full_name, is_active, created_at`,
        [email, await bcrypt.hash(password, BCRYPT_ROUNDS), role, fullName || null, req.user.id]
      );
      await log(req.user.id, "user.create", `${role}:${email}`);
      res.json(rows[0]);
    } catch (e) {
      if (e.code === "23505") return res.status(409).json({ detail: "That email already has an account" });
      throw e;
    }
  });

  router.patch("/cabinet/staff/users/:id", ...asStaff, async (req, res) => {
    const id = int(req.params.id);
    const target = await pool.query("SELECT role FROM users WHERE id = $1", [id]);
    if (!target.rows[0]) return res.status(404).json({ detail: "User not found" });
    if (STAFF.includes(target.rows[0].role) && req.user.role !== "owner") {
      return res.status(403).json({ detail: "Only the owner can change staff accounts" });
    }
    const fullName = req.body?.full_name === undefined ? null : clean(req.body.full_name, 200);
    const isActive = req.body?.is_active === undefined ? null : Boolean(req.body.is_active);
    const { rows } = await pool.query(
      `UPDATE users SET full_name = COALESCE($2, full_name), is_active = COALESCE($3, is_active)
        WHERE id = $1 RETURNING id, email, role, full_name, is_active`,
      [id, fullName, isActive]
    );
    // Disabling an account must not leave its existing sessions working.
    if (isActive === false) await pool.query("DELETE FROM auth_sessions WHERE user_id = $1", [id]);
    await log(req.user.id, "user.update", `user:${id}`);
    res.json(rows[0]);
  });

  router.post("/cabinet/staff/users/:id/password", ...asStaff, async (req, res) => {
    const id = int(req.params.id);
    const password = String(req.body?.password ?? "");
    if (password.length < 8) return res.status(400).json({ detail: "Password must be at least 8 characters" });
    const target = await pool.query("SELECT role, email FROM users WHERE id = $1", [id]);
    if (!target.rows[0]) return res.status(404).json({ detail: "User not found" });
    if (STAFF.includes(target.rows[0].role) && req.user.role !== "owner") {
      return res.status(403).json({ detail: "Only the owner can reset staff passwords" });
    }
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
      await bcrypt.hash(password, BCRYPT_ROUNDS),
      id,
    ]);
    await pool.query("DELETE FROM auth_sessions WHERE user_id = $1", [id]);
    await log(req.user.id, "user.password_reset", `user:${id}`);
    res.json({ success: true });
  });

  router.post("/cabinet/staff/contracts", ...asStaff, async (req, res) => {
    const studentId = int(req.body?.student_id);
    const start = clean(req.body?.contract_start, 20);
    if (!studentId || !start) return res.status(400).json({ detail: "student_id and contract_start are required" });
    // The term is fixed at 12 months, so the end date is derived, not typed in.
    const { rows } = await pool.query(
      `INSERT INTO contracts (student_id, contract_start, contract_end)
       VALUES ($1, $2::date, $2::date + ($3 || ' months')::interval) RETURNING *`,
      [studentId, start, String(CONTRACT_MONTHS)]
    );
    await log(req.user.id, "contract.create", `student:${studentId}`);
    res.json({ ...rows[0], term_months: CONTRACT_MONTHS });
  });

  router.post("/cabinet/staff/packages", ...asStaff, async (req, res) => {
    const studentId = int(req.body?.student_id);
    const contractId = int(req.body?.contract_id);
    const lessonsPaid = int(req.body?.lessons_paid) ?? PACKAGE_LESSONS;
    if (!studentId) return res.status(400).json({ detail: "student_id is required" });
    const { rows } = await pool.query(
      `INSERT INTO lesson_packages (student_id, contract_id, lessons_paid)
       VALUES ($1, $2, $3) RETURNING *`,
      [studentId, contractId, lessonsPaid]
    );
    await log(req.user.id, "package.create", `student:${studentId} lessons:${lessonsPaid}`);
    res.json(rows[0]);
  });

  router.post("/cabinet/staff/schedule", ...asStaff, async (req, res) => {
    const studentId = int(req.body?.student_id);
    const teacherId = int(req.body?.teacher_id);
    const weekday = int(req.body?.weekday);
    const time = clean(req.body?.time, 20);
    const format = clean(req.body?.format, 20);
    if (studentId == null || weekday == null || !time) {
      return res.status(400).json({ detail: "student_id, weekday and time are required" });
    }
    if (weekday < 0 || weekday > 6) return res.status(400).json({ detail: "weekday must be 0..6" });
    if (!["group", "individual"].includes(format)) {
      return res.status(400).json({ detail: "format must be 'group' or 'individual'" });
    }
    const { rows } = await pool.query(
      `INSERT INTO schedule_slots (student_id, teacher_id, weekday, time, format)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [studentId, teacherId, weekday, time, format]
    );
    await log(req.user.id, "schedule.create", `student:${studentId}`);
    res.json(rows[0]);
  });

  router.delete("/cabinet/staff/schedule/:id", ...asStaff, async (req, res) => {
    const { rowCount } = await pool.query("DELETE FROM schedule_slots WHERE id = $1", [int(req.params.id)]);
    if (!rowCount) return res.status(404).json({ detail: "Slot not found" });
    await log(req.user.id, "schedule.delete", `slot:${req.params.id}`);
    res.json({ success: true });
  });

  router.post("/cabinet/staff/payments", ...asStaff, async (req, res) => {
    const studentId = int(req.body?.student_id);
    const amount = Number(req.body?.amount);
    const paidAt = clean(req.body?.paid_at, 20);
    const note = clean(req.body?.note, 500);
    const currency = clean(req.body?.currency, 10) || "UZS";
    if (!studentId || !Number.isFinite(amount) || amount <= 0 || !paidAt) {
      return res.status(400).json({ detail: "student_id, a positive amount and paid_at are required" });
    }
    const { rows } = await pool.query(
      `INSERT INTO payments (student_id, amount, currency, paid_at, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [studentId, amount, currency, paidAt, note || null, req.user.id]
    );
    await log(req.user.id, "payment.create", `student:${studentId} ${amount} ${currency}`);
    res.json(rows[0]);
  });

  router.post("/cabinet/staff/groups", ...asStaff, async (req, res) => {
    const name = clean(req.body?.name, 200);
    const teacherId = int(req.body?.teacher_id);
    const courseId = int(req.body?.course_id);
    if (!name) return res.status(400).json({ detail: "Group name is required" });
    const { rows } = await pool.query(
      "INSERT INTO groups (name, teacher_id, course_id) VALUES ($1, $2, $3) RETURNING *",
      [name, teacherId, courseId]
    );
    await log(req.user.id, "group.create", `group:${rows[0].id}`);
    res.json(rows[0]);
  });

  router.post("/cabinet/staff/groups/:id/members", ...asStaff, async (req, res) => {
    const groupId = int(req.params.id);
    const studentId = int(req.body?.student_id);
    if (!studentId) return res.status(400).json({ detail: "student_id is required" });
    await pool.query(
      "INSERT INTO group_members (group_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [groupId, studentId]
    );
    await log(req.user.id, "group.add_member", `group:${groupId} student:${studentId}`);
    res.json({ success: true });
  });

  router.delete("/cabinet/staff/groups/:id/members/:studentId", ...asStaff, async (req, res) => {
    await pool.query("DELETE FROM group_members WHERE group_id = $1 AND student_id = $2", [
      int(req.params.id),
      int(req.params.studentId),
    ]);
    await log(req.user.id, "group.remove_member", `group:${req.params.id} student:${req.params.studentId}`);
    res.json({ success: true });
  });

  router.post("/cabinet/staff/parent-links", ...asStaff, async (req, res) => {
    const parentId = int(req.body?.parent_id);
    const studentId = int(req.body?.student_id);
    if (!parentId || !studentId) return res.status(400).json({ detail: "parent_id and student_id are required" });
    const { rows } = await pool.query("SELECT id, role FROM users WHERE id = ANY($1)", [[parentId, studentId]]);
    const parent = rows.find((r) => r.id === parentId);
    const student = rows.find((r) => r.id === studentId);
    if (!parent || parent.role !== "parent") return res.status(400).json({ detail: "parent_id is not a parent" });
    if (!student || student.role !== "student") return res.status(400).json({ detail: "student_id is not a student" });
    await pool.query(
      "INSERT INTO parent_links (parent_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [parentId, studentId]
    );
    await log(req.user.id, "parent_link.create", `parent:${parentId} student:${studentId}`);
    res.json({ success: true });
  });

  router.post("/cabinet/staff/teacher-rate", ...asStaff, async (req, res) => {
    const teacherId = int(req.body?.teacher_id);
    const perLesson = Number(req.body?.per_lesson);
    const taxPercent = Number(req.body?.tax_percent);
    if (!teacherId || !Number.isFinite(perLesson) || !Number.isFinite(taxPercent)) {
      return res.status(400).json({ detail: "teacher_id, per_lesson and tax_percent are required" });
    }
    if (taxPercent < 0 || taxPercent > 100) return res.status(400).json({ detail: "tax_percent must be 0..100" });
    const { rows } = await pool.query(
      `INSERT INTO teacher_rates (teacher_id, per_lesson, tax_percent, currency)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (teacher_id) DO UPDATE
         SET per_lesson = EXCLUDED.per_lesson, tax_percent = EXCLUDED.tax_percent, currency = EXCLUDED.currency
       RETURNING *`,
      [teacherId, perLesson, taxPercent, clean(req.body?.currency, 10) || "UZS"]
    );
    await log(req.user.id, "teacher_rate.set", `teacher:${teacherId}`);
    res.json(rows[0]);
  });

  // One student's full picture, for the office. Same numbers the student sees.
  router.get("/cabinet/staff/students/:id", ...asStaff, async (req, res) => {
    const id = int(req.params.id);
    const [user, contract, packages, slots, payments, attendance, parents] = await Promise.all([
      pool.query("SELECT id, email, full_name, is_active FROM users WHERE id = $1 AND role = 'student'", [id]),
      pool.query("SELECT * FROM contracts WHERE student_id = $1 ORDER BY contract_end DESC", [id]),
      pool.query("SELECT * FROM lesson_packages WHERE student_id = $1 ORDER BY purchased_at DESC", [id]),
      pool.query(
        `SELECT s.*, t.full_name AS teacher_name FROM schedule_slots s
           LEFT JOIN users t ON t.id = s.teacher_id
          WHERE s.student_id = $1 ORDER BY s.weekday, s.time`,
        [id]
      ),
      pool.query("SELECT * FROM payments WHERE student_id = $1 ORDER BY paid_at DESC", [id]),
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE status = 'present')::int AS present,
                COUNT(*) FILTER (WHERE status = 'missed')::int AS missed
           FROM attendance WHERE student_id = $1`,
        [id]
      ),
      pool.query(
        `SELECT u.id, u.full_name, u.email FROM parent_links l
           JOIN users u ON u.id = l.parent_id WHERE l.student_id = $1`,
        [id]
      ),
    ]);
    if (!user.rows[0]) return res.status(404).json({ detail: "Student not found" });
    res.json({
      student: user.rows[0],
      contracts: contract.rows,
      contract_term_months: CONTRACT_MONTHS,
      packages: packages.rows,
      package: await packageSummary(id),
      schedule: slots.rows,
      payments: payments.rows,
      attendance: attendance.rows[0],
      parents: parents.rows,
    });
  });

  router.get("/cabinet/staff/log", ...asStaff, async (req, res) => {
    const { rows } = await pool.query(
      `SELECT l.id, l.action, l.target, l.created_at, u.full_name, u.email, u.role
         FROM action_log l LEFT JOIN users u ON u.id = l.user_id
        ORDER BY l.id DESC LIMIT 300`
    );
    res.json(rows);
  });

  router.get("/cabinet/staff/analytics", requireDb, requireAuth, requireRole("owner"), async (req, res) => {
    const [counts, money, lessons] = await Promise.all([
      pool.query(
        `SELECT role, COUNT(*)::int AS n FROM users WHERE is_active GROUP BY role`
      ),
      pool.query(
        `SELECT date_trunc('month', paid_at)::date AS month, SUM(amount)::float AS total, currency
           FROM payments GROUP BY 1, currency ORDER BY 1 DESC LIMIT 12`
      ),
      pool.query(
        `SELECT COALESCE(SUM(lessons_paid), 0)::int AS paid, COALESCE(SUM(lessons_used), 0)::int AS used
           FROM lesson_packages`
      ),
    ]);
    res.json({
      users: Object.fromEntries(counts.rows.map((r) => [r.role, r.n])),
      revenue_by_month: money.rows,
      lessons: lessons.rows[0],
    });
  });

  return router;
}

module.exports = { cabinetRouter };
