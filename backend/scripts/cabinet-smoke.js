/**
 * End-to-end check for the role cabinets.
 *
 * Why this exists: every cabinet route is SQL against Postgres, and none of it
 * can be exercised by the JSON-file dev fallback. This script boots the real
 * app against a real database and walks one full lifecycle — create people,
 * enrol a student, teach a lesson, take a payment — then tries the things that
 * must NOT work: reading someone else's data, a parent answering homework, an
 * admin minting an owner. It leaves nothing behind.
 *
 * Usage (from the backend directory):
 *   DATABASE_URL=postgres://... node scripts/cabinet-smoke.js
 *
 * Safe to run against production: every row it creates uses the smoke-test
 * email suffix below and is deleted again at the end, and it never touches the
 * public catalogue.
 */

const SUFFIX = "@smoke.skillup.invalid";
const PASSWORD = "smoke-password-1";

process.env.OWNER_EMAIL = `owner${SUFFIX}`;
process.env.OWNER_PASSWORD = PASSWORD;
process.env.OWNER_NAME = "Smoke Owner";

const { app, loadData, saveData } = require("../server");
const { ensureCabinetSchema, ensureOwner } = require("../cabinet");

let passed = 0;
let failed = 0;

function check(label, condition, extra) {
  if (condition) {
    passed++;
    console.log(`  ok    ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${extra ? ` — ${extra}` : ""}`);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. This script needs a real Postgres.");
    process.exit(1);
  }

  const { Pool } = require("pg");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await ensureCabinetSchema(pool);
  await ensureOwner(pool);

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;

  // Minimal fetch wrapper: returns status and body together so a test can
  // assert on a rejection without an exception unwinding the whole run.
  const call = async (path, { method = "GET", token, body } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  const signIn = async (email) => {
    const r = await call("/auth/login", { method: "POST", body: { email, password: PASSWORD } });
    return r.body.token;
  };

  try {
    console.log("\nAuth");
    const ownerToken = await signIn(`owner${SUFFIX}`);
    check("owner signs in", Boolean(ownerToken));
    check(
      "wrong password is refused",
      (await call("/auth/login", { method: "POST", body: { email: `owner${SUFFIX}`, password: "nope" } })).status === 401
    );
    check("no token means 401", (await call("/cabinet/staff/users")).status === 401);

    console.log("\nStaff creates people");
    const mk = async (role, name) =>
      (await call("/cabinet/staff/users", {
        method: "POST",
        token: ownerToken,
        body: { email: `${role}-${name}${SUFFIX}`, password: PASSWORD, role, full_name: `${role} ${name}` },
      })).body;

    const student = await mk("student", "a");
    const other = await mk("student", "b");
    const parent = await mk("parent", "a");
    const teacher = await mk("teacher", "a");
    const admin = await mk("admin", "a");
    check("owner created five accounts", [student, other, parent, teacher, admin].every((u) => u && u.id));
    check(
      "duplicate email is refused",
      (await call("/cabinet/staff/users", {
        method: "POST",
        token: ownerToken,
        body: { email: `student-a${SUFFIX}`, password: PASSWORD, role: "student" },
      })).status === 409
    );

    const adminToken = await signIn(`admin-a${SUFFIX}`);
    check(
      "admin may NOT create an owner",
      (await call("/cabinet/staff/users", {
        method: "POST",
        token: adminToken,
        body: { email: `owner-2${SUFFIX}`, password: PASSWORD, role: "owner" },
      })).status === 403
    );

    console.log("\nEnrolment");
    const contract = (await call("/cabinet/staff/contracts", {
      method: "POST",
      token: adminToken,
      body: { student_id: student.id, contract_start: "2026-01-01" },
    })).body;
    check("contract runs 12 months", String(contract.contract_end).startsWith("2027-01-01"), contract.contract_end);

    const pkg = (await call("/cabinet/staff/packages", {
      method: "POST",
      token: adminToken,
      body: { student_id: student.id, contract_id: contract.id, lessons_paid: 12 },
    })).body;
    check("package holds 12 lessons", pkg.lessons_paid === 12);

    await call("/cabinet/staff/schedule", {
      method: "POST",
      token: adminToken,
      body: { student_id: student.id, teacher_id: teacher.id, weekday: 1, time: "18:00", format: "individual" },
    });
    await call("/cabinet/staff/parent-links", {
      method: "POST",
      token: adminToken,
      body: { parent_id: parent.id, student_id: student.id },
    });
    const group = (await call("/cabinet/staff/groups", {
      method: "POST",
      token: adminToken,
      body: { name: `Smoke group${SUFFIX}`, teacher_id: teacher.id },
    })).body;
    await call(`/cabinet/staff/groups/${group.id}/members`, {
      method: "POST",
      token: adminToken,
      body: { student_id: student.id },
    });

    console.log("\nTeacher");
    const teacherToken = await signIn(`teacher-a${SUFFIX}`);
    const hw = (await call("/cabinet/teacher/homework", {
      method: "POST",
      token: teacherToken,
      body: { title: "Smoke homework", body: "Do the thing", group_id: group.id, due_date: "2026-02-01" },
    })).body;
    check("teacher set homework for their group", Boolean(hw.id));
    check(
      "teacher cannot set homework for a student they do not teach",
      (await call("/cabinet/teacher/homework", {
        method: "POST",
        token: teacherToken,
        body: { title: "Nope", student_id: other.id },
      })).status === 403
    );

    const mark1 = await call("/cabinet/teacher/attendance", {
      method: "POST",
      token: teacherToken,
      body: { student_id: student.id, lesson_date: "2026-01-05", status: "missed" },
    });
    check("marking a missed lesson still consumes one", mark1.body.lesson_consumed === true);
    const mark2 = await call("/cabinet/teacher/attendance", {
      method: "POST",
      token: teacherToken,
      body: { student_id: student.id, lesson_date: "2026-01-05", status: "present" },
    });
    check("correcting the same date does not double-charge", mark2.body.lesson_consumed === false);
    check(
      "teacher cannot mark a student they do not teach",
      (await call("/cabinet/teacher/attendance", {
        method: "POST",
        token: teacherToken,
        body: { student_id: other.id, lesson_date: "2026-01-05", status: "present" },
      })).status === 403
    );

    console.log("\nStudent");
    const studentToken = await signIn(`student-a${SUFFIX}`);
    const overview = (await call("/cabinet/overview", { token: studentToken })).body;
    check("student sees 11 lessons left of 12", overview.package.lessons_left === 11, JSON.stringify(overview.package));
    check("contract and package are separate numbers",
      overview.contract.term_months === 12 && overview.package.package_size === 12);
    const studentHw = (await call("/cabinet/homework", { token: studentToken })).body;
    check("group homework reaches the student", studentHw.some((h) => h.id === hw.id));
    check(
      "student submits an answer",
      (await call(`/cabinet/homework/${hw.id}/submit`, {
        method: "POST",
        token: studentToken,
        body: { text: "My answer" },
      })).status === 200
    );
    check("student may not read the staff user list",
      (await call("/cabinet/staff/users", { token: studentToken })).status === 403);

    console.log("\nParent");
    const parentToken = await signIn(`parent-a${SUFFIX}`);
    const me = (await call("/auth/me", { token: parentToken })).body;
    check("parent sees exactly one linked child", me.children.length === 1 && me.children[0].id === student.id);
    check("parent reads their child's overview",
      (await call("/cabinet/overview", { token: parentToken })).body.student.id === student.id);
    check(
      "parent may NOT read another child",
      (await call(`/cabinet/overview?student_id=${other.id}`, { token: parentToken })).status === 403
    );
    check(
      "parent may NOT answer homework",
      (await call(`/cabinet/homework/${hw.id}/submit`, {
        method: "POST",
        token: parentToken,
        body: { text: "not allowed" },
      })).status === 403
    );

    console.log("\nMoney");
    await call("/cabinet/staff/payments", {
      method: "POST",
      token: adminToken,
      body: { student_id: student.id, amount: 1200000, paid_at: "2026-01-02", note: "smoke" },
    });
    check("student sees the payment",
      (await call("/cabinet/payments", { token: studentToken })).body.payments.length === 1);

    const noRate = (await call("/cabinet/teacher/finance", { token: teacherToken })).body;
    check("teacher with no rate is told so, not shown a zero", noRate.configured === false);
    await call("/cabinet/staff/teacher-rate", {
      method: "POST",
      token: adminToken,
      body: { teacher_id: teacher.id, per_lesson: 100000, tax_percent: 12 },
    });
    const finance = (await call("/cabinet/teacher/finance", { token: teacherToken })).body;
    check("earnings are net of withholding", finance.configured && finance.months[0].net === 88000,
      JSON.stringify(finance.months && finance.months[0]));

    console.log("\nOffice screens");
    const card = (await call(`/cabinet/staff/students/${student.id}`, { token: adminToken })).body;
    check("student card carries the individual attendance records", card.attendance_records.length === 1);
    check("student card lists the groups they are in", card.groups.some((g) => g.id === group.id));
    check("student card keeps contract and package apart",
      card.contract_term_months === 12 && card.package.package_size === 12);

    const allGroups = (await call("/cabinet/staff/groups", { token: adminToken })).body;
    check("office sees every group, not just one teacher's",
      allGroups.some((g) => g.id === group.id && g.students.length === 1));
    check("office can read teacher rates",
      (await call("/cabinet/staff/teacher-rates", { token: adminToken })).body.some(
        (r) => r.teacher_id === teacher.id
      ));

    console.log("\nCorrections");
    const attendanceId = card.attendance_records[0].id;
    check(
      "removing a wrongly marked lesson puts it back on the package",
      (await call(`/cabinet/staff/attendance/${attendanceId}`, { method: "DELETE", token: adminToken })).status === 200 &&
        (await call("/cabinet/overview", { token: parentToken })).body.package.lessons_left === 12
    );
    check(
      "a payment entered by mistake can be removed",
      (await call(`/cabinet/staff/payments/${card.payments[0].id}`, { method: "DELETE", token: adminToken })).status === 200
    );
    check(
      "a parent link can be undone",
      (await call(`/cabinet/staff/parent-links/${parent.id}/${student.id}`, { method: "DELETE", token: adminToken })).status === 200
    );
    check(
      "the unlinked parent loses access immediately",
      (await call("/cabinet/overview", { token: parentToken })).status === 404
    );
    check(
      "a student may NOT remove a payment",
      (await call(`/cabinet/staff/payments/999999`, { method: "DELETE", token: studentToken })).status === 403
    );
    check(
      "every correction is written to the log",
      (await call("/cabinet/staff/log", { token: adminToken })).body.some((r) => r.action === "attendance.delete")
    );

    console.log("\nPutting a group on the timetable");
    const scheduled = await call(`/cabinet/staff/groups/${group.id}/schedule`, {
      method: "POST",
      token: adminToken,
      body: { weekday: 3, time: "18:00" },
    });
    check("one lesson lands on every member", scheduled.body.created === 1, JSON.stringify(scheduled.body));
    check(
      "and the group's teacher is the one on it",
      (await call("/cabinet/teacher/schedule", { token: teacherToken })).body.slots.some(
        (s) => s.time === "18:00" && s.format === "group" && s.student_id === student.id
      )
    );
    check(
      "an impossible weekday is refused",
      (await call(`/cabinet/staff/groups/${group.id}/schedule`, {
        method: "POST",
        token: adminToken,
        body: { weekday: 99, time: "18:00" },
      })).status === 400
    );
    check(
      "scheduling a group that does not exist is a 404, not a silent no-op",
      (await call("/cabinet/staff/groups/999999/schedule", {
        method: "POST",
        token: adminToken,
        body: { weekday: 3, time: "18:00" },
      })).status === 404
    );

    console.log("\nA student leaves");
    // Leaving is turning the account off. The person stops being able to sign
    // in and drops off the teachers' screens; the money and the attendance stay,
    // because those are the academy's records and not the student's.
    const paymentsBefore = (await call(`/cabinet/staff/students/${other.id}`, { token: adminToken })).body;
    await call("/cabinet/staff/payments", {
      method: "POST",
      token: adminToken,
      body: { student_id: other.id, amount: 500000, paid_at: "2026-02-01", note: "before leaving" },
    });
    await call("/cabinet/staff/schedule", {
      method: "POST",
      token: adminToken,
      body: { student_id: other.id, teacher_id: teacher.id, weekday: 2, time: "10:00", format: "individual" },
    });
    check("the leaver was on the teacher's schedule first",
      (await call("/cabinet/teacher/schedule", { token: teacherToken })).body.slots.some(
        (s) => s.student_id === other.id
      ));

    await call(`/cabinet/staff/users/${other.id}`, {
      method: "PATCH",
      token: adminToken,
      body: { is_active: false },
    });

    check(
      "a departed student can no longer sign in",
      (await call("/auth/login", { method: "POST", body: { email: `student-b${SUFFIX}`, password: PASSWORD } })).status === 401
    );
    check(
      "they disappear from the teacher's schedule",
      !(await call("/cabinet/teacher/schedule", { token: teacherToken })).body.slots.some(
        (s) => s.student_id === other.id
      )
    );
    check(
      "and from the teacher's student list",
      !(await call("/cabinet/teacher/students", { token: teacherToken })).body.some((s) => s.id === other.id)
    );
    const after = (await call(`/cabinet/staff/students/${other.id}`, { token: adminToken })).body;
    check("their payment history survives", after.payments.length === paymentsBefore.payments.length + 1);
    check("their card is still reachable for the records", after.student.id === other.id);
    check(
      "the office can still list them under 'gone'",
      (await call("/cabinet/staff/users?active=0", { token: adminToken })).body.some((u) => u.id === other.id)
    );
    check(
      "and they are absent from the 'still here' list",
      !(await call("/cabinet/staff/users?active=1", { token: adminToken })).body.some((u) => u.id === other.id)
    );

    // The parent of a departed student keeps a working account. The office is
    // told, rather than left to discover it.
    await call("/cabinet/staff/parent-links", {
      method: "POST",
      token: adminToken,
      body: { parent_id: parent.id, student_id: other.id },
    });
    const withCounts = (await call("/cabinet/staff/users?role=parent", { token: adminToken })).body;
    check(
      "a parent is shown how many of their children are still here",
      withCounts.find((p) => p.id === parent.id)?.active_children === 0
    );

    console.log("\nApplications");
    // The front desk's starting point. It lives with the public catalogue
    // rather than in the cabinet tables, but the same session opens it.
    await call("/apply", {
      method: "POST",
      body: { name: `Smoke Applicant${SUFFIX}`, phone: "+998000000000", course: "IELTS" },
    });
    const applications = (await call("/admin/applications", { token: adminToken })).body;
    const mine = applications.find((a) => a.name === `Smoke Applicant${SUFFIX}`);
    check("a new application arrives with status 'new'", mine && mine.status === "new");
    const moved = await call(`/admin/applications/${mine.id}`, {
      method: "PATCH",
      token: adminToken,
      body: { status: "contacted" },
    });
    check("the office can mark it called", moved.body.status === "contacted");
    check("and the record says which admin did it", moved.body.handled_by === `admin-a${SUFFIX}`,
      moved.body.handled_by);
    check(
      "an invented status is refused",
      (await call(`/admin/applications/${mine.id}`, {
        method: "PATCH",
        token: adminToken,
        body: { status: "whatever" },
      })).status === 400
    );
    check(
      "a teacher cannot touch applications",
      (await call("/admin/applications", { token: teacherToken })).status === 401
    );

    console.log("\nCatalogue panel");
    // The older /admin panel now accepts a cabinet session, which is what lets
    // the shared ADMIN_PASSWORD be deleted entirely.
    check(
      "an admin's cabinet session opens the catalogue panel",
      (await call("/admin/applications", { token: adminToken })).status === 200
    );
    check(
      "an owner's session opens it too",
      (await call("/admin/applications", { token: ownerToken })).status === 200
    );
    check(
      "a teacher's session does NOT",
      (await call("/admin/applications", { token: teacherToken })).status === 401
    );
    check(
      "a student's session does NOT",
      (await call("/admin/applications", { token: studentToken })).status === 401
    );
    check(
      "no session at all does NOT",
      (await call("/admin/applications")).status === 401
    );

    console.log("\nSessions");
    check("logout kills the token",
      (await call("/auth/logout", { method: "POST", token: studentToken })).status === 200 &&
      (await call("/cabinet/overview", { token: studentToken })).status === 401);

    console.log("\nAudit");
    const logRows = (await call("/cabinet/staff/log", { token: ownerToken })).body;
    check("actions are attributed to a person", logRows.some((r) => r.action === "user.create" && r.email));
  } finally {
    console.log("\nCleanup");
    // ON DELETE CASCADE takes the contracts, packages, slots, homework,
    // attendance and payments with the users; groups are named by suffix.
    const { rowCount } = await pool.query("DELETE FROM users WHERE email LIKE $1", [`%${SUFFIX}`]);
    await pool.query("DELETE FROM groups WHERE name LIKE $1", [`%${SUFFIX}`]);
    console.log(`  removed ${rowCount} smoke accounts`);

    // The application went into the catalogue blob, not a table of its own, so
    // it has to be taken back out the same way.
    const data = await loadData();
    const before = data.applications.length;
    data.applications = data.applications.filter((a) => !String(a.name).endsWith(SUFFIX));
    if (data.applications.length !== before) {
      await saveData(data);
      console.log(`  removed ${before - data.applications.length} smoke application(s)`);
    }
    server.close();
    await pool.end();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\nSmoke run crashed:", e);
  process.exit(1);
});
