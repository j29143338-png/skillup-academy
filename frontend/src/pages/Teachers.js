import React, { useState, useEffect } from 'react';
import { getTeachers } from '../api';
import { useLang } from '../context/LangContext';
import './Teachers.css';

export default function Teachers() {
  const { t } = useLang();
  const [teachers, setTeachers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTeachers().then(d => { setTeachers(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

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
        {loading ? <div className="page-loading" style={{minHeight:300}}>Loading...</div> : (
          <div className="teachers-full-grid">
            {teachers.map(teacher => (
              <div key={teacher.id} className="teacher-full-card" onClick={() => setSelected(teacher)}>
                <div className="tfc-photo-wrap">
                  <img src={teacher.photo} alt={teacher.name} className="tfc-photo" />
                  <div className="tfc-hover-overlay"><span>View Profile →</span></div>
                </div>
                <div className="tfc-body">
                  <h3>{teacher.name}</h3>
                  <p className="tfc-subject">{teacher.subject}</p>
                  <div className="tfc-badges">
                    <span className="tfc-badge exp">🏆 {teacher.experience}</span>
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

      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelected(null)}>✕</button>
            <div className="modal-teacher-header">
              <img src={selected.photo} alt={selected.name} className="modal-teacher-photo" />
              <div>
                <h2>{selected.name}</h2>
                <p className="modal-subject">{selected.subject}</p>
                <p className="modal-exp">🏆 {selected.experience}</p>
                <p className="modal-edu">🎓 {selected.education}</p>
              </div>
            </div>
            <p className="modal-bio">{selected.full_bio}</p>
            <div className="modal-tags-section"><h4>Certifications</h4><div className="modal-tags">{selected.certifications.map((c,i)=><span key={i} className="tag">{c}</span>)}</div></div>
            <div className="modal-tags-section"><h4>Achievements</h4><ul className="modal-achievements">{selected.achievements.map((a,i)=><li key={i}>✓ {a}</li>)}</ul></div>
            <button className="btn-primary" onClick={() => { setSelected(null); window.location.href='/#apply'; }}>
              Book a Lesson with {selected.name.split(' ')[0]}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
