import React, { createContext, useContext, useEffect, useState } from 'react';
import { useT } from '../i18n';

const LangContext = createContext();

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('skillup_lang') || 'en');
  const changeLang = (l) => { setLang(l); localStorage.setItem('skillup_lang', l); };
  // Keep <html lang> in step with the chosen language. Without this the page
  // claims to be English while showing Russian or Uzbek, and Chrome's built-in
  // Google Translate steps in and rewrites the copy — the slogan included.
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const t = useT(lang);
  return <LangContext.Provider value={{ lang, setLang: changeLang, t }}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);
