import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useLang } from '../context/LangContext';
import { useAuth } from '../context/AuthContext';
import { forgotPassword, resetPassword, isDemo } from '../api';
import { useSEO } from '../hooks/useSEO';
import './Login.css';

// One page, three states. Recovery is two steps — ask for a code, then use it —
// and both are small enough that a separate route would only add navigation.
const SIGN_IN = 'sign-in';
const FORGOT = 'forgot';
const RESET = 'reset';

export default function Login() {
  const { t } = useLang();
  const { user, loading, signIn } = useAuth();
  const navigate = useNavigate();
  useSEO(t('cab_login_title'), t('cab_login_subtitle'));

  const [mode, setMode] = useState(SIGN_IN);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  if (loading) return <div className="login-page"><div className="login-card">{t('cab_loading')}</div></div>;
  if (user) return <Navigate to="/cabinet" replace />;

  const run = async (fn, after) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
      if (after) after();
    } catch (e) {
      setError(e.message || 'Error');
    } finally {
      setBusy(false);
    }
  };

  const onSignIn = (e) => {
    e.preventDefault();
    run(() => signIn(email, password), () => navigate('/cabinet'));
  };

  const onForgot = (e) => {
    e.preventDefault();
    run(() => forgotPassword(email), () => { setMode(RESET); setNotice(t('login_forgot_sent')); });
  };

  const onReset = (e) => {
    e.preventDefault();
    run(() => resetPassword(token, password), () => { setMode(SIGN_IN); setPassword(''); setNotice(t('login_reset_done')); });
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo"><span>SkillUp</span></div>

        {isDemo() && <p className="login-error">Demo mode has no backend — signing in is disabled.</p>}
        {error && <p className="login-error">{error}</p>}
        {notice && <p className="login-notice">{notice}</p>}

        {mode === SIGN_IN && (
          <>
            <h2>{t('cab_login_title')}</h2>
            <p>{t('cab_login_subtitle')}</p>
            <form className="login-form" onSubmit={onSignIn}>
              <label>
                {t('login_email')}
                <input type="email" autoComplete="username" required
                       value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label>
                {t('login_password')}
                <input type="password" autoComplete="current-password" required
                       value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
              <button className="login-submit" type="submit" disabled={busy || isDemo()}>
                {busy ? t('cab_loading') : t('login_submit')}
              </button>
            </form>
            <button className="login-link" type="button" onClick={() => { setMode(FORGOT); setError(''); }}>
              {t('login_forgot')}
            </button>
          </>
        )}

        {mode === FORGOT && (
          <>
            <h2>{t('login_forgot')}</h2>
            <form className="login-form" onSubmit={onForgot}>
              <label>
                {t('login_email')}
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <button className="login-submit" type="submit" disabled={busy}>{t('login_submit')}</button>
            </form>
            <button className="login-link" type="button" onClick={() => setMode(SIGN_IN)}>{t('login_back')}</button>
          </>
        )}

        {mode === RESET && (
          <>
            <h2>{t('login_reset_title')}</h2>
            <form className="login-form" onSubmit={onReset}>
              <label>
                {t('login_reset_token')}
                <input type="text" required value={token} onChange={(e) => setToken(e.target.value)} />
              </label>
              <label>
                {t('login_reset_new')}
                <input type="password" minLength={8} autoComplete="new-password" required
                       value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
              <button className="login-submit" type="submit" disabled={busy}>{t('login_reset_submit')}</button>
            </form>
            <button className="login-link" type="button" onClick={() => setMode(SIGN_IN)}>{t('login_back')}</button>
          </>
        )}

        <Link className="login-home" to="/">← SkillUp Academy</Link>
      </div>
    </div>
  );
}
