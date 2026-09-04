// REACT_APP_API_URL = "https://<render-service>.onrender.com"  (production, set in netlify.toml)
// REACT_APP_API_URL = "http://localhost:8000"                  (local dev fallback)
const BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';
const isLocal = BASE.includes('localhost');

// Production: BASE + /courses  → https://<service>/courses
// Local dev:  BASE + /api/courses → http://localhost:8000/api/courses
const r = (path) => `${BASE}${isLocal ? '/api' : ''}${path}`;

// ── Demo mode ───────────────────────────────────────────────────────────────
// A preview build has to be reviewable without the live backend, so `?demo=1`
// serves the static snapshot in public/demo-data instead. It is opt-in, sticks
// for the tab only, and `?demo=0` turns it off — a normal visitor never gets it.
const DEMO_KEY = 'skillup_demo';

function readDemoFlag() {
  if (typeof window === 'undefined') return false;
  try {
    const q = new URLSearchParams(window.location.search).get('demo');
    if (q === '1') sessionStorage.setItem(DEMO_KEY, '1');
    if (q === '0') sessionStorage.removeItem(DEMO_KEY);
    return sessionStorage.getItem(DEMO_KEY) === '1';
  } catch {
    // Private windows and blocked site data throw on storage access.
    return new URLSearchParams(window.location.search).get('demo') === '1';
  }
}

export const isDemo = () => Boolean(inlinedDemo()) || readDemoFlag();

// The standalone demo build has no server to fetch from — the whole snapshot is
// inlined into the page as `window.__SKILLUP_DEMO_DATA__`. When that is present
// it is the source, and demo mode is always on: there is no backend to fall
// back to. Everywhere else this is undefined and nothing changes.
const inlinedDemo = () =>
  (typeof window !== 'undefined' && window.__SKILLUP_DEMO_DATA__) || null;

const demoFile = (name) => {
  const inlined = inlinedDemo();
  if (inlined) return Promise.resolve(inlined[name] ?? []);
  return fetch(`/demo-data/${name}.json`).then((res) => {
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  });
};

async function get(path) {
  const res = await fetch(r(path));
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}
async function post(path, body) {
  const res = await fetch(r(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

export const getCourses      = () => (isDemo() ? demoFile('courses') : get('/courses'));
export const getTeachers     = () => (isDemo() ? demoFile('teachers') : get('/teachers'));
export const getTestimonials = () => (isDemo() ? demoFile('testimonials') : get('/testimonials'));
export const getPrices       = () => (isDemo() ? demoFile('prices') : get('/prices'));
export const getFeedbacks    = () => (isDemo() ? demoFile('feedbacks') : get('/feedbacks'));
export const getResults      = () => (isDemo() ? demoFile('results') : get('/results'));

export const getCourse = async (id) => {
  if (!isDemo()) return get(`/courses/${id}`);
  // The live endpoint merges in the course's teachers; do the same here.
  const [courses, teachers] = await Promise.all([demoFile('courses'), demoFile('teachers')]);
  const course = courses.find((c) => String(c.id) === String(id));
  if (!course) throw new Error('Not found');
  return { ...course, teachers: teachers.filter((t) => (course.teacher_ids || []).includes(t.id)) };
};

// Nothing is submitted in demo mode — there is no backend behind it to store it.
export const submitApplication = (data) => (isDemo() ? Promise.resolve({ success: true }) : post('/apply', data));
export const submitFeedback    = (data) => (isDemo() ? Promise.resolve({ success: true }) : post('/feedbacks', data));
