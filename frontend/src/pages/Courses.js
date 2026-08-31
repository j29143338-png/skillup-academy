import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCourses } from '../api';
import { useLang } from '../context/LangContext';
import { useSEO } from '../hooks/useSEO';
import './Courses.css';

const catColors = {
  English: { bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE' },
  Math:    { bg: '#F0FDF4', color: '#059669', border: '#A7F3D0' },
  Russian: { bg: '#FEF2F2', color: '#DC2626', border: '#FECACA' },
  Uzbek:   { bg: '#F5F3FF', color: '#7C3AED', border: '#DDD6FE' },
  German:  { bg: '#F9FAFB', color: '#374151', border: '#D1D5DB' },
  Spanish: { bg: '#FFFBEB', color: '#D97706', border: '#FDE68A' },
};

export default function Courses() {
  const { t } = useLang();
  useSEO(t('our_courses'), t('courses_subtitle'));
  const [courses, setCourses] = useState([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    getCourses().then(d => { setCourses(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const categories = ['All', ...new Set(courses.map(c => c.category))];
  const filtered = activeCategory === 'All' ? courses : courses.filter(c => c.category === activeCategory);

  return (
    <div className="courses-page">
      <div className="page-hero">
        <div className="page-hero-bg" />
        <div className="container">
          <span className="section-tag">{t('what_we_teach')}</span>
          <h1>{t('our_courses')}</h1>
          <p>{t('courses_subtitle')}</p>
        </div>
      </div>

      <div className="container courses-body">
        <div className="category-tabs">
          {categories.map(cat => (
            <button key={cat} className={`cat-tab ${activeCategory === cat ? 'active' : ''}`} onClick={() => setActiveCategory(cat)}>
              {cat}
              <span className="cat-count">{cat === 'All' ? courses.length : courses.filter(c => c.category === cat).length}</span>
            </button>
          ))}
        </div>

        {loading ? <div className="page-loading">Loading...</div> : (
          <div className="all-courses-grid">
            {filtered.map(course => {
              const col = catColors[course.category] || catColors.English;
              return (
                <div key={course.id} className="course-full-card" onClick={() => navigate(`/courses/${course.id}`)}>
                  <div className="cfc-header" style={{ background: col.bg, borderBottom: `2px solid ${col.border}` }}>
                    <span className="cfc-icon">{course.icon}</span>
                    <span className="cfc-cat" style={{ color: col.color }}>{course.category}</span>
                  </div>
                  <div className="cfc-body">
                    <h3>{course.title}</h3>
                    <p>{course.description}</p>
                    {course.note && <div className="cfc-note">📌 {course.note}</div>}
                    <div className="cfc-formats">
                      {course.formats?.slice(0, 2).map((f, i) => <span key={i} className="cfc-fmt">{f}</span>)}
                    </div>
                    <div className="cfc-meta">
                      <span>⏱ {course.duration}</span>
                      <span>📚 {course.levels}</span>
                    </div>
                    <div className="cfc-cta" style={{ color: col.color }}>View Full Program →</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
