import React, { createContext, useState, useEffect } from 'react';
import { translations } from '../utils/translations';
import { api } from '../api/client';
import { offlineDb } from '../utils/offlineDb';
import { toast } from 'react-toastify';

export const UIContext = createContext();

export const UIProvider = ({ children }) => {
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const [language, setLanguage] = useState(localStorage.getItem('language') || 'en');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      // Double check internet access with a quick request
      api.get('/settings/dailyGoal')
        .then(() => setIsOnline(true))
        .catch(() => setIsOnline(false));
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Keep verifying connectivity every 30 seconds
    const interval = setInterval(() => {
      if (navigator.onLine) {
        api.get('/settings/dailyGoal')
          .then(() => setIsOnline(true))
          .catch(() => setIsOnline(false));
      } else {
        setIsOnline(false);
      }
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const syncOfflineData = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const precalls = await offlineDb.getOfflinePrecalls();
      if (precalls.length > 0) {
        for (const precall of precalls) {
          const tempSerial = precall.serialNumber;
          try {
            const res = await api.post('/agent/precall-complete', {
              surveyId: precall.surveyId,
              payload: precall.payload,
              interviewStartedAt: precall.interviewStartedAt,
              interviewDate: precall.interviewDate,
              interviewStartDisplay: precall.interviewStartDisplay,
            });
            const realSerial = res.data?.serialNumber;

            // Update matching responses with real serial from server
            if (realSerial && tempSerial && tempSerial.startsWith('OFFLINE-')) {
              const responses = await offlineDb.getOfflineResponses();
              for (const resp of responses) {
                if (resp.serialNumber === tempSerial) {
                  resp.serialNumber = realSerial;
                  if (resp.precallSerialNumber === tempSerial) {
                    resp.precallSerialNumber = realSerial;
                  }
                  await offlineDb.saveOfflineResponse(resp);
                }
              }
            }
            await offlineDb.deleteOfflinePrecall(tempSerial);
          } catch (err) {
            console.error('Failed to sync precall:', tempSerial, err);
          }
        }
      }

      const responses = await offlineDb.getOfflineResponses();
      if (responses.length > 0) {
        for (const resp of responses) {
          try {
            await api.post('/response', {
              ...resp,
              isOfflineSync: true,
            });
            await offlineDb.deleteOfflineResponse(resp.serialNumber);
          } catch (err) {
            console.error('Failed to sync response:', resp.serialNumber, err);
          }
        }
        toast.success(translations[language]['syncCompleted'] || 'Offline responses successfully synchronized!');
      }
    } catch (err) {
      console.error('Offline sync failed:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (isOnline) {
      syncOfflineData();
    }
  }, [isOnline]);

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
    <UIContext.Provider value={{ theme, setTheme, language, setLanguage, toggleTheme, t, isOnline, syncOfflineData }}>
      {children}
    </UIContext.Provider>
  );
};

