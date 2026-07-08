import React, { useState, useEffect, useCallback } from 'react';
import { useLang } from '../context/LangContext';
import './Admin.css';

const BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';
const isLocal = BASE.includes('localhost');
const r = (path) => `${BASE}${isLocal ? '/api' : ''}${path}`;

// Send credentials as Basic Auth header on EVERY admin request
// This works regardless of serverless cold starts — no session state needed
async function apiCall(path, method = 'GET', body = null, creds = null) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (creds) {
      const encoded = btoa(`${creds.username}:${creds.password}`);
      headers['Authorization'] = `Basic ${encoded}`;
    }
    const res = await fetch(r(path), {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    console.error('apiCall error', path, e.message);
    return { ok: false, status: 0, data: { detail: e.message } };
  }
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginPage({ onLogin, t }) {
  const [creds, setCreds] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    const { ok, data } = await apiCall('/admin/login', 'POST', creds);
    if (ok) {
      // Store plaintext credentials in sessionStorage
      // They are sent as Basic Auth on every subsequent request
      sessionStorage.setItem('admin_creds', JSON.stringify(creds));
      onLogin(creds);
    } else {
      setError(data.detail || t('login_error'));
    }
    setLoading(false);
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <svg viewBox="0 0 40 40" fill="none" width="48" height="48">
            <path d="M8 30L20 8L32 30" stroke="#F5820A" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M12 22H28" stroke="#F5820A" strokeWidth="4" strokeLinecap="round"/>
          </svg>
          <span>SkillUp Academy</span>
        </div>
        <h2>{t('login_title')}</h2>
        <p>{t('login_subtitle')}</p>
        <form onSubmit={handleLogin} className="login-form">
          <div className="form-group">
            <label>{t('username')}</label>
            <input type="text" value={creds.username} onChange={e => setCreds({ ...creds, username: e.target.value })} autoComplete="username" />
          </div>
          <div className="form-group">
            <label>{t('password')}</label>
            <input type="password" value={creds.password} onChange={e => setCreds({ ...creds, password: e.target.value })} autoComplete="current-password" />
          </div>
          {error && <div className="form-error">{error}</div>}
          <button type="submit" className="btn-primary full-width" disabled={loading}>
            {loading ? 'Logging in...' : t('login_btn')}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── COURSE FORM ──────────────────────────────────────────────────────────────
function CourseForm({ course, onSave, onCancel, creds, t }) {
  const [form, setForm] = useState(course || { category:'English', icon:'📚', title:'', description:'', program:[], formats:[], duration:'', levels:'', price_individual:'1,600,000 – 4,000,000 UZS/month', note:'' });
  const [prog, setProg] = useState((form.program||[]).join('\n'));
  const [fmt, setFmt]   = useState((form.formats||[]).join('\n'));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setSaving(true); setErr('');
    const body = { ...form, program: prog.split('\n').filter(Boolean), formats: fmt.split('\n').filter(Boolean) };
    const path = course?.id ? `/admin/courses/${course.id}` : '/admin/courses';
    const { ok, data } = await apiCall(path, course?.id ? 'PUT' : 'POST', body, creds);
    if (ok) onSave(); else setErr(data.detail || 'Error saving');
    setSaving(false);
  };

  return (
    <div className="crud-form">
      <h3>{course?.id ? 'Edit Course' : 'Add New Course'}</h3>
      <div className="form-grid">
        <div className="form-group"><label>Icon</label><input value={form.icon} onChange={e => setForm({...form,icon:e.target.value})} /></div>
        <div className="form-group"><label>Category</label>
          <select value={form.category} onChange={e => setForm({...form,category:e.target.value})}>
            {['English','Math','Russian','Uzbek','German','Spanish'].map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group span2"><label>Title</label><input value={form.title} onChange={e => setForm({...form,title:e.target.value})} /></div>
        <div className="form-group span2"><label>Description</label><textarea rows={3} value={form.description} onChange={e => setForm({...form,description:e.target.value})} /></div>
        <div className="form-group"><label>Duration</label><input value={form.duration} onChange={e => setForm({...form,duration:e.target.value})} placeholder="e.g. 3–6 months" /></div>
        <div className="form-group"><label>Levels</label><input value={form.levels} onChange={e => setForm({...form,levels:e.target.value})} placeholder="e.g. A1 – C2" /></div>
        <div className="form-group"><label>Price (Individual)</label><input value={form.price_individual} onChange={e => setForm({...form,price_individual:e.target.value})} /></div>
        <div className="form-group"><label>Note</label><input value={form.note||''} onChange={e => setForm({...form,note:e.target.value})} /></div>
        <div className="form-group span2"><label>Program (one per line)</label><textarea rows={5} value={prog} onChange={e => setProg(e.target.value)} /></div>
        <div className="form-group span2"><label>Formats (one per line)</label><textarea rows={3} value={fmt} onChange={e => setFmt(e.target.value)} /></div>
      </div>
      {err && <div className="form-error" style={{marginBottom:12}}>{err}</div>}
      <div className="form-actions">
        <button className="btn-primary" onClick={save} disabled={saving}>{saving?'Saving...':t('save')}</button>
        <button className="btn-cancel-admin" onClick={onCancel}>{t('cancel')}</button>
      </div>
    </div>
  );
}

// ─── TEACHER FORM ─────────────────────────────────────────────────────────────
function TeacherForm({ teacher, onSave, onCancel, creds, t }) {
  const [form, setForm] = useState(teacher || { name:'', subject:'', experience:'', photo:'', short_bio:'', full_bio:'', education:'', certifications:[], achievements:[] });
  const [crt, setCrt] = useState((form.certifications||[]).join('\n'));
  const [ach, setAch] = useState((form.achievements||[]).join('\n'));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setSaving(true); setErr('');
    const body = { ...form, certifications: crt.split('\n').filter(Boolean), achievements: ach.split('\n').filter(Boolean) };
    const path = teacher?.id ? `/admin/teachers/${teacher.id}` : '/admin/teachers';
    const { ok, data } = await apiCall(path, teacher?.id ? 'PUT' : 'POST', body, creds);
    if (ok) onSave(); else setErr(data.detail || 'Error saving');
    setSaving(false);
  };

  return (
    <div className="crud-form">
      <h3>{teacher?.id ? 'Edit Teacher' : 'Add New Teacher'}</h3>
      <div className="form-grid">
        <div className="form-group"><label>Name</label><input value={form.name} onChange={e => setForm({...form,name:e.target.value})} /></div>
        <div className="form-group"><label>Subject</label><input value={form.subject} onChange={e => setForm({...form,subject:e.target.value})} /></div>
        <div className="form-group"><label>Experience</label><input value={form.experience} onChange={e => setForm({...form,experience:e.target.value})} placeholder="e.g. 5 years" /></div>
        <div className="form-group"><label>Photo URL</label><input value={form.photo||''} onChange={e => setForm({...form,photo:e.target.value})} placeholder="https://..." /></div>
        <div className="form-group span2"><label>Education</label><input value={form.education} onChange={e => setForm({...form,education:e.target.value})} /></div>
        <div className="form-group span2"><label>Short Bio</label><textarea rows={2} value={form.short_bio} onChange={e => setForm({...form,short_bio:e.target.value})} /></div>
        <div className="form-group span2"><label>Full Bio</label><textarea rows={4} value={form.full_bio} onChange={e => setForm({...form,full_bio:e.target.value})} /></div>
        <div className="form-group span2"><label>Certifications (one per line)</label><textarea rows={3} value={crt} onChange={e => setCrt(e.target.value)} /></div>
        <div className="form-group span2"><label>Achievements (one per line)</label><textarea rows={3} value={ach} onChange={e => setAch(e.target.value)} /></div>
      </div>
      {err && <div className="form-error" style={{marginBottom:12}}>{err}</div>}
      <div className="form-actions">
        <button className="btn-primary" onClick={save} disabled={saving}>{saving?'Saving...':t('save')}</button>
        <button className="btn-cancel-admin" onClick={onCancel}>{t('cancel')}</button>
      </div>
    </div>
  );
}

// ─── MAIN ADMIN ───────────────────────────────────────────────────────────────
export default function Admin() {
  const { t } = useLang();

  // Restore credentials from sessionStorage on page load
  const [creds, setCreds] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('admin_creds') || 'null'); } catch { return null; }
  });

  const [tab, setTab] = useState('applications');
  const [data, setData] = useState({ applications:[], prices:[], teachers:[], courses:[], feedbacks:[] });
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [editingPrice, setEditingPrice] = useState(null);
  const [editingCourse, setEditingCourse] = useState(null);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [showTeacherForm, setShowTeacherForm] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  const handleLogin  = (c) => setCreds(c);
  const handleLogout = () => { sessionStorage.removeItem('admin_creds'); setCreds(null); };

  const loadAll = useCallback(async () => {
    if (!creds) return;
    setLoading(true); setLoadError('');
    const [appsRes, pricesRes, teachersRes, coursesRes, fbRes] = await Promise.all([
      apiCall('/admin/applications', 'GET', null, creds),
      apiCall('/prices'),
      apiCall('/teachers'),
      apiCall('/courses'),
      apiCall('/admin/feedbacks', 'GET', null, creds),
    ]);
    // Only logout on explicit 401 — not network errors
    if (appsRes.status === 401) { handleLogout(); setLoading(false); return; }
    setData({
      applications: appsRes.ok   ? appsRes.data   : [],
      prices:       pricesRes.ok  ? pricesRes.data  : [],
      teachers:     teachersRes.ok? teachersRes.data: [],
      courses:      coursesRes.ok ? coursesRes.data : [],
      feedbacks:    fbRes.ok      ? fbRes.data      : [],
    });
    if (!appsRes.ok) setLoadError(`Error (${appsRes.status}): ${appsRes.data?.detail || 'Could not load data'}`);
    setLoading(false);
  }, [creds]);

  useEffect(() => { if (creds) loadAll(); }, [creds, loadAll]);

  const savePrice = async (price) => {
    const { ok } = await apiCall(`/admin/prices/${price.id}`, 'PUT', price, creds);
    if (ok) { setSaveStatus('saved'); setEditingPrice(null); loadAll(); setTimeout(()=>setSaveStatus(''),2000); }
  };
  const deleteCourse    = async (id) => { if (!window.confirm('Delete?')) return; await apiCall(`/admin/courses/${id}`, 'DELETE', null, creds); loadAll(); };
  const deleteTeacher   = async (id) => { if (!window.confirm('Delete?')) return; await apiCall(`/admin/teachers/${id}`, 'DELETE', null, creds); loadAll(); };
  const approveFeedback = async (id) => { await apiCall(`/admin/feedbacks/${id}/approve`, 'PUT', null, creds); loadAll(); };
  const deleteFeedback  = async (id) => { if (!window.confirm('Delete?')) return; await apiCall(`/admin/feedbacks/${id}`, 'DELETE', null, creds); loadAll(); };

  if (!creds) return <LoginPage onLogin={handleLogin} t={t} />;

  const tabs = [
    { id:'applications', label:t('tab_applications'), count:data.applications.length },
    { id:'courses',      label:t('tab_courses'),      count:data.courses.length },
    { id:'teachers',     label:t('tab_teachers'),     count:data.teachers.length },
    { id:'prices',       label:t('tab_prices'),       count:data.prices.length },
    { id:'feedbacks',    label:t('tab_feedbacks'),    count:data.feedbacks.length },
  ];

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div className="container admin-header-inner">
          <div><h1>{t('admin_title')}</h1><p>{t('admin_subtitle')}</p></div>
          <button className="logout-btn" onClick={handleLogout}>🚪 {t('logout')}</button>
        </div>
      </div>
      <div className="container admin-body">
        <div className="admin-tabs">
          {tabs.map(tab_ => (
            <button key={tab_.id} className={`admin-tab ${tab===tab_.id?'active':''}`} onClick={()=>setTab(tab_.id)}>
              {tab_.label} <span className="atab-count">{tab_.count}</span>
            </button>
          ))}
        </div>

        {loading ? <div className="admin-loading">Loading data...</div>
        : loadError ? (
          <div className="admin-content">
            <div className="form-error" style={{padding:20,borderRadius:12,marginBottom:16}}>⚠️ {loadError}</div>
            <button className="btn-primary" onClick={loadAll}>Retry</button>
          </div>
        ) : (
          <div className="admin-content">
            {saveStatus==='saved' && <div className="admin-success">✓ Saved!</div>}

            {tab==='applications' && (
              <div>
                <div className="section-header-admin"><h2>Student Applications</h2></div>
                {data.applications.length===0 ? <div className="admin-empty">{t('no_apps')}</div> : (
                  <div className="apps-list">
                    {[...data.applications].reverse().map(app => (
                      <div key={app.id} className="app-card">
                        <div className="app-card-header">
                          <div className="app-av">{app.name?.charAt(0)}</div>
                          <div><strong>{app.name}</strong><p>{app.course}</p></div>
                          <span className="app-status new">{app.status}</span>
                        </div>
                        <div className="app-details">
                          <div><span>📞</span> {app.phone}</div>
                          <div><span>📅</span> {new Date(app.date).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
                          {app.message && <div><span>💬</span> {app.message}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab==='courses' && (
              <div>
                <div className="section-header-admin">
                  <h2>Courses</h2>
                  <button className="btn-primary" onClick={()=>{setShowCourseForm(true);setEditingCourse(null);}}>{t('add_course')}</button>
                </div>
                {showCourseForm && !editingCourse && <CourseForm creds={creds} t={t} onSave={()=>{setShowCourseForm(false);loadAll();}} onCancel={()=>setShowCourseForm(false)} />}
                {editingCourse && <CourseForm course={editingCourse} creds={creds} t={t} onSave={()=>{setEditingCourse(null);loadAll();}} onCancel={()=>setEditingCourse(null)} />}
                <div className="crud-list">
                  {data.courses.map(c => (
                    <div key={c.id} className="crud-item">
                      <span className="crud-icon">{c.icon}</span>
                      <div className="crud-info"><strong>{c.title}</strong><span className="crud-meta">{c.category} · {c.levels}</span></div>
                      <div className="crud-actions">
                        <button className="crud-edit-btn" onClick={()=>{setEditingCourse(c);setShowCourseForm(false);}}>{t('edit')}</button>
                        <button className="crud-delete-btn" onClick={()=>deleteCourse(c.id)}>🗑</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab==='teachers' && (
              <div>
                <div className="section-header-admin">
                  <h2>Teachers</h2>
                  <button className="btn-primary" onClick={()=>{setShowTeacherForm(true);setEditingTeacher(null);}}>{t('add_teacher')}</button>
                </div>
                {showTeacherForm && !editingTeacher && <TeacherForm creds={creds} t={t} onSave={()=>{setShowTeacherForm(false);loadAll();}} onCancel={()=>setShowTeacherForm(false)} />}
                {editingTeacher && <TeacherForm teacher={editingTeacher} creds={creds} t={t} onSave={()=>{setEditingTeacher(null);loadAll();}} onCancel={()=>setEditingTeacher(null)} />}
                <div className="crud-list">
                  {data.teachers.map(tc => (
                    <div key={tc.id} className="crud-item">
                      <img src={tc.photo} alt={tc.name} className="crud-photo" />
                      <div className="crud-info"><strong>{tc.name}</strong><span className="crud-meta">{tc.subject}</span></div>
                      <div className="crud-actions">
                        <button className="crud-edit-btn" onClick={()=>{setEditingTeacher(tc);setShowTeacherForm(false);}}>{t('edit')}</button>
                        <button className="crud-delete-btn" onClick={()=>deleteTeacher(tc.id)}>🗑</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab==='prices' && (
              <div>
                <div className="section-header-admin"><h2>Prices</h2><p className="admin-hint">Click Edit to update</p></div>
                <div className="prices-admin-list">
                  {data.prices.map(price => (
                    <div key={price.id} className="price-admin-card">
                      {editingPrice?.id===price.id ? (
                        <div className="price-edit-form">
                          <h3>{price.course}</h3>
                          <div className="price-edit-grid">
                            {['group','mini_group','individual'].map(f => (
                              <div key={f} className="form-group">
                                <label>{f.replace('_',' ')}</label>
                                <input value={editingPrice[f]||''} onChange={e=>setEditingPrice({...editingPrice,[f]:e.target.value||null})} placeholder="e.g. 600,000 UZS/month" />
                              </div>
                            ))}
                          </div>
                          <div className="form-actions">
                            <button className="btn-primary" onClick={()=>savePrice(editingPrice)}>{t('save')}</button>
                            <button className="btn-cancel-admin" onClick={()=>setEditingPrice(null)}>{t('cancel')}</button>
                          </div>
                        </div>
                      ) : (
                        <div className="price-display">
                          <div className="price-course-name">{price.course}</div>
                          <div className="price-vals">
                            <div className="pv"><span>Group</span><strong>{price.group||'—'}</strong></div>
                            <div className="pv"><span>Mini-Group</span><strong>{price.mini_group||'—'}</strong></div>
                            <div className="pv"><span>Individual</span><strong>{price.individual||'—'}</strong></div>
                          </div>
                          <button className="crud-edit-btn" onClick={()=>setEditingPrice({...price})}>{t('edit')}</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab==='feedbacks' && (
              <div>
                <div className="section-header-admin"><h2>Reviews</h2></div>
                {data.feedbacks.length===0 ? <div className="admin-empty">No reviews yet.</div> : (
                  <div className="feedbacks-list">
                    {[...data.feedbacks].reverse().map(fb => (
                      <div key={fb.id} className={`fb-admin-card ${fb.approved?'approved':''}`}>
                        <div className="fb-admin-header">
                          <div className="app-av">{fb.name?.charAt(0)}</div>
                          <div><strong>{fb.name}</strong><p>{fb.course} · {'★'.repeat(fb.rating)}</p></div>
                          <span className={`app-status ${fb.approved?'approved':'new'}`}>{fb.approved?t('approved'):t('pending')}</span>
                        </div>
                        <p className="fb-text">"{fb.text}"</p>
                        <div className="fb-actions">
                          {!fb.approved && <button className="crud-edit-btn" onClick={()=>approveFeedback(fb.id)}>✓ {t('approve')}</button>}
                          <button className="crud-delete-btn" onClick={()=>deleteFeedback(fb.id)}>🗑 {t('delete')}</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
