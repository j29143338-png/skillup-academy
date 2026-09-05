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

// A password field the office can read while typing it, generate a decent one
// into, and copy out. Passwords are stored one-way, so the only moment anyone
// can see one is here — which is exactly why this exists.
function PasswordField({ label, value, onChange }) {
  const { t } = useLang();
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);

  // Ambiguous characters are left out: these get read aloud and written down.
  const generate = () => {
    const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint32Array(12);
    crypto.getRandomValues(bytes);
    onChange(Array.from(bytes, (n) => alphabet[n % alphabet.length]).join(''));
    setShown(true);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the value is on screen either way.
      setShown(true);
    }
  };

  return (
    <>
      <label className="cab-wide">
        {label}
        <input type={shown ? 'text' : 'password'} minLength={8} autoComplete="new-password"
               value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
      <div className="cab-btn-row">
        <button type="button" className="cab-btn-ghost" onClick={() => setShown(!shown)}>
          {shown ? t('cab_hide') : t('cab_show')}
        </button>
        <button type="button" className="cab-btn-ghost" onClick={generate}>{t('cab_generate')}</button>
        <button type="button" className="cab-btn-ghost" disabled={!value} onClick={copy}>
          {copied ? t('cab_copied') : t('cab_copy')}
        </button>
      </div>
    </>
  );
}

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
  // '' = everyone, '1' = still here, '0' = gone. Kept in the query rather than
  // filtered on the client so the list stays short as the years pass.
  const [filter, setFilter] = useState('1');
  const users = useAsync(() => api.getStaffUsers(undefined, filter), [filter]);
  const log = useAsync(() => api.getActionLog(), []);
  const analytics = useAsync(() => (user.role === 'owner' ? api.getAnalytics() : Promise.resolve(null)), [user.role]);

  const [form, setForm] = useState({ email: '', full_name: '', role: 'student', password: '' });
  const [error, setError] = useState('');
  // Which account is having its password replaced, and the new value. Kept
  // inline rather than in a browser prompt so it behaves like the rest of the
  // page and the field can be a real password input.
  const [pwFor, setPwFor] = useState(null);
  const [newPw, setNewPw] = useState('');
  const [pwDone, setPwDone] = useState('');

  const resetPassword = (u) => { setPwFor(u); setNewPw(''); setPwDone(''); setError(''); };

  const savePassword = async () => {
    setError('');
    try {
      await api.setUserPassword(pwFor.id, newPw);
      setPwDone(`${t('cab_saved')}: ${pwFor.full_name || pwFor.email}`);
      setPwFor(null);
      setNewPw('');
    } catch (err) { setError(err.message); }
  };

  // What was just handed out, kept in memory only so the office can read it
  // back to the person. It is never sent anywhere and disappears on reload.
  const [justCreated, setJustCreated] = useState(null);

  const addUser = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.createStaffUser(form);
      setJustCreated({ email: form.email, name: form.full_name, password: form.password });
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
        {pwDone && <p className="cab-note">{pwDone}</p>}
        <p className="cab-muted">{t('cab_password_note')}</p>
        <p className="cab-note">{t('cab_leaving_note')}</p>

        <nav className="cab-tabs">
          {[['1', 'cab_filter_active'], ['0', 'cab_filter_left'], ['', 'cab_filter_all']].map(([value, key]) => (
            <button key={key} type="button"
                    className={`cab-tab${filter === value ? ' active' : ''}`}
                    onClick={() => setFilter(value)}>
              {t(key)}
            </button>
          ))}
        </nav>

        {pwFor && (
          <div className="cab-form cab-form-row cab-card">
            <PasswordField label={`${t('cab_set_password')} — ${pwFor.full_name || pwFor.email}`}
                           value={newPw} onChange={setNewPw} />
            <button type="button" disabled={newPw.length < 8} onClick={savePassword}>{t('cab_save')}</button>
            <button type="button" className="cab-btn-ghost" onClick={() => setPwFor(null)}>{t('cab_delete')}</button>
          </div>
        )}

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
          <PasswordField label={t('login_password')} value={form.password}
                         onChange={(v) => setForm({ ...form, password: v })} />
          <button type="submit" disabled={form.password.length < 8}>{t('cab_add')}</button>
        </form>

        {justCreated && (
          <div className="cab-card">
            <p className="cab-note">{t('cab_new_account')}</p>
            <div className="cab-row">
              <span>
                <strong>{t('cab_account_for')}:</strong> {justCreated.name || justCreated.email}
                {' · '}{justCreated.email}
                {' · '}<code className="cab-answer cab-inline">{justCreated.password}</code>
              </span>
              <button type="button" className="cab-btn-ghost" onClick={() => setJustCreated(null)}>
                {t('cab_hide')}
              </button>
            </div>
          </div>
        )}

        <table className="cab-table">
          <thead>
            <tr><th>{t('cab_name')}</th><th>{t('cab_email')}</th><th>{t('cab_role')}</th><th>{t('cab_status')}</th></tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td>
                  {u.full_name || '—'}
                  {!u.is_active && <span className="cab-muted"> · {t('cab_left')}</span>}
                </td>
                <td>{u.email}</td>
                <td>
                  {u.role}
                  {/* A parent whose children have all gone still has an account
                      that works. Say so, rather than leaving it to be noticed. */}
                  {u.role === 'parent' && u.is_active && (
                    <span className={u.active_children ? 'cab-muted' : 'cab-warn'}>
                      {' · '}
                      {u.active_children
                        ? `${u.active_children} ${t('cab_active_children')}`
                        : t('cab_no_active_children')}
                    </span>
                  )}
                </td>
                <td>
                  <div className="cab-btn-row">
                    <button type="button" className="cab-btn-ghost" onClick={() => toggleActive(u)}>
                      {u.is_active ? 'on' : 'off'}
                    </button>
                    {/* Password recovery cannot send email, so the office has
                        to be able to hand someone a new one on the spot. */}
                    <button type="button" className="cab-btn-ghost" onClick={() => resetPassword(u)}>
                      {t('cab_set_password')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    );
  }

  if (tab === 'applications') return <StaffApplications />;
  if (tab === 'students') return <StaffStudents />;
  if (tab === 'groups') return <StaffGroups />;

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

