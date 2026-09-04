import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useLang } from '../context/LangContext';
import { useAuth } from '../context/AuthContext';
import { useSEO } from '../hooks/useSEO';
import * as api from '../api';
import './Cabinet.css';

// ── Shared helpers ──────────────────────────────────────────────────────────

// Every tab is "fetch once, show, maybe reload". This keeps that in one place
// instead of five copies of the same loading/error/state triple.
function useAsync(loader, deps) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  const reload = useCallback(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    loader()
      .then((data) => alive && setState({ data, error: '', loading: false }))
      .catch((e) => alive && setState({ data: null, error: e.message || 'Error', loading: false }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => reload(), [reload]);
  return { ...state, reload };
}

function Panel({ state, children, empty }) {
  const { t } = useLang();
  if (state.loading) return <p className="cab-muted">{t('cab_loading')}</p>;
  if (state.error) return <p className="cab-error">{state.error}</p>;
  if (empty) return <p className="cab-muted">{t('cab_none')}</p>;
  return children;
}

// Weekday names come from the browser rather than the translation file: the
// site already knows the language, and Intl spells them correctly in all three.
const weekdayName = (lang, index) => {
  // 2024-01-07 was a Sunday, so adding the index lands on the right day.
  const date = new Date(Date.UTC(2024, 0, 7 + index));
  return new Intl.DateTimeFormat(lang, { weekday: 'long', timeZone: 'UTC' }).format(date);
};

const asDate = (value) => (value ? String(value).slice(0, 10) : '—');
const money = (amount, currency) =>
  `${Number(amount).toLocaleString('ru-RU')} ${currency || 'UZS'}`;

function Stat({ label, value, hint }) {
  return (
    <div className="cab-stat">
      <span className="cab-stat-label">{label}</span>
      <strong className="cab-stat-value">{value}</strong>
      {hint && <span className="cab-stat-hint">{hint}</span>}
    </div>
  );
}

// ── Password (every role has it) ────────────────────────────────────────────
function PasswordTab() {
  const { t } = useLang();
  const { signOut } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.changePassword(current, next);
      // The server drops every session on a password change, so the only
      // honest thing to do is send the person back to the sign-in screen.
      await signOut();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="cab-form cab-form-narrow" onSubmit={submit}>
      {error && <p className="cab-error">{error}</p>}
      <label>
        {t('cab_current_password')}
        <input type="password" autoComplete="current-password" required
               value={current} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label>
        {t('cab_new_password')}
        <input type="password" autoComplete="new-password" minLength={8} required
               value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      <button type="submit" disabled={busy}>{t('cab_save')}</button>
      <p className="cab-muted">{t('cab_password_changed')}</p>
    </form>
  );
}

