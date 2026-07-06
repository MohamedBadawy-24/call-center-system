import { useState, useEffect, useCallback } from 'react';
import { translations } from '../utils/translations';

/**
 * useLanguage — Manages language state, syncs `lang` and `dir` attributes on <html>,
 * and provides the `t(key)` translation function.
 *
 * @returns {{ language, setLanguage, t }}
 */
export function useLanguage() {
  const [language, setLanguage] = useState(localStorage.getItem('language') || 'en');

  useEffect(() => {
    localStorage.setItem('language', language);
    document.documentElement.setAttribute('lang', language);
    document.documentElement.setAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
  }, [language]);

  const t = useCallback((key) => {
    return translations[language][key] || key;
  }, [language]);

  return { language, setLanguage, t };
}
