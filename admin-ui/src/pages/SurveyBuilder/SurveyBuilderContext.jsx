import React, { createContext, useState, useEffect, useCallback, useContext } from 'react';
import { api } from '../../api/client';
import { toast } from 'react-toastify';
import { getDefaultOutboundClone, normalizeOutboundPrecall, hasStoredOutboundCustom } from '../../utils/outboundPrecallConfig';
import { AuthContext } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export const SurveyBuilderContext = createContext();

export function SurveyBuilderProvider({ children, surveyId }) {
  const { user } = useContext(AuthContext);
  const isAdmin = user?.role === 'admin';
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('settings'); // settings, precall, builder, preview
  const [hasDraft, setHasDraft] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [surveyState, setSurveyState] = useState({
    title: '',
    isActive: true,
    goal: 0,
    targetGovernorate: 'All',
    governorateGoals: [],
    layoutMode: 'single',
    outboundConfig: getDefaultOutboundClone(),
    customizeOutbound: false,
    sections: [{ title: 'Main Section', questions: [] }]
  });

  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  
  const [numbers, setNumbers] = useState([]);
  const [numbersStats, setNumbersStats] = useState({ total: 0, pending: 0, called: 0, qualified: 0, disqualified: 0 });
  const [numbersGovFilter, setNumbersGovFilter] = useState('All');
  const [numbersLoading, setNumbersLoading] = useState(false);

  useEffect(() => {
    if (surveyId) {
      api.get(`/survey/${surveyId}`).then(res => {
        // Root-level fields (isActive, goal, targetGovernorate, governorateGoals) MUST
        // always come from res.data (the DB record), never from draftData.
        // draftData only holds sections, outboundPrecall, and title for draft editing.
        const root = res.data;
        const draft = res.data.draftData;
        if (draft) setHasDraft(true);

        // For sections, outboundPrecall, and title: prefer draft if present
        const sections = draft?.sections?.length > 0
          ? draft.sections
          : root.sections?.length > 0 ? root.sections : [{ title: 'Main Section', questions: [] }];
        const outboundPrecall = draft?.outboundPrecall ?? root.outboundPrecall;
        const title = draft?.title ?? root.title ?? '';
        const layoutMode = draft?.layoutMode ?? root.layoutMode ?? 'single';

        setSurveyState({
          title,
          isActive: root.isActive !== false,
          goal: root.goal || 0,
          targetGovernorate: root.targetGovernorate || 'All',
          governorateGoals: root.governorateGoals || [],
          layoutMode,
          outboundConfig: normalizeOutboundPrecall(outboundPrecall),
          customizeOutbound: hasStoredOutboundCustom(outboundPrecall),
          sections,
        });
        setHistory([]);
        setFuture([]);
      }).catch(console.error).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [surveyId]);

  const updateState = useCallback((updater) => {
    setSurveyState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
      setHistory(h => {
        const newHistory = [...h, prev];
        if (newHistory.length > 30) newHistory.shift();
        return newHistory;
      });
      setFuture([]);
      return next;
    });
  }, []);

  const undo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setFuture(f => [surveyState, ...f]);
    setSurveyState(prev);
    setHistory(h => h.slice(0, -1));
  };

  const redo = () => {
    if (future.length === 0) return;
    const next = future[0];
    setHistory(h => [...h, surveyState]);
    setSurveyState(next);
    setFuture(f => f.slice(1));
  };

  // Draft Autosave
  // IMPORTANT: autosave payload must match the backend schema.
  // surveyState uses `outboundConfig` (frontend key) but the DB field is `outboundPrecall`.
  // We serialize correctly here so draftData can be rehydrated without field-name desync.
  useEffect(() => {
    if (!surveyId || !isAdmin || loading) return;
    const t = setTimeout(() => {
      const draftPayload = {
        title: surveyState.title,
        sections: surveyState.sections,
        outboundPrecall: surveyState.customizeOutbound ? surveyState.outboundConfig : null,
        layoutMode: surveyState.layoutMode,
      };
      api.put(`/survey/${surveyId}/autosave`, draftPayload)
         .then(() => setHasDraft(true))
         .catch(err => console.error("Autosave failed", err));
    }, 5000);
    return () => clearTimeout(t);
  }, [surveyState, surveyId, isAdmin, loading]);

  const publish = async () => {
    setIsSaving(true);
    try {
      const payload = {
        title: surveyState.title,
        isActive: surveyState.isActive,
        goal: surveyState.goal,
        targetGovernorate: surveyState.targetGovernorate,
        introScript: '',
        sections: surveyState.sections,
        layoutMode: surveyState.layoutMode,
        governorateGoals: surveyState.governorateGoals,
        outboundPrecall: surveyState.customizeOutbound ? surveyState.outboundConfig : null,
      };

      if (surveyId && surveyState.isActive) {
        delete payload.sections;
      }
      
      if (surveyId) {
        await api.put(`/survey/${surveyId}`, payload);
      } else {
        await api.post('/survey', payload);
      }

      toast.success('Survey saved successfully!');
      setHasDraft(false);
      navigate('/admin');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error saving survey');
    } finally {
      setIsSaving(false);
    }
  };

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

  return (
    <SurveyBuilderContext.Provider value={{
      surveyId, isAdmin, loading, activeTab, setActiveTab,
      surveyState, updateState, history, future, undo, redo,
      hasDraft, isSaving, publish,
      numbers, setNumbers, numbersStats, setNumbersStats, 
      numbersGovFilter, setNumbersGovFilter, loadNumbers, numbersLoading
    }}>
      {children}
    </SurveyBuilderContext.Provider>
  );
}
