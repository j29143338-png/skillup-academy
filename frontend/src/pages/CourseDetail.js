import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getCourse } from '../api';
import { useLang } from '../context/LangContext';
import { useSEO } from '../hooks/useSEO';
import './CourseDetail.css';

// Teacher experience is stored as free text in English ("8 years"), because
// that is what the admin panel accepts. Pull the number out and let each
// language supply its own wording, so a Russian page never reads
// "8 years опыта". Anything without a number is shown as entered.
function formatExperience(value, t, lang) {
  const years = String(value ?? '').match(/d+/);
  if (!years) return value;
  const n = Number(years[0]);
  if (lang !== 'ru') return t('exp_years', { n });
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return t('exp_years_one', { n });
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return t('exp_years_few', { n });
  return t('exp_years_many', { n });
}

export default function CourseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useLang();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  useSEO(course?.title, course?.description);

  useEffect(() => {
    getCourse(parseInt(id)).then(d => { setCourse(d); setLoading(false); }).catch(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (!course) return <div className="page-loading">Course not found.</div>;

  return (
    <div className="cd-page">
      <div className="cd-hero">
        <div className="cd-hero-bg" />
        <div className="container">
          <button className="back-btn" onClick={() => navigate('/courses')}>{t('back_courses')}</button>
          <div className="cd-hero-content">
            <span className="cd-icon">{course.icon}</span>
            <div>
              <div className="cd-cat-label">{course.category}</div>
              <h1>{course.title}</h1>
              <p className="cd-desc">{course.description}</p>
              {course.audience && (
                <div className="cd-audience"><strong>{t('for_whom')}</strong> {course.audience}</div>
              )}
              {course.note && <div className="cd-note-hero">📌 {course.note}</div>}
            </div>
          </div>
          <div className="cd-meta-bar">
            <div className="cd-meta-item"><span>⏱</span><div><strong>{t('cd_duration')}</strong><p>{course.duration}</p></div></div>
            <div className="cd-meta-item"><span>📚</span><div><strong>{t('cd_levels')}</strong><p>{course.levels}</p></div></div>
            <div className="cd-meta-item"><span>👥</span><div><strong>{t('cd_formats')}</strong><p>{course.formats?.join(', ')}</p></div></div>
            {course.price_individual && (
              <div className="cd-meta-item"><span>💰</span><div><strong>{t('cd_individual')}</strong><p>{course.price_individual}</p></div></div>
            )}
          </div>
        </div>
      </div>

      <div className="container cd-body">
        <div className="cd-grid">
          <div className="cd-main">
            <section className="cd-section">
              <h2>{t('course_program')}</h2>
              <ul className="program-list">
                {course.program?.map((item, i) => (
                  <li key={i}>
                    <span className="prog-num">{String(i + 1).padStart(2, '0')}</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="cd-section">
              <h2>{t('learning_formats')}</h2>
              <div className="formats-grid">
                {course.formats?.map((f, i) => (
                  <div key={i} className="format-card">
                    <span className="format-icon">{['👥', '👤', '👫'][i] || '📖'}</span>
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="cd-sidebar">
            <div className="cd-cta-box">
              <h3>{t('ready_start')}</h3>
              <p>{t('cd_enroll_note')}</p>
              <button className="btn-primary full-width" onClick={() => { navigate('/'); setTimeout(() => document.getElementById('apply')?.scrollIntoView({ behavior: 'smooth' }), 300); }}>
                {t('enroll_in', { name: course.title })}
              </button>
              <div className="cta-note">{t('free_trial')}</div>
            </div>
            {course.teachers?.length > 0 && (
              <div className="cd-teachers-box">
                <h3>{t('your_teachers')}</h3>
                {course.teachers.map(tc => (
                  <div key={tc.id} className="cd-teacher-row" onClick={() => navigate('/teachers')}>
                    <img src={tc.photo} alt={tc.name} className="cd-teacher-photo" />
                    <div><strong>{tc.name}</strong><p>{formatExperience(tc.experience, t, lang)}</p></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
