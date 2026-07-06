import React, { createContext } from 'react';
import { useTheme } from '../hooks/useTheme';
import { useLanguage } from '../hooks/useLanguage';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const UIContext = createContext();

export const UIProvider = ({ children }) => {
  const { theme, setTheme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const { isOnline, syncOfflineData } = useOnlineStatus(language);

  return (
    <UIContext.Provider value={{ theme, setTheme, language, setLanguage, toggleTheme, t, isOnline, syncOfflineData }}>
      {children}
    </UIContext.Provider>
  );
};
