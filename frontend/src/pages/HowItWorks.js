import React from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../context/LangContext';
import { useSEO } from '../hooks/useSEO';
import './HowItWorks.css';

export default function HowItWorks() {
  const { t } = useLang();
  useSEO(t('hiw_title'), t('hiw_subtitle'));

  const steps = Array.from({ length: 10 }, (_, i) => t(`hiw_step${i + 1}`));

  return (
    <div className="hiw-page">
      <div className="page-hero">
        <div className="page-hero-bg" />
        <div className="container">
          <span className="section-tag">{t('hiw_tag')}</span>
          <h1>{t('hiw_title')}</h1>
          <p>{t('hiw_subtitle')}</p>
        </div>
      </div>

      <div className="container hiw-body">
        {/* METHODOLOGY */}
        <section className="hiw-section">
          <h2>{t('hiw_method_title')}</h2>
          <p>{t('hiw_method_p1')}</p>
          <p>{t('hiw_method_p2')}</p>
          <p>{t('hiw_method_p3')}</p>
        </section>

        {/* ACADEMIC SUPPORT */}
        <section className="hiw-section hiw-support">
          <h2>{t('hiw_support_title')}</h2>
          <p>{t('hiw_support_intro')}</p>
          <p>{t('hiw_support_p1')}</p>
          <div className="hiw-support-note">💡 {t('hiw_support_note')}</div>
        </section>

        {/* STEPS TIMELINE */}
        <section className="hiw-section">
          <h2>{t('hiw_steps_title')}</h2>
          <div className="hiw-timeline">
            {steps.map((s, i) => (
              <div key={i} className="hiw-timeline-item">
                <span className="hiw-timeline-num">{i + 1}</span>
                <p>{s}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="hiw-cta-box">
          <h3>{t('ready_start')}</h3>
          <Link to="/#apply" className="btn-primary">{t('hero_btn1')}</Link>
        </div>
      </div>
    </div>
  );
}
