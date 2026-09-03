import React, { useEffect, useRef, useState } from 'react';
import './Intro.css';

// Plays once per tab. Someone moving between pages should not sit through it
// again, and neither should anyone coming back with the back button.
const SEEN_KEY = 'skillup_intro_seen';

// True only when the tab was opened on the home page. Without this, clicking
// "Главная" from, say, the FAQ dropped a full-screen splash on top of someone
// already browsing the site.
const ENTERED_ON_HOME =
  typeof window === 'undefined' || window.location.pathname === '/';
const HOLD_MS = 2300;
const FADE_MS = 900;

function alreadySeen() {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    // Private windows and blocked site data throw on access.
    return false;
  }
}
function markSeen() {
  try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* nothing to do */ }
}

// ?intro=1 replays it even after it has been seen, and ?intro=hold keeps it up
// until Skip is pressed — both there so the intro can be reviewed on demand
// instead of by clearing storage.
function introParam() {
  if (typeof window === 'undefined') return null;
  try {
    return new URLSearchParams(window.location.search).get('intro');
  } catch {
    return null;
  }
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function Intro() {
  const forced = introParam();
  const [state, setState] = useState(() =>
    (!forced && (alreadySeen() || !ENTERED_ON_HOME)) || prefersReducedMotion() ? 'done' : 'playing'
  );
  const sceneRef = useRef(null);
  const finishTimer = useRef(null);

  // Scheduled once on mount rather than keyed on `state`, so a re-render can
  // never tear the timers down and restart them mid-sequence.
  useEffect(() => {
    if ((!forced && (alreadySeen() || !ENTERED_ON_HOME)) || prefersReducedMotion()) return undefined;

    document.body.classList.add('intro-locked');
    if (forced === 'hold') {
      // Stays until Skip is pressed.
      return () => document.body.classList.remove('intro-locked');
    }
    const toLeaving = setTimeout(() => setState('leaving'), HOLD_MS);
    const toDone = setTimeout(() => { markSeen(); setState('done'); }, HOLD_MS + FADE_MS);

    return () => {
      clearTimeout(toLeaving);
      clearTimeout(toDone);
      clearTimeout(finishTimer.current);
      document.body.classList.remove('intro-locked');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The component returns null once it is done but stays mounted, so the
  // cleanup above never runs on a normal finish — the body kept `intro-locked`
  // and the page could not be scrolled until a reload. Release the lock as soon
  // as the intro stops playing; `.intro-leaving` is already pointer-events:none,
  // so scrolling works while it fades out.
  useEffect(() => {
    if (state !== 'playing') document.body.classList.remove('intro-locked');
  }, [state]);

  // Interactive: the scene leans towards the pointer, so it reads as an object
  // in space rather than a clip playing at you.
  const onMove = (e) => {
    const el = sceneRef.current;
    if (!el) return;
    const px = e.clientX / window.innerWidth - 0.5;
    const py = e.clientY / window.innerHeight - 0.5;
    el.style.setProperty('--tilt-x', `${(-py * 12).toFixed(2)}deg`);
    el.style.setProperty('--tilt-y', `${(px * 16).toFixed(2)}deg`);
  };

  const skip = () => {
    if (state !== 'playing') return;
    setState('leaving');
    finishTimer.current = setTimeout(() => { markSeen(); setState('done'); }, FADE_MS);
  };

  if (state === 'done') return null;

  return (
    <div className={`intro ${state === 'leaving' ? 'intro-leaving' : ''}`} onMouseMove={onMove}>
      <div className="intro-glow intro-glow-blue" />
      <div className="intro-glow intro-glow-orange" />

      <div className="intro-scene" ref={sceneRef}>
        {/* The mark, built from the shapes the site already uses */}
        <div className="intro-mark">
          <span className="intro-chevron" />
        </div>
        <div className="intro-cards">
          <div className="intro-card intro-card-1"><b>A1</b></div>
          <div className="intro-card intro-card-3"><b>C1</b></div>
        </div>
      </div>

      <div className="intro-wordmark">
        <span>Skill</span><em>Up</em>
        <small>Academy</small>
      </div>

      <button type="button" className="intro-skip" onClick={skip}>Пропустить</button>
    </div>
  );
}
