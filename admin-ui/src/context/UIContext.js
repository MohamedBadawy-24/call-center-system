import React, { createContext, useState, useEffect } from 'react';
import { translations } from '../utils/translations';

export const UIContext = createContext();

export const UIProvider = ({ children }) => {
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const [language, setLanguage] = useState(localStorage.getItem('language') || 'en');

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('language', language);
    document.documentElement.setAttribute('lang', language);
    document.documentElement.setAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
  }, [language]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const t = (key) => {
    return translations[language][key] || key;
  };

  return (
    <UIContext.Provider value={{ theme, setTheme, language, setLanguage, toggleTheme, t }}>
      {children}
    </UIContext.Provider>
  );
};
