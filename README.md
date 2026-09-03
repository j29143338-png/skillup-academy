# SkillUp Academy — Deployment Guide (Render + Netlify)

Your site has two parts that deploy **separately**:

- **Backend** (the API + database) → deploys to **Render**
- **Frontend** (the website you see) → deploys to **Netlify**

This guide walks through both, start to finish, assuming you've never done this before.

---

## Part 1 & 2 — Deploy the backend + database to Render (one step)

This project's `render.yaml` tells Render to create **both** the database and the API together, and wire them up automatically — you don't need to copy any connection string by hand.

> **Note:** Render's free PostgreSQL databases are automatically deleted after 30 days unless you upgrade to a paid plan. If you want a database that never expires and stays free forever, use Neon instead — see "Alternative: use Neon" below.

1. Push this project to a **GitHub repository** (if you haven't already):
   ```bash
   git init
   git add .
   git commit -m "SkillUp Academy backend + frontend"
   git remote add origin https://github.com/YOUR_USERNAME/skillup-academy.git
   git push -u origin main
   ```

2. Go to **https://render.com** → **Sign up** (free) → sign in with GitHub

3. Click **New +** → **Blueprint**
   - Connect your GitHub repo (`skillup-academy`)
   - Render reads `render.yaml` and shows you **two things** it's about to create:
     - `skillup-academy-db` (a free PostgreSQL database)
     - `skillup-academy-api` (your backend web service)
   - Click **Apply**

4. Render asks for the remaining environment variables (the database one fills in automatically). Enter:

   | Key | Value |
   |-----|-------|
   | `ADMIN_USERNAME` | pick your own admin username |
   | `ADMIN_PASSWORD_HASH` | a **bcrypt hash** of your admin password — see "Generating an admin password hash" below. Do not put a plaintext password here. |
   | `ALLOWED_ORIGIN` | your Netlify site URL, e.g. `https://your-site-name.netlify.app` (comma-separate if you have more than one) |

5. Click **Create Web Service** (or **Apply**). Render provisions the database, then builds and deploys the API — this takes 2-4 minutes total.

### Generating an admin password hash

Never put a real password in this repo or in Render's plaintext fields. Instead, generate a bcrypt hash once, locally, and paste **only the hash** into Render's `ADMIN_PASSWORD_HASH` variable:

```bash
cd backend
npm install
node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 10))" "your-real-password-here"
```

This prints a string starting with `$2a$...` — copy that whole string into `ADMIN_PASSWORD_HASH` on Render. Nobody who reads this repo or your Render dashboard afterward can recover your actual password from that hash.

If `ADMIN_PASSWORD_HASH` is not set, the server falls back to comparing the plaintext `ADMIN_PASSWORD` variable directly (useful for quick local testing only) and prints a warning on startup. Don't rely on this fallback in production.

### Alternative: use Neon instead (free forever, no 30-day expiry)

If you'd rather not worry about the database expiring:
1. Go to **https://neon.tech** → sign up free → **Create a project** → copy the **Connection string**
2. In `render.yaml`, delete the `databases:` section at the top and change the `DATABASE_URL` entry back to:
   ```yaml
   - key: DATABASE_URL
     sync: false
   ```
3. In Render, when it asks for `DATABASE_URL`, paste your Neon connection string instead

6. Once deployed, you'll see a URL like:
   ```
   https://skillup-academy-api.onrender.com
   ```
   **Copy this URL** — you need it in Part 3.

7. **Test it works** — open this URL in your browser:
   ```
   https://skillup-academy-api.onrender.com/
   ```
   You should see:
   ```json
   {"status":"OK","storage":"PostgreSQL (persistent)"}
   ```
   If it says `"local file (NOT persistent)"` instead, it means `DATABASE_URL` wasn't set correctly — go to **Environment** tab on Render and check it.

---

## Part 3 — Connect the frontend to your backend

1. Open `netlify.toml` in your project (the file at the root, not inside `frontend/`)

2. Find this line:
   ```toml
   REACT_APP_API_URL = "https://skillup-academy-api.onrender.com"
   ```

3. Replace it with **your actual Render URL** from Part 2, Step 6.

4. Commit and push this change:
   ```bash
   git add netlify.toml
   git commit -m "Point frontend to Render backend"
   git push
   ```

---

## Part 4 — Deploy the frontend to Netlify

1. Go to **https://app.netlify.com** → **Add new site → Import an existing project**
2. Choose **GitHub** → select your `skillup-academy` repository
3. Netlify reads `netlify.toml` automatically — no manual configuration needed
4. Click **Deploy site**
5. Wait ~2 minutes — your site goes live at `https://your-site-name.netlify.app`

---

## Part 5 — Test everything works

1. Visit your Netlify site → check courses, teachers, and prices load correctly
2. Go to `/admin` on your site → log in with the `ADMIN_USERNAME` / password you set in Part 2, Step 4
3. Edit a price → save → **refresh the page** → the change should still be there ✅
4. If it reverts, double check `DATABASE_URL` is set correctly on Render (see Part 2, Step 7)

---

## ⚠️ Important: Free tier "cold start" delay

Render's **free plan** puts your backend to sleep after 15 minutes of no traffic. When someone visits your site after it's been asleep, the **first request takes 30-60 seconds** to wake up (then it's fast again).

### How to prevent this (optional but recommended)

Use a free "uptime monitor" to ping your backend every few minutes, keeping it awake:

1. Go to **https://uptimerobot.com** → sign up free
2. Click **Add New Monitor**
   - Monitor Type: **HTTP(s)**
   - Friendly Name: `SkillUp API`
   - URL: `https://skillup-academy-api.onrender.com/` (your Render URL)
   - Monitoring Interval: **5 minutes**
3. Click **Create Monitor**

Now UptimeRobot will "ping" your backend every 5 minutes, so it never falls asleep, and your visitors never experience the slow first-load delay.

---

## File structure reference

```
skillup-academy/
├── netlify.toml              ← Netlify config (points to your Render URL)
├── render.yaml                ← Render deployment blueprint
├── backend/
│   ├── server.js              ← Express API (all routes + Postgres/local storage)
│   ├── package.json
│   └── data.json              ← auto-created ONLY in local dev (not used on Render)
└── frontend/
    ├── src/                    ← React app (unchanged)
    └── package.json
```

---

## Local development (optional)

To run the backend locally without a database (uses a local `data.json` file instead):

```bash
cd backend
npm install
npm start
```

Visit `http://localhost:8000/` — you should see:
```json
{"status":"OK","storage":"local file (NOT persistent)"}
```

Then run the frontend in a separate terminal:
```bash
cd frontend
npm install
npm start
```

Visit `http://localhost:3000`

### Sharing one database between machines

By default a local backend keeps its own `backend/data.json`, so applications
and feedbacks entered on one computer never appear on the other. Point both at
the live PostgreSQL instance to work against the same data:

1. Render dashboard → `skillup-academy-db` → **Connections** → copy the
   **External Database URL**. The internal URL only resolves inside Render's
   network and times out from home.
2. `cd backend && cp .env.example .env`
3. Put the string in `.env` as `DATABASE_URL=...`

`backend/.env` is gitignored, so the credentials stay on the machine. Restart
the backend and the startup line should read:

```
Storage mode: PostgreSQL (persistent)
```

Anything else means the variable was not picked up and you are still on the
local file.

> ⚠️ **This is the live database.** A local server pointed at it reads and
> writes the same rows the public site uses. Applications sent by real visitors
> are in there, and anything you change locally — including through the admin
> panel — is immediately live. For experiments, leave `DATABASE_URL` unset and
> stay on the local file, or create a second free database on Render and point
> `.env` at that instead.

### Working across two computers

The catalogue — courses, teachers, prices, testimonials — lives in `seedData()`
in `backend/server.js`, and that is the only copy tracked in git. Each machine
keeps its own `backend/data.json` (gitignored), and production keeps its own row
in PostgreSQL.

Those stored copies used to win forever: whatever the catalogue looked like the
first time an environment started, it kept serving, even after the code changed.
A second computer would pull new code and still show the old courses.

`SEED_VERSION` in `backend/server.js` fixes that. The stored data carries the
version it was written with, and any environment that is behind refreshes the
catalogue on the next request and logs `Catalogue refreshed to seed version N`.
Applications, feedbacks and results are never touched by a refresh.

**When you change the catalogue in `seedData()`, bump `SEED_VERSION`.** Without
the bump the change reaches nobody who already has data — not the other
computer, not the live site.

So the routine on the second computer stays just:

```bash
git pull
cd backend && npm start
```

The catalogue catches up by itself on the first request.
