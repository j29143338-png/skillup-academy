# SkillUp Academy — future role architecture (roadmap)

This document captures the data model and rules for the personal dashboards
(student / parent / teacher / administrator / owner) planned as the next
development stage. **None of this is wired up to the site yet** — the tables
below already exist in Postgres (created automatically at server startup by
`ensureFutureTables()` in `server.js`), but no route, login page, or UI reads
or writes them. This file exists so the next stage of work follows the same
rules the client already specified, instead of re-deriving them from scratch.

## Roles

| Role         | Who                                  | Notes |
|--------------|---------------------------------------|-------|
| `student`    | Enrolled learner                      | Sees own schedule, homework, progress, Academic Support, payments |
| `parent`     | Student's parent/guardian             | Same visibility as their child, read-mostly |
| `teacher`    | Instructor                            | Sees own schedule, own groups/students, attendance, homework, comments, Academic Support, own financial info (net of tax withholding, once that system exists) |
| `admin`      | Front-desk administrator (×2, shifts) | Same duties as each other; system must log which admin performed which action (`action_log.user_id`) |
| `owner`      | Business owner                        | Sees everything: students, applications, teachers, admins, schedule, payments, contracts, analytics |

Each user logs in with **their own** email/login + password. No shared logins.

## Data model (already created, unused so far)

- `users` — one row per person, `role` constrained to the 5 values above, `created_by` tracks which admin/owner created the account.
- `contracts` — contract term is **12 months**, tracked separately from lesson packages (see below).
- `lesson_packages` — the **paid package is 12 lessons**, tracked separately from the contract. A contract can span multiple packages over its 12 months. Never conflate `contracts.contract_end` with "lessons remaining."
- `schedule_slots` — days/time are fixed once the student enrolls. **No reschedule flow** — this matches the public-facing rule (see FAQ/How-it-works pages): a missed lesson counts as delivered, Academic Support is offered instead.
- `action_log` — append-only audit trail, primarily for the two-administrator shift setup (§19 of the brief).

## Business rules to preserve when building the real dashboards

- **No lesson rescheduling**, for group or individual formats. A missed lesson is considered held.
- **No automatic freeze.** Freezing is not available for remaining balances under 6 lessons; do not build a generic self-serve freeze button without re-confirming this rule with the client first.
- **Contract (12 months) ≠ package (12 lessons).** These must always be stored and displayed as two separate numbers.
- Teacher-facing financial figures must show the amount **after tax withholding**, once that is legally/technically implemented — do not show gross figures as if they were net.
- Passwords must be hashed (bcrypt, same approach as the current admin login in `server.js`), sessions/tokens must expire, and logout + password-recovery flows are required before this goes live for real users.
- One user must never be able to read another user's private data (contracts, payments, homework) — every future query must scope by `user_id`/role, not just by "is logged in."

## Explicitly out of scope until this stage is greenlit

Offline classes, lesson transfers/reschedules, recalculations/refund logic beyond what's listed above — the client's brief explicitly excludes these; do not add them "while we're in there."
