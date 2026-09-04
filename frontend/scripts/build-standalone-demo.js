/**
 * Packs the demo into one self-contained HTML file.
 *
 * The published demo has no server behind it: no API, no /demo-data requests,
 * no external images. So the snapshot is inlined as a global, the teacher
 * avatars are fetched once and embedded as data URIs, and the CSS and JS are
 * folded into the page. Only the Google Fonts link stays remote — Syne and
 * DM Sans carry the site's identity and dropping them would silently fall back
 * to system faces.
 *
 * Usage:
 *   cd frontend
 *   npm run build:demo            # builds, then writes standalone-demo.html
 *
 * It runs the CRA build itself with REACT_APP_STANDALONE=1, which switches the
 * router to hashes — a path like /courses would 404 on reload otherwise. Doing
 * it here rather than in the npm script keeps it working on Windows, where a
 * `VAR=1 command` prefix is not valid shell.
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const BUILD = path.join(ROOT, "build");
const DEMO = path.join(ROOT, "public", "demo-data");
const OUT = path.join(ROOT, "standalone-demo.html");

const COLLECTIONS = ["courses", "teachers", "prices", "testimonials", "results", "feedbacks"];

const FONTS =
  "https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800" +
  "&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap";

function buildApp() {
  console.log("Building with REACT_APP_STANDALONE=1 …");
  execFileSync("npx", ["react-scripts", "build"], {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, REACT_APP_STANDALONE: "1", CI: "true" },
  });
}

function readMainAsset(kind) {
  const dir = path.join(BUILD, "static", kind);
  if (!fs.existsSync(dir)) {
    throw new Error(`No build found at ${BUILD}.`);
  }
  const ext = kind === "js" ? ".js" : ".css";
  const file = fs.readdirSync(dir).find((n) => n.startsWith("main") && n.endsWith(ext));
  if (!file) throw new Error(`No main${ext} in ${dir}`);
  return fs.readFileSync(path.join(dir, file), "utf8");
}

// Avatars come from api.dicebear.com, which the published page cannot reach.
// Fetch each one now and carry it in the page as a data URI.
async function embedAvatar(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  const svg = await res.text();
  return "data:image/svg+xml;base64," + Buffer.from(svg, "utf8").toString("base64");
}

async function main() {
  buildApp();

  const data = {};
  for (const name of COLLECTIONS) {
    data[name] = JSON.parse(fs.readFileSync(path.join(DEMO, `${name}.json`), "utf8"));
  }

  data.teachers = await Promise.all(
    data.teachers.map(async (t) =>
      t.photo && t.photo.startsWith("http") ? { ...t, photo: await embedAvatar(t.photo) } : t
    )
  );

  const css = readMainAsset("css");
  const js = readMainAsset("js");

  // The bundle is written last and must not contain a literal </script>, which
  // would close the tag early. CRA does not emit one, but check rather than hope.
  if (js.includes("</script>")) {
    throw new Error("Bundle contains a literal </script> — it would break the page.");
  }

  const html = `<title>SkillUp Academy</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${FONTS}" rel="stylesheet">
<script>
  // Stamp the saved language before paint, so Chrome does not read the page as
  // English and machine-translate it. Same guard the deployed site uses.
  try {
    var l = localStorage.getItem('skillup_lang');
    if (l === 'en' || l === 'ru' || l === 'uz') document.documentElement.lang = l;
  } catch (e) { /* private windows throw on storage access */ }
<\/script>
<style>
${css}
</style>
<div id="root"></div>
<script>
window.__SKILLUP_DEMO_DATA__ = ${JSON.stringify(data)};
<\/script>
<script>
${js}
<\/script>
`;

  fs.writeFileSync(OUT, html);

  console.log(`Wrote ${path.relative(ROOT, OUT)}`);
  console.log(`  ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  ${data.courses.length} courses, ${data.teachers.length} teachers, ${data.prices.length} price rows`);
  console.log(`  avatars embedded: ${data.teachers.every((t) => t.photo.startsWith("data:"))}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
