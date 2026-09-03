import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLang } from '../context/LangContext';
import './Navbar.css';

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const { lang, setLang, t } = useLang();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => { setMenuOpen(false); }, [location]);

  const links = [
    { to: '/', label: t('nav_home') },
    { to: '/courses', label: t('nav_courses') },
    { to: '/teachers', label: t('nav_teachers') },
    { to: '/prices', label: t('nav_prices') },
    { to: '/feedback', label: t('nav_feedback') },
  ];
  const langs = ['en', 'ru', 'uz'];

  return (
    <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
      <div className="nav-inner container">
        <Link to="/" className="nav-logo">
          <div className="logo-icon">
            <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 30L20 8L32 30" stroke="#F5820A" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M12 22H28" stroke="#F5820A" strokeWidth="4" strokeLinecap="round"/>
            </svg>
          </div>
          <div className="logo-text notranslate" translate="no">
            <span className="logo-main">SkillUp</span>
            <span className="logo-sub">Academy</span>
          </div>
        </Link>

        <ul className={`nav-links ${menuOpen ? 'open' : ''}`}>
          {links.map(l => (
            <li key={l.to}>
              <Link to={l.to} className={`nav-link ${location.pathname === l.to ? 'active' : ''}`}>{l.label}</Link>
            </li>
          ))}
          <li className="lang-switcher">
            {langs.map(l => (
              <button key={l} className={`lang-btn ${lang === l ? 'active' : ''}`} onClick={() => setLang(l)}>
                {l.toUpperCase()}
              </button>
            ))}
          </li>
          <li>
            <Link to="/#apply" className="nav-cta" onClick={() => {
              setMenuOpen(false);
              setTimeout(() => document.getElementById('apply')?.scrollIntoView({ behavior: 'smooth' }), 100);
            }}>{t('nav_enroll')}</Link>
          </li>
        </ul>

        <button className={`hamburger ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(!menuOpen)}>
          <span /><span /><span />
        </button>
      </div>
    </nav>
  );
}
