import { useState, useEffect } from 'react';

/**
 * useTheme — Manages theme state and syncs the `data-theme` attribute on <html>.
 *
 * @returns {{ theme, setTheme, toggleTheme }}
 */
export function useTheme() {
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  return { theme, setTheme, toggleTheme };
}
