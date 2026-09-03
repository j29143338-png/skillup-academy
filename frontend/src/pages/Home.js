import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getCourses, getTeachers, getTestimonials, getResults, submitApplication } from '../api';
import { useLang } from '../context/LangContext';
import { useSEO } from '../hooks/useSEO';
import './Home.css';

function useInView(threshold = 0.12) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true); }, { threshold });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, inView];
}
function AnimSection({ children, className = '' }) {
  const [ref, inView] = useInView();
  return <div ref={ref} className={`anim-section ${inView ? 'visible' : ''} ${className}`}>{children}</div>;
}

// Subtle 3D tilt on hover — restrained (max ~5deg), disabled for reduced-motion users and on touch.
const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function TiltCard({ children, className, onClick, style, maxDeg = 5 }) {
  const ref = useRef(null);
  const onMouseMove = (e) => {
    if (prefersReducedMotion() || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    ref.current.style.transform = `perspective(900px) rotateX(${(-py * maxDeg).toFixed(2)}deg) rotateY(${(px * maxDeg).toFixed(2)}deg) translateY(-4px)`;
  };
  const onMouseLeave = () => { if (ref.current) ref.current.style.transform = ''; };
  return (
    <div ref={ref} className={className} style={style} onClick={onClick} onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
      {children}
    </div>
  );
}

function HeroWords({ text, className = '', startDelay = 0 }) {
  const words = String(text).split(' ').filter(Boolean);
  return (
    <span className={`hero-line ${className}`}>
      {words.map((word, i) => (
        <span
          key={`${word}-${i}`}
          className="hero-word"
          style={{ animationDelay: `${(startDelay + i * 0.09).toFixed(2)}s` }}
        >
          {word}
        </span>
      ))}
    </span>
  );
}

const catColor = { English:'#2563EB', Math:'#059669', Russian:'#DC2626', Uzbek:'#7C3AED', German:'#1A1A1A', Spanish:'#D97706' };

const emptyForm = { name: '', phone: '', age: '', telegram: '', course: '', format: '', days: '', time: '', message: '', purpose: 'trial' };

export default function Home() {
  const { t } = useLang();
  useSEO(t('hero_title1') + ' ' + t('hero_title2'), t('hero_subtitle'));
  const [courses, setCourses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [testimonials, setTestimonials] = useState([]);
  const [results, setResults] = useState([]);
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [formStatus, setFormStatus] = useState('');
  const [activeTest, setActiveTest] = useState(0);
  const navigate = useNavigate();
  const heroRef = useRef(null);

  useEffect(() => {
    getCourses().then(setCourses).catch(() => {});
    getTeachers().then(setTeachers).catch(() => {});
    getTestimonials().then(setTestimonials).catch(() => {});
    getResults().then(setResults).catch(() => {});
  }, []);

  const scrollToApply = (purpose) => {
    setFormData((f) => ({ ...f, purpose }));
    document.getElementById('apply')?.scrollIntoView({ behavior: 'smooth' });
  };

  // Subtle hero parallax — a few px of depth on mouse move, off for reduced-motion.
  const onHeroMouseMove = (e) => {
    if (prefersReducedMotion() || !heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    heroRef.current.style.setProperty('--parallax-x', `${(px * 18).toFixed(1)}px`);
    heroRef.current.style.setProperty('--parallax-y', `${(py * 18).toFixed(1)}px`);
  };

  useEffect(() => {
    if (!testimonials.length) return;
    const ti = setInterval(() => setActiveTest(p => (p + 1) % testimonials.length), 5000);
    return () => clearInterval(ti);
  }, [testimonials.length]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.phone || !formData.course) { setFormStatus('error'); return; }
    try { await submitApplication(formData); setFormStatus('success'); setFormData(emptyForm); }
    catch { setFormStatus('error'); }
  };

  const WHY = [
    { icon: '👨‍🏫', title: t('why1_title'), desc: t('why1_desc') },
    { icon: '🎯', title: t('why2_title'), desc: t('why2_desc') },
    { icon: '💡', title: t('why3_title'), desc: t('why3_desc') },
    { icon: '🧭', title: t('why4_title'), desc: t('why4_desc') },
    { icon: '📊', title: t('why5_title'), desc: t('why5_desc') },
    { icon: '🤝', title: t('why6_title'), desc: t('why6_desc') },
    { icon: '📱', title: t('why7_title'), desc: t('why7_desc') },
  ];
  const TRIAL = [1, 2, 3, 4, 5].map((n) => t(`trial${n}`));
  const STATS = [
    { num: '600+', label: t('stat1') },
    { num: '96%', label: t('stat2') },
    { num: teachers.length ? `${teachers.length}` : '—', label: t('stat3') },
    { num: courses.length ? `${courses.length}` : '—', label: t('stat4') },
  ];

  return (
    <div className="home">
      {/* HERO */}
      <section className="hero" ref={heroRef} onMouseMove={onHeroMouseMove}>
        <div className="hero-bg">
          <div className="hero-blob blob1" />
          <div className="hero-blob blob2" />
          <div className="hero-blob blob3" />
          <div className="hero-grid" />
        </div>
        <div className="container hero-content">
          <div className="hero-badge animate-fadeUp">✦ {t('hero_badge')}</div>
          <h1 className="hero-title hero-title-3d">
            <HeroWords text={t('hero_title1')} startDelay={0.12} />
            <HeroWords text={t('hero_title2')} className="hero-accent" startDelay={0.34} />
          </h1>
          <p className="hero-subtitle animate-fadeUp" style={{ animationDelay: '0.2s' }}>{t('hero_subtitle')}</p>
          <div className="hero-actions animate-fadeUp" style={{ animationDelay: '0.3s' }}>
            <button className="btn-primary" onClick={() => scrollToApply('trial')}>{t('hero_btn1')}</button>
            <button className="btn-outline-white" onClick={() => scrollToApply('level_check')}>{t('hero_btn2')}</button>
          </div>
          <div className="hero-stats animate-fadeUp" style={{ animationDelay: '0.4s' }}>
            {STATS.map(s => (
              <div key={s.label} className="stat-item">
                <span className="stat-num">{s.num}</span>
                <span className="stat-label">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="hero-scroll-dot" />
      </section>

      {/* COURSES */}
      <section className="section bg-white">
        <div className="container">
          <AnimSection><div className="section-header"><span className="section-tag">{t('what_we_teach')}</span><h2>{t('our_courses')}</h2><p>{t('courses_subtitle')}</p></div></AnimSection>
          <div className="courses-grid">
            {courses.map((c) => (
              <AnimSection key={c.id}>
                <TiltCard className="course-card" onClick={() => navigate(`/courses/${c.id}`)} style={{ '--cat': catColor[c.category] || '#2563EB' }}>
                  <div className="course-card-top">
                    <span className="course-icon-big">{c.icon}</span>
                    <span className="course-cat-badge" style={{ color: catColor[c.category], background: `${catColor[c.category]}15` }}>{c.category}</span>
                  </div>
                  <h3 className="course-title">{c.title}</h3>
                  <p className="course-desc">{c.description.substring(0, 95)}...</p>
                  {c.note && <div className="course-note">📌 {c.note}</div>}
                  <div className="course-meta">
                    <span>⏱ {c.duration}</span>
                    <span>📚 {c.levels}</span>
                  </div>
                  <div className="course-cta">{t('learn_more')}</div>
                </TiltCard>
              </AnimSection>
            ))}
          </div>
          <div className="section-cta"><Link to="/courses" className="btn-blue">{t('view_all')}</Link></div>
        </div>
      </section>

      {/* TEACHERS */}
      <section className="section bg-offwhite">
        <div className="container">
          <AnimSection><div className="section-header"><span className="section-tag blue">{t('who_teaches')}</span><h2>{t('meet_teachers')}</h2><p>{t('teachers_subtitle')}</p></div></AnimSection>
          <div className="teachers-grid-home">
            {teachers.slice(0, 4).map(teacher => (
              <AnimSection key={teacher.id}>
                <TiltCard className="teacher-home-card" onClick={() => setSelectedTeacher(teacher)} maxDeg={4}>
                  <div className="thc-img-wrap">
                    <img src={teacher.photo} alt={teacher.name} className="thc-img" loading="lazy" />
                  </div>
                  <div className="thc-body">
                    <h3>{teacher.name}</h3>
                    <p className="thc-subject">{teacher.subject}</p>
                    <p className="thc-exp">🏆 {teacher.experience}</p>
                    <p className="thc-bio">{teacher.short_bio}</p>
                    <span className="thc-link">{t('view_profile')}</span>
                  </div>
                </TiltCard>
              </AnimSection>
            ))}
          </div>
          <div className="section-cta"><Link to="/teachers" className="btn-outline-navy">{t('all_teachers')}</Link></div>
        </div>
      </section>

      {/* WHY US */}
      <section className="section bg-navy" id="why-us">
        <div className="container">
          <AnimSection><div className="section-header light"><span className="section-tag">{t('our_advantage')}</span><h2>{t('why_choose')}</h2><p>{t('why_subtitle')}</p></div></AnimSection>
          <div className="why-grid">
            {WHY.map((item, i) => (
              <AnimSection key={i}>
                <div className="why-card">
                  <div className="why-icon">{item.icon}</div>
                  <h3>{item.title}</h3>
                  <p>{item.desc}</p>
                </div>
              </AnimSection>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS — mini teaser, full detail on /how-it-works */}
      <section className="section bg-white">
        <div className="container">
          <AnimSection><div className="section-header"><span className="section-tag">{t('hiw_tag')}</span><h2>{t('hiw_title')}</h2></div></AnimSection>
          <div className="hiw-teaser-steps">
            {[1, 2, 3, 4].map(n => (
              <div key={n} className="hiw-teaser-step">
                <span className="hiw-teaser-num">{n}</span>
                <p>{t(`hiw_step${n}`)}</p>
              </div>
            ))}
          </div>
          <div className="section-cta"><Link to="/how-it-works" className="btn-outline-navy">{t('view_how')}</Link></div>
        </div>
      </section>

      {/* RESULTS — only shown once real entries exist (added via Admin panel) */}
      {results.length > 0 && (
        <section className="section bg-offwhite">
          <div className="container">
            <AnimSection><div className="section-header"><span className="section-tag">{t('results_tag')}</span><h2>{t('results_title')}</h2><p>{t('results_subtitle')}</p></div></AnimSection>
            <div className="results-grid">
              {results.map(r => (
                <AnimSection key={r.id}>
                  <div className="result-card">
                    <div className="result-course">{r.course}</div>
                    <div className="result-value">{r.result}</div>
                    <div className="result-name">{r.name}{r.date ? ` · ${r.date}` : ''}</div>
                  </div>
                </AnimSection>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* TESTIMONIALS */}
      {testimonials.length > 0 && (
        <section className="section bg-white">
          <div className="container">
            <AnimSection><div className="section-header"><span className="section-tag">{t('student_stories')}</span><h2>{t('what_students_say')}</h2></div></AnimSection>
            <div className="testimonial-showcase">
              <div className="testimonial-quote">"</div>
              <p className="testimonial-text">{testimonials[activeTest].text}</p>
              <div className="testimonial-author">
                <div className="testimonial-av">{testimonials[activeTest].avatar}</div>
                <div>
                  <div className="testimonial-name">{testimonials[activeTest].name}</div>
                  <div className="testimonial-meta">{testimonials[activeTest].course} · {testimonials[activeTest].score}</div>
                </div>
              </div>
              <div className="testimonial-stars">{'★'.repeat(testimonials[activeTest].rating)}</div>
              <div className="testimonial-dots">
                {testimonials.map((_, i) => <button key={i} className={`dot ${i === activeTest ? 'active' : ''}`} onClick={() => setActiveTest(i)} />)}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* FAQ — mini teaser, full list on /faq */}
      <section className="section bg-navy">
        <div className="container">
          <AnimSection><div className="section-header light"><span className="section-tag">{t('faq_tag')}</span><h2>{t('faq_title')}</h2></div></AnimSection>
          <div className="faq-teaser-grid">
            {[1, 2, 3, 4].map(n => (
              <div key={n} className="faq-teaser-item">
                <strong>{t(`faq_q${n}`)}</strong>
                <p>{t(`faq_a${n}`)}</p>
              </div>
            ))}
          </div>
          <div className="section-cta"><Link to="/faq" className="btn-outline-white">{t('view_faq')}</Link></div>
        </div>
      </section>

      {/* TRIAL LESSON — what the brief asks us to spell out before the form */}
      <section className="section bg-white">
        <div className="container">
          <AnimSection>
            <div className="section-header">
              <span className="section-tag">{t('trial_tag')}</span>
              <h2>{t('trial_title')}</h2>
              <p>{t('trial_subtitle')}</p>
            </div>
          </AnimSection>
          <div className="trial-grid">
            {TRIAL.map((item, i) => (
              <AnimSection key={i}>
                <div className="trial-card">
                  <span className="trial-num">{String(i + 1).padStart(2, '0')}</span>
                  <p>{item}</p>
                </div>
              </AnimSection>
            ))}
          </div>
          <div className="section-cta">
            <button className="btn-primary" onClick={() => scrollToApply('trial')}>{t('hero_btn1')}</button>
          </div>
        </div>
      </section>

      {/* APPLY FORM */}
      <section className="section bg-offwhite" id="apply">
        <div className="container">
          <div className="apply-wrapper">
            <div className="apply-left">
              <span className="section-tag">{t('get_started')}</span>
              <h2>{t('ready_to')}</h2>
              <p>{formData.purpose === 'level_check' ? t('apply_subtitle_level') : t('apply_subtitle_trial')}</p>
              <div className="apply-perks">
                <div className="perk">✓ {t('perk1')}</div>
                <div className="perk">✓ {t('perk2')}</div>
                <div className="perk">✓ {t('perk3')}</div>
              </div>
            </div>
            <form className="apply-form" onSubmit={handleSubmit}>
              <div className="form-group"><label>{t('your_name')}</label><input type="text" placeholder={t('name_placeholder')} value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} /></div>
              <div className="apply-form-row">
                <div className="form-group"><label>{t('phone_number')}</label><input type="tel" placeholder={t('phone_placeholder')} value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} /></div>
                <div className="form-group"><label>{t('your_age')}</label><input type="number" min="1" max="120" placeholder={t('age_placeholder')} value={formData.age} onChange={e => setFormData({ ...formData, age: e.target.value })} /></div>
              </div>
              <div className="form-group"><label>{t('telegram_label')}</label><input type="text" placeholder={t('telegram_placeholder')} value={formData.telegram} onChange={e => setFormData({ ...formData, telegram: e.target.value })} /></div>
              <div className="form-group"><label>{t('select_course')}</label>
                <select value={formData.course} onChange={e => setFormData({ ...formData, course: e.target.value })}>
                  <option value="">{t('select_course')}</option>
                  {courses.map(c => <option key={c.id} value={c.title}>{c.title}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>{t('format_label')}</label>
                <select value={formData.format} onChange={e => setFormData({ ...formData, format: e.target.value })}>
                  <option value="">{t('format_label')}</option>
                  <option value="group">{t('format_group')}</option>
                  <option value="individual">{t('format_individual')}</option>
                </select>
              </div>
              <div className="apply-form-row">
                <div className="form-group"><label>{t('days_label')}</label><input type="text" placeholder={t('days_placeholder')} value={formData.days} onChange={e => setFormData({ ...formData, days: e.target.value })} /></div>
                <div className="form-group"><label>{t('time_label')}</label><input type="text" placeholder={t('time_placeholder')} value={formData.time} onChange={e => setFormData({ ...formData, time: e.target.value })} /></div>
              </div>
              <div className="form-group"><label>{t('message_opt')}</label><textarea placeholder={t('msg_placeholder')} rows={3} value={formData.message} onChange={e => setFormData({ ...formData, message: e.target.value })} /></div>
              {formStatus === 'success' && <div className="form-success">{t('form_success')}</div>}
              {formStatus === 'error' && <div className="form-error">{t('form_error')}</div>}
              <button type="submit" className="btn-primary full-width">{t('send_app')}</button>
            </form>
          </div>
        </div>
      </section>

      {/* TEACHER MODAL */}
      {selectedTeacher && (
        <div className="modal-overlay" onClick={() => setSelectedTeacher(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedTeacher(null)}>✕</button>
            <div className="modal-teacher-header">
              <img src={selectedTeacher.photo} alt={selectedTeacher.name} className="modal-teacher-photo" loading="lazy" />
              <div>
                <h2>{selectedTeacher.name}</h2>
                <p className="modal-subject">{selectedTeacher.subject}</p>
                <p className="modal-exp">🏆 {selectedTeacher.experience}</p>
                <p className="modal-edu">🎓 {selectedTeacher.education}</p>
              </div>
            </div>
            <p className="modal-bio">{selectedTeacher.full_bio}</p>
            <div className="modal-tags-section"><h4>{t('certifications')}</h4><div className="modal-tags">{selectedTeacher.certifications.map((c,i) => <span key={i} className="tag">{c}</span>)}</div></div>
            {/* Achievements intentionally hidden until verified real data is entered via Admin panel — see backend/ARCHITECTURE.md */}
            <button className="btn-primary" onClick={() => { setSelectedTeacher(null); document.getElementById('apply')?.scrollIntoView({ behavior: 'smooth' }); }}>
              {t('enroll_in')} {selectedTeacher.name.split(' ')[0]}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
