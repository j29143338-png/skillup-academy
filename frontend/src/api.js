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

// ── Cabinets ────────────────────────────────────────────────────────────────
// The bearer token lives in localStorage rather than a cookie: the site and the
// API sit on different origins (Netlify / Render), which a cookie would need
// SameSite=None to cross. It is cleared on logout and whenever the server says
// the session is gone.
const TOKEN_KEY = 'skillup_token';

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
const setToken = (t) => {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* private window */ }
};

// Thrown so callers can show the server's own message instead of "Failed to
// fetch". `status` lets the auth context tell an expired session from a typo.
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function authRequest(path, { method = 'GET', body } = {}) {
  const token = getToken();
  const res = await fetch(r(path), {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    // A dead or expired token should not keep being sent on every later call.
    if (res.status === 401) setToken(null);
    throw new ApiError(payload.detail || res.statusText, res.status);
  }
  return payload;
}

const authGet = (path) => authRequest(path);
const authPost = (path, body) => authRequest(path, { method: 'POST', body });
const authPatch = (path, body) => authRequest(path, { method: 'PATCH', body });
const authDelete = (path) => authRequest(path, { method: 'DELETE' });

export const login = async (email, password) => {
  const data = await authRequest('/auth/login', { method: 'POST', body: { email, password } });
  setToken(data.token);
  return data.user;
};

export const logout = async () => {
  try { await authPost('/auth/logout'); } finally { setToken(null); }
};

export const fetchMe = () => authGet('/auth/me');
export const changePassword = (current_password, new_password) =>
  authPost('/auth/password/change', { current_password, new_password });
export const forgotPassword = (email) => authPost('/auth/password/forgot', { email });
export const resetPassword = (token, password) => authPost('/auth/password/reset', { token, password });

// Student and parent. `studentId` is only meaningful for a parent with more
// than one child; the server ignores it for a student.
const withChild = (path, studentId) =>
  studentId ? `${path}${path.includes('?') ? '&' : '?'}student_id=${studentId}` : path;

export const getOverview   = (id) => authGet(withChild('/cabinet/overview', id));
export const getSchedule   = (id) => authGet(withChild('/cabinet/schedule', id));
export const getHomework   = (id) => authGet(withChild('/cabinet/homework', id));
export const getAttendance = (id) => authGet(withChild('/cabinet/attendance', id));
export const getPayments   = (id) => authGet(withChild('/cabinet/payments', id));
export const submitHomework = (homeworkId, text) => authPost(`/cabinet/homework/${homeworkId}/submit`, { text });

// Teacher
export const getTeacherSchedule = () => authGet('/cabinet/teacher/schedule');
export const getTeacherGroups   = () => authGet('/cabinet/teacher/groups');
export const getTeacherStudents = () => authGet('/cabinet/teacher/students');
export const getTeacherHomework = () => authGet('/cabinet/teacher/homework');
export const getTeacherFinance  = () => authGet('/cabinet/teacher/finance');
export const createHomework = (data) => authPost('/cabinet/teacher/homework', data);
export const gradeHomework  = (id, data) => authPost(`/cabinet/teacher/homework/${id}/grade`, data);
export const markAttendance = (data) => authPost('/cabinet/teacher/attendance', data);

// Admin and owner
// active: '1' still here, '0' gone, undefined for everyone.
export const getStaffUsers = (role, active) => {
  const query = [
    role ? `role=${role}` : null,
    active ? `active=${active}` : null,
  ].filter(Boolean).join('&');
  return authGet(query ? `/cabinet/staff/users?${query}` : '/cabinet/staff/users');
};
export const createStaffUser = (data) => authPost('/cabinet/staff/users', data);
export const updateStaffUser = (id, data) => authPatch(`/cabinet/staff/users/${id}`, data);
export const setUserPassword = (id, password) => authPost(`/cabinet/staff/users/${id}/password`, { password });
export const getStaffStudent = (id) => authGet(`/cabinet/staff/students/${id}`);
export const createContract  = (data) => authPost('/cabinet/staff/contracts', data);
export const createPackage   = (data) => authPost('/cabinet/staff/packages', data);
export const createSlot      = (data) => authPost('/cabinet/staff/schedule', data);
export const deleteSlot      = (id) => authDelete(`/cabinet/staff/schedule/${id}`);
export const createPayment   = (data) => authPost('/cabinet/staff/payments', data);
export const createGroup     = (data) => authPost('/cabinet/staff/groups', data);
export const addGroupMember  = (groupId, student_id) => authPost(`/cabinet/staff/groups/${groupId}/members`, { student_id });
// One lesson slot for every active member of a group, in a single request.
export const scheduleGroup   = (groupId, data) => authPost(`/cabinet/staff/groups/${groupId}/schedule`, data);
export const linkParent      = (data) => authPost('/cabinet/staff/parent-links', data);
export const setTeacherRate  = (data) => authPost('/cabinet/staff/teacher-rate', data);
// Applications live with the public catalogue rather than in the cabinet
// tables, so they sit behind /admin — which now accepts the same session.
export const getApplications = () => authGet('/admin/applications');
export const setApplicationStatus = (id, status, note) =>
  authRequest(`/admin/applications/${id}`, { method: 'PATCH', body: { status, note } });

export const getActionLog    = () => authGet('/cabinet/staff/log');
export const getAnalytics    = () => authGet('/cabinet/staff/analytics');

// Office: the rest of what the staff cabinet drives. Every day-to-day action
// has a matching call here, so enrolling a student, taking a payment or fixing
// a mistake never needs anyone to touch the code.
export const getStaffGroups   = () => authGet('/cabinet/staff/groups');
export const deleteGroup      = (id) => authDelete(`/cabinet/staff/groups/${id}`);
export const removeGroupMember = (groupId, studentId) =>
  authDelete(`/cabinet/staff/groups/${groupId}/members/${studentId}`);
export const getTeacherRates  = () => authGet('/cabinet/staff/teacher-rates');
export const unlinkParent     = (parentId, studentId) =>
  authDelete(`/cabinet/staff/parent-links/${parentId}/${studentId}`);
export const deletePayment    = (id) => authDelete(`/cabinet/staff/payments/${id}`);
export const deletePackage    = (id) => authDelete(`/cabinet/staff/lesson_packages/${id}`);
export const deleteContract   = (id) => authDelete(`/cabinet/staff/contracts/${id}`);
export const deleteAttendance = (id) => authDelete(`/cabinet/staff/attendance/${id}`);

// The journal: attendance, homework and remarks about one student. Read by
// their teacher, their parent and the office — never by the student, which the
// server enforces rather than the menu.
export const getJournal   = (studentId) =>
  authGet(studentId ? `/cabinet/journal?student_id=${studentId}` : '/cabinet/journal');
export const addNote      = (student_id, text) => authPost('/cabinet/journal/notes', { student_id, text });
export const deleteNote   = (id) => authDelete(`/cabinet/journal/notes/${id}`);

// The public teacher profiles that the site shows. They are catalogue entries,
// not accounts — linking one to a cabinet user is what connects the face on
// the website to the person who marks attendance.
export const updateCatalogueTeacher = (id, data) =>
  authRequest(`/admin/teachers/${id}`, { method: 'PUT', body: data });
