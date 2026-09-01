import React, { useState, useEffect } from 'react';
import { getPrices } from '../api';
import { useLang } from '../context/LangContext';
import { useSEO } from '../hooks/useSEO';
import './Prices.css';

export default function Prices() {
  const { t } = useLang();
  useSEO(t('simple_pricing'), t('pricing_subtitle'));
  const [prices, setPrices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPrices().then(d => { setPrices(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const formats = [
    { key: 'group', label: t('group_label'), icon: '👥', desc: t('group_desc'), highlight: false },
    { key: 'mini_group', label: t('mini_group_label'), icon: '👫', desc: t('mini_desc'), highlight: true },
    { key: 'individual', label: t('individual_label'), icon: '👤', desc: t('indiv_desc'), highlight: false },
  ];

  return (
    <div className="prices-page">
      <div className="page-hero">
        <div className="page-hero-bg" />
        <div className="container">
          <span className="section-tag">{t('transparent')}</span>
          <h1>{t('simple_pricing')}</h1>
          <p>{t('pricing_subtitle')}</p>
        </div>
      </div>

      <div className="container prices-body">
        {/* Format Legend */}
        <div className="format-legend">
          {formats.map(f => (
            <div key={f.key} className={`format-legend-card ${f.highlight ? 'highlight' : ''}`}>
              <span className="fl-icon">{f.icon}</span>
              <div>
                <strong>{f.label}</strong>
                <span>{f.desc}</span>
              </div>
              {f.highlight && <div className="popular-pill">{t('popular')}</div>}
            </div>
          ))}
        </div>

        {/* Price Table */}
        {loading ? <div className="page-loading" style={{minHeight:200}}>Loading...</div> : (
          <div className="prices-table-wrap">
            <div className="prices-thead">
              <div className="pt-course-col">{t('course_col')}</div>
              {formats.map(f => <div key={f.key} className="pt-col">{f.icon} {f.label}</div>)}
            </div>
            {prices.map((price, i) => (
              <div key={price.id} className={`prices-row ${i % 2 === 0 ? 'even' : ''}`}>
                <div className="pt-course-name">{price.course}</div>
                {formats.map(f => (
                  <div key={f.key} className={`pt-price-cell ${f.highlight ? 'highlight-col' : ''}`}>
                    <span className="pt-cell-label">{f.icon} {f.label}</span>
                    {price[f.key] ? <span className="price-val">{price[f.key]}</span> : <span className="price-na">{t('not_available')}</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Info Cards */}
        <div className="price-info-grid">
          <div className="price-info-card">
            <span>📌</span>
            <div><strong>{t('note_ru_de_title')}</strong><br />{t('note_ru_de')}</div>
          </div>
          <div className="price-info-card">
            <span>🎁</span>
            <div><strong>{t('note_trial_title')}</strong><br />{t('note_trial')}</div>
          </div>
          <div className="price-info-card">
            <span>🏠</span>
            <div><strong>{t('note_home_title')}</strong><br />{t('note_home')}</div>
          </div>
          <div className="price-info-card">
            <span>📦</span>
            <div><strong>{t('note_packages_title')}</strong><br />{t('note_packages')}</div>
          </div>
        </div>

        {/* CTA */}
        <div className="prices-cta-box">
          <h2>{t('still_not_sure')}</h2>
          <p>{t('free_consult')}</p>
          <a href="/#apply" className="btn-primary">{t('get_free')}</a>
        </div>
      </div>
    </div>
  );
}
