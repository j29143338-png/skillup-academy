// REACT_APP_API_URL = "/.netlify/functions/api"  (production, set in netlify.toml)
// REACT_APP_API_URL = "http://localhost:8000"     (local dev fallback)
const BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';
const isLocal = BASE.includes('localhost');

// Production: BASE + /courses  → /.netlify/functions/api/courses
// Local dev:  BASE + /api/courses → http://localhost:8000/api/courses
const r = (path) => `${BASE}${isLocal ? '/api' : ''}${path}`;

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

export const getCourses        = () => get('/courses');
export const getCourse         = (id) => get(`/courses/${id}`);
export const getTeachers       = () => get('/teachers');
export const getTestimonials   = () => get('/testimonials');
export const getPrices         = () => get('/prices');
export const getFeedbacks      = () => get('/feedbacks');
export const getResults        = () => get('/results');
export const submitApplication = (data) => post('/apply', data);
export const submitFeedback    = (data) => post('/feedbacks', data);
