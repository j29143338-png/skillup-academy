# SkillUp Academy — role architecture

This document captures the data model and rules for the personal cabinets
(student / parent / teacher / administrator / owner).

**Status: built.** The cabinets are live. `backend/cabinet.js` owns the schema
and creates it at startup, `backend/cabinetApi.js` owns every route, and the
site serves them at `/login` and `/cabinet` (`frontend/src/pages/Login.js` and
`Cabinet.js`). The rules below are no longer a plan — they are what the code
enforces, so changing one means changing the code that implements it.

Cabinets need Postgres. With no `DATABASE_URL` the public site still runs from
the JSON fallback and every cabinet route answers 503 instead of failing in a
confusing way.

## What runs today

| Area | Where |
|------|-------|
| Sign in and out, change password, reset with a code | `/auth/*` |
| Student and parent views | `/cabinet/overview`, `/schedule`, `/homework`, `/attendance`, `/payments` |
| Homework answers | `POST /cabinet/homework/:id/submit` (student only) |
| Teacher: schedule, groups, students, homework, grading, attendance, earnings | `/cabinet/teacher/*` |
| Office: people, contracts, packages, schedule, payments, groups, parent links, teacher rates, audit log | `/cabinet/staff/*` |
| Owner-only analytics | `GET /cabinet/staff/analytics` |

The first owner cannot be created through the UI, because nobody is signed in
yet. Set `OWNER_EMAIL` and `OWNER_PASSWORD` in the environment and the server
creates or resets that account at startup; every other account is made from the
office cabinet.

`node scripts/cabinet-smoke.js` (with `DATABASE_URL` set) walks a full lifecycle
against a real database, asserts the access rules below, and deletes everything
it made.

## Roles

| Role         | Who                                  | Notes |
|--------------|---------------------------------------|-------|
| `student`    | Enrolled learner                      | Sees own schedule, homework, progress, Academic Support, payments |
| `parent`     | Student's parent/guardian             | Same visibility as their child, read-mostly |
| `teacher`    | Instructor                            | Sees own schedule, own groups/students, attendance, homework, comments, Academic Support, own financial info (net of tax withholding, once that system exists) |
| `admin`      | Front-desk administrator (×2, shifts) | Same duties as each other; system must log which admin performed which action (`action_log.user_id`) |
| `owner`      | Business owner                        | Sees everything: students, applications, teachers, admins, schedule, payments, contracts, analytics |

Each user logs in with **their own** email/login + password. No shared logins.

## Data model

- `users` — one row per person, `role` constrained to the 5 values above, `created_by` tracks which admin/owner created the account. `is_active = false` disables sign-in and drops existing sessions.
- `contracts` — contract term is **12 months**, tracked separately from lesson packages (see below). The end date is derived from the start date, never typed in.
- `lesson_packages` — the **paid package is 12 lessons**, tracked separately from the contract. A contract can span multiple packages over its 12 months. Never conflate `contracts.contract_end` with "lessons remaining."
- `schedule_slots` — days/time are fixed once the student enrols. **No reschedule flow** — this matches the public-facing rule (see FAQ/How-it-works pages): a missed lesson counts as delivered, Academic Support is offered instead.
- `action_log` — append-only audit trail, primarily for the two-administrator shift setup (§19 of the brief).
- `auth_sessions` — one row per signed-in session, storing only the SHA-256 of the bearer token, with an expiry. Logout, a password change and disabling an account all delete rows here.
- `password_resets` — single-use, time-limited reset codes.
- `parent_links` — the only thing that lets a parent see a student. No link, no access.
- `groups` / `group_members` — a teacher's groups; homework can target a group or one student.
- `homework` / `homework_submissions` — one submission per student per task; re-submitting clears the previous grade.
- `attendance` — `status` is `present` or `missed` and nothing else, unique per student per date. Both values consume a lesson.
- `payments` — money in, with `created_by` so the office can see who recorded it.
- `teacher_rates` — `per_lesson` and `tax_percent`. Only the net figure is ever returned.

## Business rules the code enforces

- **No lesson rescheduling**, for group or individual formats. A missed lesson is considered held: marking attendance consumes one lesson from the package whichever status is chosen. There is no reschedule endpoint, and `/cabinet/schedule` returns `reschedule_allowed: false` so the UI says so out loud.
- **No automatic freeze.** Freezing is not available for remaining balances under 6 lessons; there is deliberately no self-serve freeze button. Do not add one without re-confirming this rule with the client.
- **Contract (12 months) ≠ package (12 lessons).** Stored in two tables and returned as two fields (`contract.term_months`, `package.package_size`); the cabinet shows them apart and repeats the distinction in words.
- Teacher-facing financial figures show the amount **after tax withholding**. With no rate on file the API returns `configured: false` and the cabinet says the rate is missing, rather than showing a zero that reads like "you earned nothing".
- Passwords are bcrypt-hashed, sessions expire after 12 hours, logout deletes the session row, and a password change or reset invalidates every other session for that account.
- One user can never read another user's private data. The subject of every student/parent query comes from the session — a parent must be linked through `parent_links`, a teacher must actually teach the student (`teachesStudent`), and staff-only routes check the role. Correcting an already-marked lesson must not charge the student twice.
- Only an `owner` may create or modify `admin` and `owner` accounts.

## Explicitly out of scope

Offline classes, lesson transfers/reschedules, recalculations/refund logic beyond what's listed above — the client's brief explicitly excludes these; do not add them "while we're in there."

## Known gaps

- **Password recovery cannot email anyone.** No mail provider is configured, so `POST /auth/password/forgot` mints a code and writes it to the server log; the office passes it on, or resets the password directly from the people tab. Wire an SMTP provider before relying on self-serve recovery.
- **One lesson per student per day.** `attendance` is unique on `(student_id, lesson_date)`, which is what stops a correction from charging twice. A student sitting two lessons on one date would need that constraint reconsidered.
- **The old `/admin` panel still exists** with its single shared password, and still owns the public catalogue (courses, prices, teachers, reviews). The cabinets do not replace it; folding it into the owner cabinet is a separate piece of work.
