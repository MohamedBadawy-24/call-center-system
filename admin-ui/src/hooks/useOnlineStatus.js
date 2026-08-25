import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { offlineDb } from '../utils/offlineDb';
import { translations } from '../utils/translations';
import { toast } from 'react-toastify';

/**
 * useOnlineStatus — Tracks browser connectivity, verifies with an API ping every 30s,
 * and provides an offline-data sync function that pushes queued precalls and responses.
 *
 * @param {string} language - Current language code for toast messages
 * @returns {{ isOnline, syncOfflineData }}
 */
export function useOnlineStatus(language) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const checkPing = () => {
      api.get('/health')
        .then(() => setIsOnline(true))
        .catch((err) => {
          if (!err.response) {
            setIsOnline(false);
          }
        });
    };

    const handleOnline = () => checkPing();
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Keep verifying connectivity every 30 seconds
    const interval = setInterval(() => {
      if (navigator.onLine) {
        checkPing();
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
        const lang = language || 'en';
        const msg = (translations[lang] && translations[lang]['syncCompleted']) || translations['en']?.['syncCompleted'] || 'Offline responses successfully synchronized!';
        toast.success(msg);
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

  return { isOnline, syncOfflineData };
}
