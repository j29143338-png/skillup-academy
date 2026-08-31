import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getCourse } from '../api';
import { useLang } from '../context/LangContext';
import { useSEO } from '../hooks/useSEO';
import './CourseDetail.css';

export default function CourseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLang();
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
          <button className="back-btn" onClick={() => navigate('/courses')}>← {t('back_courses')}</button>
          <div className="cd-hero-content">
            <span className="cd-icon">{course.icon}</span>
            <div>
              <div className="cd-cat-label">{course.category}</div>
              <h1>{course.title}</h1>
              <p className="cd-desc">{course.description}</p>
              {course.note && <div className="cd-note-hero">📌 {course.note}</div>}
            </div>
          </div>
          <div className="cd-meta-bar">
            <div className="cd-meta-item"><span>⏱</span><div><strong>Duration</strong><p>{course.duration}</p></div></div>
            <div className="cd-meta-item"><span>📚</span><div><strong>Levels</strong><p>{course.levels}</p></div></div>
            <div className="cd-meta-item"><span>👥</span><div><strong>Formats</strong><p>{course.formats?.join(', ')}</p></div></div>
            {course.price_individual && (
              <div className="cd-meta-item"><span>💰</span><div><strong>Individual</strong><p>{course.price_individual}</p></div></div>
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
              <p>Enroll now or book a free trial lesson to experience the course.</p>
              <button className="btn-primary full-width" onClick={() => { navigate('/'); setTimeout(() => document.getElementById('apply')?.scrollIntoView({ behavior: 'smooth' }), 300); }}>
                {t('enroll_in')} {course.title}
              </button>
              <div className="cta-note">{t('free_trial')}</div>
            </div>
            {course.teachers?.length > 0 && (
              <div className="cd-teachers-box">
                <h3>{t('your_teachers')}</h3>
                {course.teachers.map(tc => (
                  <div key={tc.id} className="cd-teacher-row" onClick={() => navigate('/teachers')}>
                    <img src={tc.photo} alt={tc.name} className="cd-teacher-photo" />
                    <div><strong>{tc.name}</strong><p>{tc.experience} exp.</p></div>
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
