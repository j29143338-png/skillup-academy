import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../context/LangContext';
import { useSEO } from '../hooks/useSEO';
import './FAQ.css';

const QUESTION_COUNT = 13;

export default function FAQ() {
  const { t } = useLang();
  useSEO(t('faq_title'), t('faq_subtitle'));
  const [openIndex, setOpenIndex] = useState(0);

  const items = Array.from({ length: QUESTION_COUNT }, (_, i) => ({
    q: t(`faq_q${i + 1}`),
    a: t(`faq_a${i + 1}`),
  }));

  return (
    <div className="faq-page">
      <div className="page-hero">
        <div className="page-hero-bg" />
        <div className="container">
          <span className="section-tag">{t('faq_tag')}</span>
          <h1>{t('faq_title')}</h1>
          <p>{t('faq_subtitle')}</p>
        </div>
      </div>

      <div className="container faq-body">
        <div className="faq-accordion">
          {items.map((item, i) => (
            <div key={i} className={`faq-item ${openIndex === i ? 'open' : ''}`}>
              <button className="faq-question" onClick={() => setOpenIndex(openIndex === i ? -1 : i)}>
                <span>{item.q}</span>
                <span className="faq-toggle">{openIndex === i ? '−' : '+'}</span>
              </button>
              {openIndex === i && <div className="faq-answer"><p>{item.a}</p></div>}
            </div>
          ))}
        </div>

        <div className="faq-cta-box">
          <h3>{t('still_not_sure')}</h3>
          <Link to="/#apply" className="btn-primary">{t('get_free')}</Link>
        </div>
      </div>
    </div>
  );
}