// ── Student and parent ──────────────────────────────────────────────────────
function LearnerCabinet({ tab, childId }) {
  const { t, lang } = useLang();
  const [answers, setAnswers] = useState({});

  const overview = useAsync(() => api.getOverview(childId), [childId]);
  const schedule = useAsync(() => api.getSchedule(childId), [childId]);
  const homework = useAsync(() => api.getHomework(childId), [childId]);
  const attendance = useAsync(() => api.getAttendance(childId), [childId]);
  const payments = useAsync(() => api.getPayments(childId), [childId]);
  const { user } = useAuth();
  const readOnly = user.role === 'parent';

  if (tab === 'overview') {
    const d = overview.data;
    return (
      <Panel state={overview} empty={!d}>
        {d && (
          <>
            <div className="cab-stats">
              <Stat label={t('cab_lessons_left')} value={d.package.lessons_left}
                    hint={`${t('cab_lessons_paid')}: ${d.package.lessons_paid}`} />
              <Stat label={t('cab_lessons_used')} value={d.package.lessons_used}
                    hint={t('cab_package_note')} />
              <Stat label={t('cab_present')} value={d.attendance.present} />
              <Stat label={t('cab_missed')} value={d.attendance.missed} />
            </div>
            <div className="cab-card">
              <h3>{t('cab_contract')}</h3>
              {d.contract ? (
                <p>
                  {asDate(d.contract.contract_start)} — {asDate(d.contract.contract_end)}
                  <span className="cab-tag">{t('cab_contract_term')}</span>
                </p>
              ) : <p className="cab-muted">{t('cab_none')}</p>}
              <p className="cab-muted">{t('cab_package_note')}</p>
            </div>
            {d.homework_due.length > 0 && (
              <div className="cab-card">
                <h3>{t('cab_tab_homework')}</h3>
                <ul className="cab-list">
                  {d.homework_due.map((h) => (
                    <li key={h.id}>{h.title} <span className="cab-muted">{t('cab_due')}: {asDate(h.due_date)}</span></li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </Panel>
    );
  }

  if (tab === 'schedule') {
    const slots = schedule.data?.slots || [];
    return (
      <Panel state={schedule} empty={!slots.length}>
        <table className="cab-table">
          <thead><tr><th>{t('cab_date')}</th><th>{t('cab_status')}</th><th>{t('cab_name')}</th></tr></thead>
          <tbody>
            {slots.map((s) => (
              <tr key={s.id}>
                <td>{weekdayName(lang, s.weekday)}, {s.time}</td>
                <td>{s.format}</td>
                <td>{s.teacher_name || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="cab-note">{t('cab_no_reschedule')}</p>
      </Panel>
    );
  }

  if (tab === 'homework') {
    const items = homework.data || [];
    const send = async (id) => {
      await api.submitHomework(id, answers[id] || '');
      setAnswers((a) => ({ ...a, [id]: '' }));
      homework.reload();
    };
    return (
      <Panel state={homework} empty={!items.length}>
        {items.map((h) => (
          <div className="cab-card" key={h.id}>
            <h3>{h.title}</h3>
            <p className="cab-muted">
              {t('cab_due')}: {asDate(h.due_date)} · {h.teacher_name || '—'}
            </p>
            {h.body && <p>{h.body}</p>}
            {h.submitted_at ? (
              <div className="cab-sub">
                <p><strong>{t('cab_submitted')}:</strong> {asDate(h.submitted_at)}</p>
                <p className="cab-answer">{h.submission_text}</p>
                {h.grade && <p><strong>{t('cab_grade')}:</strong> {h.grade}</p>}
                {h.teacher_comment && <p><strong>{t('cab_teacher_comment')}:</strong> {h.teacher_comment}</p>}
              </div>
            ) : readOnly ? (
              <p className="cab-muted">{t('cab_parent_readonly')}</p>
            ) : (
              <div className="cab-sub">
                <label>
                  {t('cab_your_answer')}
                  <textarea rows={4} value={answers[h.id] || ''}
                            onChange={(e) => setAnswers((a) => ({ ...a, [h.id]: e.target.value }))} />
                </label>
                <button type="button" onClick={() => send(h.id)}>{t('cab_submit_answer')}</button>
              </div>
            )}
          </div>
        ))}
      </Panel>
    );
  }

  if (tab === 'attendance') {
    const records = attendance.data?.records || [];
    return (
      <Panel state={attendance} empty={!records.length}>
        <table className="cab-table">
          <thead><tr><th>{t('cab_date')}</th><th>{t('cab_status')}</th><th>{t('cab_name')}</th></tr></thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id}>
                <td>{asDate(r.lesson_date)}</td>
                <td className={r.status === 'present' ? 'cab-ok' : 'cab-warn'}>
                  {r.status === 'present' ? t('cab_present') : t('cab_missed')}
                </td>
                <td>{r.teacher_name || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="cab-note">{t('cab_no_reschedule')}</p>
      </Panel>
    );
  }

  if (tab === 'payments') {
    const rows = payments.data?.payments || [];
    return (
      <Panel state={payments} empty={!rows.length}>
        {payments.data && (
          <div className="cab-stats">
            <Stat label={t('cab_lessons_paid')} value={payments.data.package.lessons_paid} />
            <Stat label={t('cab_lessons_left')} value={payments.data.package.lessons_left} />
          </div>
        )}
        <table className="cab-table">
          <thead><tr><th>{t('cab_date')}</th><th>{t('cab_amount')}</th><th>{t('cab_name')}</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{asDate(p.paid_at)}</td>
                <td>{money(p.amount, p.currency)}</td>
                <td>{p.note || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    );
  }

  return <PasswordTab />;
}

// ── Teacher ─────────────────────────────────────────────────────────────────
function TeacherCabinet({ tab }) {
  const { t, lang } = useLang();
  const schedule = useAsync(() => api.getTeacherSchedule(), []);
  const groups = useAsync(() => api.getTeacherGroups(), []);
  const students = useAsync(() => api.getTeacherStudents(), []);
  const homework = useAsync(() => api.getTeacherHomework(), []);
  const finance = useAsync(() => api.getTeacherFinance(), []);

  const [form, setForm] = useState({ title: '', body: '', due_date: '', group_id: '', student_id: '' });
  const [mark, setMark] = useState({ student_id: '', lesson_date: '', comment: '' });
  const [error, setError] = useState('');

  const createHw = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.createHomework({
        title: form.title,
        body: form.body,
        due_date: form.due_date || null,
        group_id: form.group_id ? Number(form.group_id) : null,
        student_id: form.student_id ? Number(form.student_id) : null,
      });
      setForm({ title: '', body: '', due_date: '', group_id: '', student_id: '' });
      homework.reload();
    } catch (err) { setError(err.message); }
  };

  const sendMark = async (status) => {
    setError('');
    try {
      await api.markAttendance({ ...mark, student_id: Number(mark.student_id), status });
      setMark({ student_id: '', lesson_date: '', comment: '' });
    } catch (err) { setError(err.message); }
  };

  if (tab === 'schedule') {
    const slots = schedule.data?.slots || [];
    return (
      <Panel state={schedule} empty={!slots.length}>
        <table className="cab-table">
          <thead><tr><th>{t('cab_date')}</th><th>{t('cab_status')}</th><th>{t('cab_name')}</th></tr></thead>
          <tbody>
            {slots.map((s) => (
              <tr key={s.id}>
                <td>{weekdayName(lang, s.weekday)}, {s.time}</td>
                <td>{s.format}</td>
                <td>{s.student_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="cab-note">{t('cab_no_reschedule')}</p>
      </Panel>
    );
  }

  if (tab === 'groups') {
    const rows = groups.data || [];
    return (
      <Panel state={groups} empty={!rows.length}>
        {rows.map((g) => (
          <div className="cab-card" key={g.id}>
            <h3>{g.name}</h3>
            <ul className="cab-list">
              {g.students.map((s) => <li key={s.id}>{s.full_name}</li>)}
            </ul>
          </div>
        ))}
      </Panel>
    );
  }

  if (tab === 'students') {
    const rows = students.data || [];
    return (
      <Panel state={students} empty={!rows.length}>
        {error && <p className="cab-error">{error}</p>}
        <div className="cab-card">
          <h3>{t('cab_tab_attendance')}</h3>
          <div className="cab-form cab-form-row">
            <label>
              {t('cab_tab_students')}
              <select value={mark.student_id} onChange={(e) => setMark({ ...mark, student_id: e.target.value })}>
                <option value="">—</option>
                {rows.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </label>
            <label>
              {t('cab_date')}
              <input type="date" value={mark.lesson_date}
                     onChange={(e) => setMark({ ...mark, lesson_date: e.target.value })} />
            </label>
            <label>
              {t('cab_teacher_comment')}
              <input type="text" value={mark.comment}
                     onChange={(e) => setMark({ ...mark, comment: e.target.value })} />
            </label>
            <div className="cab-btn-row">
              <button type="button" disabled={!mark.student_id || !mark.lesson_date}
                      onClick={() => sendMark('present')}>{t('cab_mark_present')}</button>
              <button type="button" className="cab-btn-ghost" disabled={!mark.student_id || !mark.lesson_date}
                      onClick={() => sendMark('missed')}>{t('cab_mark_missed')}</button>
            </div>
          </div>
          <p className="cab-note">{t('cab_mark_note')}</p>
        </div>
        <table className="cab-table">
          <thead><tr><th>{t('cab_name')}</th><th>{t('cab_email')}</th></tr></thead>
          <tbody>
            {rows.map((s) => <tr key={s.id}><td>{s.full_name}</td><td>{s.email}</td></tr>)}
          </tbody>
        </table>
      </Panel>
    );
  }

  if (tab === 'homework') {
    const rows = homework.data || [];
    return (
      <Panel state={homework}>
        {error && <p className="cab-error">{error}</p>}
        <form className="cab-form cab-form-row cab-card" onSubmit={createHw}>
          <label>
            {t('cab_name')}
            <input type="text" required value={form.title}
                   onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
          <label>
            {t('cab_due')}
            <input type="date" value={form.due_date}
                   onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
          </label>
          <label>
            {t('cab_tab_groups')}
            <select value={form.group_id}
                    onChange={(e) => setForm({ ...form, group_id: e.target.value, student_id: '' })}>
              <option value="">—</option>
              {(groups.data || []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <label>
            {t('cab_tab_students')}
            <select value={form.student_id}
                    onChange={(e) => setForm({ ...form, student_id: e.target.value, group_id: '' })}>
              <option value="">—</option>
              {(students.data || []).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </label>
          <label className="cab-wide">
            {t('cab_your_answer')}
            <textarea rows={3} value={form.body}
                      onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </label>
          <button type="submit">{t('cab_add')}</button>
        </form>

        {rows.map((h) => (
          <div className="cab-card" key={h.id}>
            <h3>{h.title}</h3>
            <p className="cab-muted">
              {h.group_name || t('cab_tab_students')} · {t('cab_due')}: {asDate(h.due_date)}
            </p>
            {h.submissions.length === 0 && <p className="cab-muted">{t('cab_none')}</p>}
            {h.submissions.map((s) => (
              <GradeRow key={s.student_id} homeworkId={h.id} submission={s} onDone={homework.reload} />
            ))}
          </div>
        ))}
      </Panel>
    );
  }

  if (tab === 'finance') {
    const d = finance.data;
    return (
      <Panel state={finance} empty={!d}>
        {d && !d.configured && <p className="cab-muted">{t('cab_finance_none')}</p>}
        {d && (
          <>
            <table className="cab-table">
              <thead><tr><th>{t('cab_month')}</th><th>{t('cab_lessons')}</th><th>{t('cab_amount')}</th></tr></thead>
              <tbody>
                {d.months.map((m) => (
                  <tr key={m.month}>
                    <td>{asDate(m.month).slice(0, 7)}</td>
                    <td>{m.lessons}</td>
                    <td>{d.configured ? money(m.net, d.currency) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {d.configured && <p className="cab-note">{t('cab_finance_net')} ({d.tax_percent}%)</p>}
          </>
        )}
      </Panel>
    );
  }

  return <PasswordTab />;
}

function GradeRow({ homeworkId, submission, onDone }) {
  const { t } = useLang();
  const [grade, setGrade] = useState(submission.grade || '');
  const [comment, setComment] = useState(submission.teacher_comment || '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.gradeHomework(homeworkId, { student_id: submission.student_id, grade, comment });
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cab-sub">
      <p><strong>{submission.student_name}</strong> · {asDate(submission.submitted_at)}</p>
      <p className="cab-answer">{submission.text}</p>
      <div className="cab-form cab-form-row">
        <label>
          {t('cab_grade')}
          <input type="text" value={grade} onChange={(e) => setGrade(e.target.value)} />
        </label>
        <label className="cab-wide">
          {t('cab_teacher_comment')}
          <input type="text" value={comment} onChange={(e) => setComment(e.target.value)} />
        </label>
        <button type="button" onClick={save} disabled={busy}>{t('cab_save')}</button>
      </div>
    </div>
  );
}

// ── Admin and owner ─────────────────────────────────────────────────────────
function StaffCabinet({ tab }) {
  const { t } = useLang();
  const { user } = useAuth();
  const users = useAsync(() => api.getStaffUsers(), []);
  const log = useAsync(() => api.getActionLog(), []);
  const analytics = useAsync(() => (user.role === 'owner' ? api.getAnalytics() : Promise.resolve(null)), [user.role]);

  const [form, setForm] = useState({ email: '', full_name: '', role: 'student', password: '' });
  const [error, setError] = useState('');

  const addUser = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.createStaffUser(form);
      setForm({ email: '', full_name: '', role: 'student', password: '' });
      users.reload();
    } catch (err) { setError(err.message); }
  };

  const toggleActive = async (u) => {
    try {
      await api.updateStaffUser(u.id, { is_active: !u.is_active });
      users.reload();
    } catch (err) { setError(err.message); }
  };

  if (tab === 'people') {
    const rows = users.data || [];
    return (
      <Panel state={users}>
        {error && <p className="cab-error">{error}</p>}
        <form className="cab-form cab-form-row cab-card" onSubmit={addUser}>
          <label>
            {t('cab_email')}
            <input type="email" required value={form.email}
                   onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label>
            {t('cab_name')}
            <input type="text" value={form.full_name}
                   onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </label>
          <label>
            {t('cab_role')}
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="student">student</option>
              <option value="parent">parent</option>
              <option value="teacher">teacher</option>
              {/* Only an owner may mint staff; the server enforces this too. */}
              {user.role === 'owner' && <option value="admin">admin</option>}
              {user.role === 'owner' && <option value="owner">owner</option>}
            </select>
          </label>
          <label>
            {t('login_password')}
            <input type="password" minLength={8} required value={form.password}
                   onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </label>
          <button type="submit">{t('cab_add')}</button>
        </form>

        <table className="cab-table">
          <thead>
            <tr><th>{t('cab_name')}</th><th>{t('cab_email')}</th><th>{t('cab_role')}</th><th>{t('cab_status')}</th></tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td>{u.full_name || '—'}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>
                  <button type="button" className="cab-btn-ghost" onClick={() => toggleActive(u)}>
                    {u.is_active ? 'on' : 'off'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    );
  }

  if (tab === 'log') {
    const rows = log.data || [];
    return (
      <Panel state={log} empty={!rows.length}>
        <table className="cab-table">
          <thead><tr><th>{t('cab_date')}</th><th>{t('cab_name')}</th><th>{t('cab_status')}</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.created_at).toLocaleString()}</td>
                <td>{r.full_name || r.email || '—'} <span className="cab-muted">{r.role}</span></td>
                <td>{r.action} {r.target && <span className="cab-muted">{r.target}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    );
  }

  if (tab === 'analytics') {
    const d = analytics.data;
    return (
      <Panel state={analytics} empty={!d}>
        {d && (
          <>
            <div className="cab-stats">
              {Object.entries(d.users).map(([role, n]) => <Stat key={role} label={role} value={n} />)}
              <Stat label={t('cab_lessons_paid')} value={d.lessons.paid} />
              <Stat label={t('cab_lessons_used')} value={d.lessons.used} />
            </div>
            <table className="cab-table">
              <thead><tr><th>{t('cab_month')}</th><th>{t('cab_amount')}</th></tr></thead>
              <tbody>
                {d.revenue_by_month.map((m) => (
                  <tr key={`${m.month}-${m.currency}`}>
                    <td>{asDate(m.month).slice(0, 7)}</td>
                    <td>{money(m.total, m.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Panel>
    );
  }

  return <PasswordTab />;
}

// ── Shell ───────────────────────────────────────────────────────────────────
const TABS = {
  student: ['overview', 'schedule', 'homework', 'attendance', 'payments', 'password'],
  parent: ['overview', 'schedule', 'homework', 'attendance', 'payments', 'password'],
  teacher: ['schedule', 'groups', 'students', 'homework', 'finance', 'password'],
  admin: ['people', 'log', 'password'],
  owner: ['people', 'log', 'analytics', 'password'],
};

export default function Cabinet() {
  const { t } = useLang();
  const { user, loading, signOut } = useAuth();
  const [tab, setTab] = useState(null);
  const [childId, setChildId] = useState(null);
  useSEO(t('nav_cabinet'), t('cab_login_subtitle'));

  const tabs = user ? TABS[user.role] || [] : [];
  const active = tab && tabs.includes(tab) ? tab : tabs[0];

  if (loading) return <div className="cab-page"><div className="container"><p className="cab-muted">{t('cab_loading')}</p></div></div>;
  if (!user) return <Navigate to="/login" replace />;

  const children = user.children || [];

  return (
    <div className="cab-page">
      <header className="cab-header">
        <div className="container cab-header-inner">
          <div>
            <h1>{t('cab_hello', { name: user.full_name || user.email })}</h1>
            <p>{user.role}</p>
          </div>
          <button className="logout-btn" type="button" onClick={signOut}>{t('cab_signout')}</button>
        </div>
      </header>

      <div className="container cab-body">
        {user.role === 'parent' && (
          <div className="cab-childbar">
            <p className="cab-note">{t('cab_parent_readonly')}</p>
            {children.length > 1 && (
              <label>
                {t('cab_child')}
                <select value={childId || children[0].id}
                        onChange={(e) => setChildId(Number(e.target.value))}>
                  {children.map((c) => <option key={c.id} value={c.id}>{c.full_name || c.email}</option>)}
                </select>
              </label>
            )}
          </div>
        )}

        <nav className="cab-tabs">
          {tabs.map((name) => (
            <button key={name} type="button"
                    className={`cab-tab${name === active ? ' active' : ''}`}
                    onClick={() => setTab(name)}>
              {t(`cab_tab_${name}`)}
            </button>
          ))}
        </nav>

        {(user.role === 'student' || user.role === 'parent') && (
          <LearnerCabinet tab={active} childId={childId || children[0]?.id || null} />
        )}
        {user.role === 'teacher' && <TeacherCabinet tab={active} />}
        {(user.role === 'admin' || user.role === 'owner') && <StaffCabinet tab={active} />}
      </div>
    </div>
  );
}
