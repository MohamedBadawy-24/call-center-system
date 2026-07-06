import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

/**
 * useSurveyNumbers — Manages the phone numbers list, stats, and governorate filter
 * for the Survey Builder settings tab.
 *
 * @param {string|null} surveyId - The survey ID
 * @param {string} activeTab - The currently active builder tab
 * @returns {{ numbers, setNumbers, numbersStats, setNumbersStats, numbersGovFilter, setNumbersGovFilter, loadNumbers, numbersLoading }}
 */
export function useSurveyNumbers(surveyId, activeTab) {
  const [numbers, setNumbers] = useState([]);
  const [numbersStats, setNumbersStats] = useState({ total: 0, pending: 0, called: 0, qualified: 0, disqualified: 0 });
  const [numbersGovFilter, setNumbersGovFilter] = useState('All');
  const [numbersLoading, setNumbersLoading] = useState(false);

  const loadNumbers = useCallback(async () => {
    if (!surveyId) return;
    setNumbersLoading(true);
    try {
      const res = await api.get(`/admin/survey/${surveyId}/numbers?governorate=${numbersGovFilter}`);
      if (Array.isArray(res.data)) {
        setNumbers(res.data);
      } else {
        setNumbers(res.data.list || []);
        setNumbersStats(res.data.stats || { total: 0, qualified: 0, disqualified: 0 });
      }
    } catch (e) {
      console.error('Numbers load error:', e);
    } finally {
      setNumbersLoading(false);
    }
  }, [surveyId, numbersGovFilter]);

  useEffect(() => {
    if (surveyId && activeTab === 'settings') loadNumbers();
  }, [surveyId, loadNumbers, activeTab]);

  return {
    numbers, setNumbers,
    numbersStats, setNumbersStats,
    numbersGovFilter, setNumbersGovFilter,
    loadNumbers, numbersLoading
  };
}
