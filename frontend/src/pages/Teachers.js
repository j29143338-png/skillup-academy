import React, { useState, useEffect } from 'react';
import { getTeachers } from '../api';
import { useLang } from '../context/LangContext';
import { tTeacher, tExperience } from '../contentI18n';
import { useSEO } from '../hooks/useSEO';
import './Teachers.css';

export default function Teachers() {
  const { t, lang } = useLang();
  useSEO(t('meet_teachers'), t('teachers_subtitle'));
  const [teachers, setTeachers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTeachers().then(d => { setTeachers(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  // Translated once here rather than per field, so the grid and the profile
  // modal below can never end up in two different languages.
  const localised = teachers.map(x => tTeacher(x, lang));
  const openTeacher = selected ? tTeacher(selected, lang) : null;

  return (
    <div className="teachers-page">
      <div className="page-hero">
        <div className="page-hero-bg" />
        <div className="container">
          <span className="section-tag blue">{t('who_teaches')}</span>
          <h1>{t('meet_teachers')}</h1>
          <p>{t('teachers_subtitle')}</p>
        </div>
      </div>

      <div className="container teachers-body">
        {loading ? <div className="page-loading" style={{minHeight:300}}>{t('loading')}</div> : (
          <div className="teachers-full-grid">
            {localised.map(teacher => (
              <div key={teacher.id} className="teacher-full-card" onClick={() => setSelected(teacher)}>
                <div className="tfc-photo-wrap">
                  <img src={teacher.photo} alt={teacher.name} className="tfc-photo" loading="lazy" />
                  <div className="tfc-hover-overlay"><span>{t('view_profile')}</span></div>
                </div>
                <div className="tfc-body">
                  <h3>{teacher.name}</h3>
                  <p className="tfc-subject">{teacher.subject}</p>
                  <div className="tfc-badges">
                    <span className="tfc-badge exp">🏆 {tExperience(teacher.experience, t, lang)}</span>
                  </div>
                  <p className="tfc-bio">{teacher.short_bio}</p>
                  <div className="tfc-certs">
                    {teacher.certifications.slice(0,2).map((c,i) => <span key={i} className="tag">{c}</span>)}
                    {teacher.certifications.length > 2 && <span className="tag-more">+{teacher.certifications.length-2}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {openTeacher && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelected(null)}>✕</button>
            <div className="modal-teacher-header">
              <img src={openTeacher.photo} alt={openTeacher.name} className="modal-teacher-photo" loading="lazy" />
              <div>
                <h2>{openTeacher.name}</h2>
                <p className="modal-subject">{openTeacher.subject}</p>
                <p className="modal-exp">🏆 {tExperience(openTeacher.experience, t, lang)}</p>
                <p className="modal-edu">🎓 {openTeacher.education}</p>
              </div>
            </div>
            <p className="modal-bio">{openTeacher.full_bio}</p>
            <div className="modal-tags-section"><h4>{t('certifications')}</h4><div className="modal-tags">{openTeacher.certifications.map((c,i)=><span key={i} className="tag">{c}</span>)}</div></div>
            {/* Achievements intentionally hidden until verified real data is entered via Admin panel — see backend/ARCHITECTURE.md */}
            <button className="btn-primary" onClick={() => { setSelected(null); window.location.href='/#apply'; }}>
              {t('enroll_with', { name: openTeacher.name.split(' ')[0] })}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
