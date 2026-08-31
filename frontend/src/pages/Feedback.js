import React, { useState, useEffect } from 'react';
import { getCourses, getTestimonials, getFeedbacks, submitFeedback } from '../api';
import { useLang } from '../context/LangContext';
import { useSEO } from '../hooks/useSEO';
import './Feedback.css';

export default function Feedback() {
  const { t } = useLang();
  useSEO(t('feedback_title'), t('feedback_subtitle'));
  const [reviews, setReviews] = useState([]);
  const [courses, setCourses] = useState([]);
  const [testimonials, setTestimonials] = useState([]);
  const [form, setForm] = useState({ name: '', course: '', rating: 5, text: '' });
  const [status, setStatus] = useState('');
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    getFeedbacks().then(setReviews).catch(() => {});
    getCourses().then(setCourses).catch(() => {});
    getTestimonials().then(setTestimonials).catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.text) { setStatus('error'); return; }
    try {
      await submitFeedback(form);
      setStatus('success');
      setForm({ name: '', course: '', rating: 5, text: '' });
      setShowForm(false);
    } catch { setStatus('error'); }
  };

  const allReviews = [
    ...testimonials.map(t => ({ ...t, verified: true })),
    ...reviews.map(r => ({ ...r, avatar: r.name?.charAt(0).toUpperCase() || 'A', verified: false }))
  ];

  return (
    <div className="feedback-page">
      <div className="page-hero">
        <div className="page-hero-bg" />
        <div className="container">
          <span className="section-tag">{t('feedback_tag')}</span>
          <h1>{t('feedback_title')}</h1>
          <p>{t('feedback_subtitle')}</p>
        </div>
      </div>

      <div className="container fb-body">
        <div className="fb-top-bar">
          <div className="fb-count">{allReviews.length} reviews</div>
          <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
            ✍️ {t('write_review')}
          </button>
        </div>

        {showForm && (
          <div className="fb-form-wrap">
            <h3>{t('share_experience')}</h3>
            <form onSubmit={handleSubmit} className="fb-form">
              <div className="fb-form-row">
                <div className="form-group">
                  <label>{t('your_name')} *</label>
                  <input type="text" placeholder={t('name_placeholder')} value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>{t('select_course')}</label>
                  <select value={form.course} onChange={e => setForm({...form, course: e.target.value})}>
                    <option value="">{t('select_course')}</option>
                    {courses.map(c => <option key={c.id} value={c.title}>{c.title}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>{t('your_rating')}</label>
                <div className="star-rating">
                  {[1,2,3,4,5].map(n => (
                    <button key={n} type="button" className={`star-btn ${form.rating >= n ? 'active' : ''}`} onClick={() => setForm({...form, rating: n})}>★</button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label>{t('your_review')}</label>
                <textarea placeholder={t('review_placeholder')} rows={4} value={form.text} onChange={e => setForm({...form, text: e.target.value})} />
              </div>
              {status === 'success' && <div className="form-success">{t('review_success')}</div>}
              {status === 'error' && <div className="form-error">{t('form_error')}</div>}
              <div style={{ display: 'flex', gap: 12 }}>
                <button type="submit" className="btn-primary">{t('submit_review')}</button>
                <button type="button" className="btn-cancel-fb" onClick={() => setShowForm(false)}>{t('cancel')}</button>
              </div>
            </form>
          </div>
        )}

        {allReviews.length === 0 ? (
          <div className="fb-empty">{t('no_reviews')}</div>
        ) : (
          <div className="reviews-grid">
            {allReviews.map((r, i) => (
              <div key={i} className="review-card">
                <div className="review-header">
                  <div className="review-av">{r.avatar || r.name?.charAt(0) || 'A'}</div>
                  <div className="review-meta">
                    <div className="review-name">{r.name}</div>
                    {r.course && <div className="review-course">{r.course}</div>}
                    {r.score && <div className="review-score">🏆 {r.score}</div>}
                  </div>
                  {r.verified && <div className="verified-badge">✓ {t('verified')}</div>}
                </div>
                <div className="review-stars">{'★'.repeat(r.rating || 5)}{'☆'.repeat(5 - (r.rating || 5))}</div>
                <p className="review-text">{r.text}</p>
                {r.date && (
                  <div className="review-date">
                    {new Date(r.date).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