// ── Office: one student's whole enrolment ───────────────────────────────────
// Everything the front desk does day to day lives on this screen: contract,
// package, schedule, payments, attendance corrections, parents. Without it the
// only way to enrol somebody would be to call the API by hand.
function StaffStudents() {
  const { t, lang } = useLang();
  const students = useAsync(() => api.getStaffUsers('student'), []);
  const teachers = useAsync(() => api.getStaffUsers('teacher', '1'), []);
  const parents = useAsync(() => api.getStaffUsers('parent', '1'), []);
  const groups = useAsync(() => api.getStaffGroups(), []);
  const [picked, setPicked] = useState('');
  const [groupId, setGroupId] = useState('');
  const [error, setError] = useState('');
  const detail = useAsync(
    () => (picked ? api.getStaffStudent(picked) : Promise.resolve(null)),
    [picked]
  );

  // Forms are plain local state; each one clears itself once the server agrees.
  const [contract, setContract] = useState({ contract_start: '' });
  const [pkg, setPkg] = useState({ lessons_paid: 12 });
  const [slot, setSlot] = useState({ weekday: '1', time: '', format: 'individual', teacher_id: '' });
  const [payment, setPayment] = useState({ amount: '', paid_at: '', note: '' });
  const [parentId, setParentId] = useState('');

  const run = async (fn, after) => {
    setError('');
    try {
      await fn();
      if (after) after();
      detail.reload();
    } catch (e) {
      setError(e.message);
    }
  };

  const d = detail.data;

  return (
    <>
      {error && <p className="cab-error">{error}</p>}

      <div className="cab-form cab-form-row cab-card">
        <label className="cab-wide">
          {t('cab_pick_student')}
          {/* The list is ordered still-here first, and anyone who has left is
              labelled — their card stays reachable for the records. */}
          <select value={picked} onChange={(e) => setPicked(e.target.value)}>
            <option value="">—</option>
            {(students.data || []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name || s.email}{s.is_active ? '' : ` · ${t('cab_left')}`}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!picked && <p className="cab-muted">{t('cab_no_student_picked')}</p>}

      {picked && (
        <Panel state={detail} empty={!d}>
          {d && (
            <>
              <div className="cab-stats">
                <Stat label={t('cab_lessons_left')} value={d.package.lessons_left} />
                <Stat label={t('cab_lessons_used')} value={d.package.lessons_used} />
                <Stat label={t('cab_present')} value={d.attendance.present} />
                <Stat label={t('cab_missed')} value={d.attendance.missed} />
              </div>

              {/* Contract */}
              <div className="cab-card">
                <h3>{t('cab_contract')}</h3>
                <p className="cab-muted">{t('cab_contract_hint')}</p>
                {d.contracts.map((c) => (
                  <div className="cab-row" key={c.id}>
                    <span>{asDate(c.contract_start)} — {asDate(c.contract_end)}</span>
                    <button type="button" className="cab-btn-ghost"
                            onClick={() => run(() => api.deleteContract(c.id))}>{t('cab_delete')}</button>
                  </div>
                ))}
                <div className="cab-form cab-form-row">
                  <label>
                    {t('cab_start')}
                    <input type="date" value={contract.contract_start}
                           onChange={(e) => setContract({ contract_start: e.target.value })} />
                  </label>
                  <button type="button" disabled={!contract.contract_start}
                          onClick={() => run(
                            () => api.createContract({ student_id: Number(picked), ...contract }),
                            () => setContract({ contract_start: '' })
                          )}>{t('cab_add')}</button>
                </div>
              </div>

              {/* Package */}
              <div className="cab-card">
                <h3>{t('cab_package')}</h3>
                <p className="cab-muted">{t('cab_package_hint')}</p>
                {d.packages.map((p) => (
                  <div className="cab-row" key={p.id}>
                    <span>{p.lessons_used} / {p.lessons_paid} · {asDate(p.purchased_at)}</span>
                    <button type="button" className="cab-btn-ghost"
                            onClick={() => run(() => api.deletePackage(p.id))}>{t('cab_delete')}</button>
                  </div>
                ))}
                <div className="cab-form cab-form-row">
                  <label>
                    {t('cab_lessons_count')}
                    <input type="number" min={1} value={pkg.lessons_paid}
                           onChange={(e) => setPkg({ lessons_paid: e.target.value })} />
                  </label>
                  <button type="button"
                          onClick={() => run(
                            () => api.createPackage({
                              student_id: Number(picked),
                              lessons_paid: Number(pkg.lessons_paid),
                              contract_id: d.contracts[0]?.id ?? null,
                            }),
                            () => setPkg({ lessons_paid: 12 })
                          )}>{t('cab_add')}</button>
                </div>
              </div>

              {/* Schedule */}
              <div className="cab-card">
                <h3>{t('cab_tab_schedule')}</h3>
                <p className="cab-note">{t('cab_no_reschedule')}</p>
                {d.schedule.map((s) => (
                  <div className="cab-row" key={s.id}>
                    <span>{weekdayName(lang, s.weekday)}, {s.time} · {s.format} · {s.teacher_name || '—'}</span>
                    <button type="button" className="cab-btn-ghost"
                            onClick={() => run(() => api.deleteSlot(s.id))}>{t('cab_delete')}</button>
                  </div>
                ))}
                <div className="cab-form cab-form-row">
                  <label>
                    {t('cab_weekday')}
                    <select value={slot.weekday} onChange={(e) => setSlot({ ...slot, weekday: e.target.value })}>
                      {[1, 2, 3, 4, 5, 6, 0].map((n) => (
                        <option key={n} value={n}>{weekdayName(lang, n)}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t('cab_time')}
                    <input type="time" value={slot.time}
                           onChange={(e) => setSlot({ ...slot, time: e.target.value })} />
                  </label>
                  <label>
                    {t('cab_format')}
                    <select value={slot.format} onChange={(e) => setSlot({ ...slot, format: e.target.value })}>
                      <option value="individual">{t('cab_format_individual')}</option>
                      <option value="group">{t('cab_format_group')}</option>
                    </select>
                  </label>
                  <label>
                    {t('cab_teacher')}
                    <select value={slot.teacher_id}
                            onChange={(e) => setSlot({ ...slot, teacher_id: e.target.value })}>
                      <option value="">—</option>
                      {(teachers.data || []).map((x) => (
                        <option key={x.id} value={x.id}>{x.full_name || x.email}</option>
                      ))}
                    </select>
                  </label>
                  <button type="button" disabled={!slot.time}
                          onClick={() => run(
                            () => api.createSlot({
                              student_id: Number(picked),
                              teacher_id: slot.teacher_id ? Number(slot.teacher_id) : null,
                              weekday: Number(slot.weekday),
                              time: slot.time,
                              format: slot.format,
                            }),
                            () => setSlot({ ...slot, time: '' })
                          )}>{t('cab_add')}</button>
                </div>
              </div>

              {/* Payments */}
              <div className="cab-card">
                <h3>{t('cab_tab_payments')}</h3>
                {d.payments.map((p) => (
                  <div className="cab-row" key={p.id}>
                    <span>{asDate(p.paid_at)} · {money(p.amount, p.currency)} · {p.note || '—'}</span>
                    <button type="button" className="cab-btn-ghost"
                            onClick={() => run(() => api.deletePayment(p.id))}>{t('cab_delete')}</button>
                  </div>
                ))}
                <div className="cab-form cab-form-row">
                  <label>
                    {t('cab_amount')}
                    <input type="number" min={1} value={payment.amount}
                           onChange={(e) => setPayment({ ...payment, amount: e.target.value })} />
                  </label>
                  <label>
                    {t('cab_date')}
                    <input type="date" value={payment.paid_at}
                           onChange={(e) => setPayment({ ...payment, paid_at: e.target.value })} />
                  </label>
                  <label className="cab-wide">
                    {t('cab_note')}
                    <input type="text" value={payment.note}
                           onChange={(e) => setPayment({ ...payment, note: e.target.value })} />
                  </label>
                  <button type="button" disabled={!payment.amount || !payment.paid_at}
                          onClick={() => run(
                            () => api.createPayment({
                              student_id: Number(picked),
                              amount: Number(payment.amount),
                              paid_at: payment.paid_at,
                              note: payment.note,
                            }),
                            () => setPayment({ amount: '', paid_at: '', note: '' })
                          )}>{t('cab_add')}</button>
                </div>
              </div>

              {/* Attendance corrections */}
              <div className="cab-card">
                <h3>{t('cab_tab_attendance')}</h3>
                <p className="cab-muted">{t('cab_mark_note')}</p>
                {d.attendance_records.length === 0 && <p className="cab-muted">{t('cab_none')}</p>}
                {d.attendance_records.map((r) => (
                  <div className="cab-row" key={r.id}>
                    <span className={r.status === 'present' ? 'cab-ok' : 'cab-warn'}>
                      {asDate(r.lesson_date)} · {r.status === 'present' ? t('cab_present') : t('cab_missed')}
                      {r.teacher_name ? ` · ${r.teacher_name}` : ''}
                    </span>
                    <button type="button" className="cab-btn-ghost"
                            onClick={() => run(() => api.deleteAttendance(r.id))}>{t('cab_delete')}</button>
                  </div>
                ))}
              </div>

              {/* Parents */}
              <div className="cab-card">
                <h3>{t('cab_parents')}</h3>
                {d.parents.map((p) => (
                  <div className="cab-row" key={p.id}>
                    <span>{p.full_name || p.email}</span>
                    <button type="button" className="cab-btn-ghost"
                            onClick={() => run(() => api.unlinkParent(p.id, Number(picked)))}>
                      {t('cab_delete')}
                    </button>
                  </div>
                ))}
                <div className="cab-form cab-form-row">
                  <label className="cab-wide">
                    {t('cab_link_parent')}
                    <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
                      <option value="">—</option>
                      {(parents.data || []).map((p) => (
                        <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                      ))}
                    </select>
                  </label>
                  <button type="button" disabled={!parentId}
                          onClick={() => run(
                            () => api.linkParent({ parent_id: Number(parentId), student_id: Number(picked) }),
                            () => setParentId('')
                          )}>{t('cab_add')}</button>
                </div>
              </div>

              {/* Putting a student in a group is also what gives that group's
                  teacher access to them, so it belongs on this screen and not
                  only under Groups. */}
              <div className="cab-card">
                <h3>{t('cab_tab_groups')}</h3>
                {d.groups.length === 0 && <p className="cab-muted">{t('cab_none')}</p>}
                {d.groups.map((g) => (
                  <div className="cab-row" key={g.id}>
                    <span>{g.name}</span>
                    <button type="button" className="cab-btn-ghost"
                            onClick={() => run(() => api.removeGroupMember(g.id, Number(picked)))}>
                      {t('cab_delete')}
                    </button>
                  </div>
                ))}
                <div className="cab-form cab-form-row">
                  <label className="cab-wide">
                    {t('cab_tab_groups')}
                    <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                      <option value="">—</option>
                      {(groups.data || [])
                        .filter((g) => !d.groups.some((own) => own.id === g.id))
                        .map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}{g.teacher_name ? ` · ${g.teacher_name}` : ''}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button type="button" disabled={!groupId}
                          onClick={() => run(
                            () => api.addGroupMember(Number(groupId), Number(picked)),
                            () => setGroupId('')
                          )}>{t('cab_add')}</button>
                </div>
              </div>
            </>
          )}
        </Panel>
      )}
    </>
  );
}

// ── Office: applications ────────────────────────────────────────────────────
// The front desk's starting point. An application arrives, somebody rings the
// person, and the outcome is recorded here — including the one outcome that
// matters, which is turning them into a student without retyping their name.
const APP_STATUSES = ['new', 'contacted', 'enrolled', 'declined'];

function StaffApplications() {
  const { t } = useLang();
  const applications = useAsync(() => api.getApplications(), []);
  const [filter, setFilter] = useState('new');
  const [enrolling, setEnrolling] = useState(null);
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  const setStatus = async (application, status) => {
    setError('');
    try {
      await api.setApplicationStatus(application.id, status);
      applications.reload();
    } catch (e) { setError(e.message); }
  };

  // Creating the account and closing the application are one action, because
  // doing the first and forgetting the second is how a list stops being useful.
  const enrol = async () => {
    setError('');
    try {
      await api.createStaffUser({
        email: form.email,
        password: form.password,
        role: 'student',
        full_name: enrolling.name,
      });
      await api.setApplicationStatus(enrolling.id, 'enrolled');
      setDone({ name: enrolling.name, email: form.email, password: form.password });
      setEnrolling(null);
      setForm({ email: '', password: '' });
      applications.reload();
    } catch (e) { setError(e.message); }
  };

  const rows = (applications.data || [])
    .filter((a) => (filter ? (a.status || 'new') === filter : true))
    .slice()
    .reverse();

  return (
    <Panel state={applications}>
      {error && <p className="cab-error">{error}</p>}
      <p className="cab-note">{t('cab_app_hint')}</p>

      {done && (
        <div className="cab-card">
          <p className="cab-note">{t('cab_app_created')}</p>
          <div className="cab-row">
            <span>
              <strong>{done.name}</strong> · {done.email} ·
              <code className="cab-answer cab-inline">{done.password}</code>
            </span>
            <button type="button" className="cab-btn-ghost" onClick={() => setDone(null)}>{t('cab_hide')}</button>
          </div>
        </div>
      )}

      <nav className="cab-tabs">
        {APP_STATUSES.map((s) => (
          <button key={s} type="button" className={`cab-tab${filter === s ? ' active' : ''}`}
                  onClick={() => setFilter(s)}>
            {t(`cab_app_${s}`)}
          </button>
        ))}
        <button type="button" className={`cab-tab${filter === '' ? ' active' : ''}`}
                onClick={() => setFilter('')}>{t('cab_filter_all')}</button>
      </nav>

      {rows.length === 0 && <p className="cab-muted">{t('cab_none')}</p>}

      {rows.map((a) => (
        <div className="cab-card" key={a.id}>
          <h3>{a.name} <span className="cab-muted">{asDate(a.date)}</span></h3>
          <p>
            <strong>{t('cab_app_phone')}:</strong> {a.phone}
            {a.telegram ? ` · ${a.telegram}` : ''}
            {a.age ? ` · ${a.age}` : ''}
          </p>
          {a.course && <p><strong>{t('cab_app_course')}:</strong> {a.course} {a.format ? `· ${a.format}` : ''}</p>}
          {(a.days || a.time) && <p><strong>{t('cab_app_when')}:</strong> {[a.days, a.time].filter(Boolean).join(' · ')}</p>}
          {a.purpose && <p><strong>{t('cab_app_wants')}:</strong> {a.purpose}</p>}
          {a.message && <p className="cab-answer">{a.message}</p>}
          {a.handled_by && (
            <p className="cab-muted">{t('cab_app_handled_by')}: {a.handled_by} · {asDate(a.handled_at)}</p>
          )}

          <div className="cab-btn-row">
            {APP_STATUSES.filter((s) => s !== 'enrolled').map((s) => (
              <button key={s} type="button"
                      className={(a.status || 'new') === s ? '' : 'cab-btn-ghost'}
                      onClick={() => setStatus(a, s)}>
                {t(`cab_app_${s}`)}
              </button>
            ))}
            {(a.status || 'new') !== 'enrolled' && (
              <button type="button" onClick={() => { setEnrolling(a); setForm({ email: '', password: '' }); }}>
                {t('cab_app_enrol')}
              </button>
            )}
          </div>

          {enrolling?.id === a.id && (
            <div className="cab-form cab-form-row cab-sub">
              <label>
                {t('cab_name')}
                <input type="text" value={a.name} readOnly />
              </label>
              <label>
                {t('cab_email')}
                <input type="email" value={form.email}
                       onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </label>
              <PasswordField label={t('login_password')} value={form.password}
                             onChange={(v) => setForm({ ...form, password: v })} />
              <button type="button" disabled={!form.email || form.password.length < 8} onClick={enrol}>
                {t('cab_app_enrol')}
              </button>
              <button type="button" className="cab-btn-ghost" onClick={() => setEnrolling(null)}>
                {t('cab_delete')}
              </button>
            </div>
          )}
        </div>
      ))}
    </Panel>
  );
}

// ── Office: groups and teacher pay ──────────────────────────────────────────
function StaffGroups() {
  const { t, lang } = useLang();
  const groups = useAsync(() => api.getStaffGroups(), []);
  const teachers = useAsync(() => api.getStaffUsers('teacher', '1'), []);
  const students = useAsync(() => api.getStaffUsers('student', '1'), []);
  const rates = useAsync(() => api.getTeacherRates(), []);
  const [form, setForm] = useState({ name: '', teacher_id: '' });
  const [member, setMember] = useState({});
  // Per-group draft of a lesson slot, keyed by group id.
  const [lesson, setLesson] = useState({});
  const [rate, setRate] = useState({ teacher_id: '', per_lesson: '', tax_percent: '' });
  const [error, setError] = useState('');

  const run = async (fn, after, reload) => {
    setError('');
    try {
      await fn();
      if (after) after();
      (reload || groups.reload)();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <>
      {error && <p className="cab-error">{error}</p>}

      <div className="cab-form cab-form-row cab-card">
        <label>
          {t('cab_group_name')}
          <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          {t('cab_teacher')}
          <select value={form.teacher_id} onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}>
            <option value="">—</option>
            {(teachers.data || []).map((x) => (
              <option key={x.id} value={x.id}>{x.full_name || x.email}</option>
            ))}
          </select>
        </label>
        <button type="button" disabled={!form.name}
                onClick={() => run(
                  () => api.createGroup({
                    name: form.name,
                    teacher_id: form.teacher_id ? Number(form.teacher_id) : null,
                  }),
                  () => setForm({ name: '', teacher_id: '' })
                )}>{t('cab_add')}</button>
      </div>

      <Panel state={groups}>
        {(groups.data || []).map((g) => (
          <div className="cab-card" key={g.id}>
            <div className="cab-row">
              <h3>{g.name} <span className="cab-muted">{g.teacher_name || '—'}</span></h3>
              <button type="button" className="cab-btn-ghost"
                      onClick={() => run(() => api.deleteGroup(g.id))}>{t('cab_delete')}</button>
            </div>
            {g.students.map((s) => (
              <div className="cab-row" key={s.id}>
                <span>{s.full_name}</span>
                <button type="button" className="cab-btn-ghost"
                        onClick={() => run(() => api.removeGroupMember(g.id, s.id))}>{t('cab_delete')}</button>
              </div>
            ))}
            <div className="cab-form cab-form-row">
              <label className="cab-wide">
                {t('cab_add_member')}
                <select value={member[g.id] || ''}
                        onChange={(e) => setMember({ ...member, [g.id]: e.target.value })}>
                  <option value="">—</option>
                  {(students.data || []).map((s) => (
                    <option key={s.id} value={s.id}>{s.full_name || s.email}</option>
                  ))}
                </select>
              </label>
              <button type="button" disabled={!member[g.id]}
                      onClick={() => run(
                        () => api.addGroupMember(g.id, Number(member[g.id])),
                        () => setMember({ ...member, [g.id]: '' })
                      )}>{t('cab_add')}</button>
            </div>

            {/* One lesson for everyone in the group at once. Typing the same
                Tuesday six o'clock four times over is how a simple change
                turns into a job for somebody else. */}
            <div className="cab-form cab-form-row">
              <label>
                {t('cab_weekday')}
                <select value={(lesson[g.id] || {}).weekday ?? '1'}
                        onChange={(e) => setLesson({ ...lesson, [g.id]: { ...lesson[g.id], weekday: e.target.value } })}>
                  {[1, 2, 3, 4, 5, 6, 0].map((n) => (
                    <option key={n} value={n}>{weekdayName(lang, n)}</option>
                  ))}
                </select>
              </label>
              <label>
                {t('cab_time')}
                <input type="time" value={(lesson[g.id] || {}).time || ''}
                       onChange={(e) => setLesson({ ...lesson, [g.id]: { ...lesson[g.id], time: e.target.value } })} />
              </label>
              <button type="button" disabled={!(lesson[g.id] || {}).time || g.students.length === 0}
                      onClick={() => run(
                        () => api.scheduleGroup(g.id, {
                          weekday: Number((lesson[g.id] || {}).weekday ?? 1),
                          time: lesson[g.id].time,
                        }),
                        () => setLesson({ ...lesson, [g.id]: { ...lesson[g.id], time: '' } })
                      )}>{t('cab_schedule_group')}</button>
            </div>
          </div>
        ))}
      </Panel>

      <div className="cab-card">
        <h3>{t('cab_rates')}</h3>
        <p className="cab-muted">{t('cab_finance_net')}</p>
        {(rates.data || []).map((r) => (
          <div className="cab-row" key={r.teacher_id}>
            <span>{r.full_name} · {money(r.per_lesson, r.currency)} · {Number(r.tax_percent)}%</span>
          </div>
        ))}
        <div className="cab-form cab-form-row">
          <label>
            {t('cab_teacher')}
            <select value={rate.teacher_id} onChange={(e) => setRate({ ...rate, teacher_id: e.target.value })}>
              <option value="">—</option>
              {(teachers.data || []).map((x) => (
                <option key={x.id} value={x.id}>{x.full_name || x.email}</option>
              ))}
            </select>
          </label>
          <label>
            {t('cab_rate_per_lesson')}
            <input type="number" min={0} value={rate.per_lesson}
                   onChange={(e) => setRate({ ...rate, per_lesson: e.target.value })} />
          </label>
          <label>
            {t('cab_tax_percent')}
            <input type="number" min={0} max={100} value={rate.tax_percent}
                   onChange={(e) => setRate({ ...rate, tax_percent: e.target.value })} />
          </label>
          <button type="button" disabled={!rate.teacher_id || rate.per_lesson === '' || rate.tax_percent === ''}
                  onClick={() => run(
                    () => api.setTeacherRate({
                      teacher_id: Number(rate.teacher_id),
                      per_lesson: Number(rate.per_lesson),
                      tax_percent: Number(rate.tax_percent),
                    }),
                    () => setRate({ teacher_id: '', per_lesson: '', tax_percent: '' }),
                    rates.reload
                  )}>{t('cab_save')}</button>
        </div>
      </div>
    </>
  );
}

// ── Shell ───────────────────────────────────────────────────────────────────
const TABS = {
  student: ['overview', 'schedule', 'homework', 'attendance', 'payments', 'password'],
  parent: ['overview', 'schedule', 'homework', 'attendance', 'payments', 'password'],
  teacher: ['schedule', 'groups', 'students', 'homework', 'finance', 'password'],
  admin: ['applications', 'students', 'groups', 'people', 'log', 'password'],
  owner: ['applications', 'students', 'groups', 'people', 'log', 'analytics', 'password'],
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
