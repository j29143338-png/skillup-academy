import React from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../context/LangContext';
import './Footer.css';

export default function Footer() {
  const { t } = useLang();
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <div className="footer-logo">
              <svg viewBox="0 0 40 40" fill="none" width="32" height="32">
                <path d="M8 30L20 8L32 30" stroke="#F5820A" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M12 22H28" stroke="#F5820A" strokeWidth="4" strokeLinecap="round"/>
              </svg>
              <span>SkillUp Academy</span>
            </div>
            <p className="footer-tagline">SkillUp & Step Up! 🚀</p>
            <p className="footer-desc">Premium online education platform delivering world-class instruction in languages and mathematics.</p>
          </div>

          <div className="footer-col">
            <h4>{t('nav_courses')}</h4>
            <ul>
              <li><Link to="/courses">General English</Link></li>
              <li><Link to="/courses">IELTS / CEFR</Link></li>
              <li><Link to="/courses">SAT / Westminster</Link></li>
              <li><Link to="/courses">Russian / Uzbek</Link></li>
              <li><Link to="/courses">German / Spanish</Link></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>SkillUp</h4>
            <ul>
              <li><Link to="/teachers">{t('nav_teachers')}</Link></li>
              <li><Link to="/prices">{t('nav_prices')}</Link></li>
              <li><Link to="/feedback">{t('nav_feedback')}</Link></li>
              <li><Link to="/#apply">{t('nav_enroll')}</Link></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Contact</h4>
            <ul>
              <li><a href="tel:+998901234567">+998 90 123 45 67</a></li>
              <li><a href="mailto:info@skillup.uz">info@skillup.uz</a></li>
              <li><a href="https://t.me/skillupacademy" target="_blank" rel="noreferrer">Telegram</a></li>
              <li><a href="https://instagram.com/skillupacademy" target="_blank" rel="noreferrer">Instagram</a></li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} SkillUp Academy. All rights reserved.</p>
          <div className="footer-langs">
            <span>EN</span><span>RU</span><span>UZ</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
