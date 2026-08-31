import { useEffect } from 'react';

const SITE_NAME = 'SkillUp Academy';

function setMeta(attr, key, content) {
  if (!content) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

// Lightweight per-page SEO: sets document.title + description + Open Graph tags.
// No new dependency (react-helmet) — direct DOM writes on route change.
export function useSEO(title, description, ogImage, noIndex = false) {
  useEffect(() => {
    const fullTitle = title ? `${title} — ${SITE_NAME}` : SITE_NAME;
    document.title = fullTitle;
    if (description) setMeta('name', 'description', description);
    setMeta('property', 'og:title', fullTitle);
    if (description) setMeta('property', 'og:description', description);
    setMeta('property', 'og:type', 'website');
    setMeta('property', 'og:site_name', SITE_NAME);
    if (ogImage) setMeta('property', 'og:image', ogImage);
    setMeta('property', 'og:url', window.location.href);
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'robots', noIndex ? 'noindex, nofollow' : 'index, follow');
  }, [title, description, ogImage, noIndex]);
}
