import React, { createContext, useContext, useState } from 'react';
import { useT } from '../i18n';

const LangContext = createContext();

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('skillup_lang') || 'en');
  const changeLang = (l) => { setLang(l); localStorage.setItem('skillup_lang', l); };
  const t = useT(lang);
  return <LangContext.Provider value={{ lang, setLang: changeLang, t }}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);
