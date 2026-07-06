import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { toast } from 'react-toastify';
import { getDefaultOutboundClone, normalizeOutboundPrecall, hasStoredOutboundCustom } from '../utils/outboundPrecallConfig';
import { useNavigate } from 'react-router-dom';

/**
 * flattenSections — Expands group items into individual tagged questions.
 */
const flattenSections = (sections) => {
  if (!sections) return [];
  return sections.map(sec => ({
    ...sec,
    questions: (sec.questions || []).flatMap(item => {
      if (item.type === 'group') {
        return (item.questions || []).map(q => ({
          ...q,
          questionId: q.questionId || String(q._id),
          _groupId: item.groupId,
          _groupLabel: item.label
        }));
      }
      return [{
        ...item,
        questionId: item.questionId || String(item._id)
      }];
    })
  }));
};

/**
 * serializeSections — Reconstitutes group structures from flat tagged questions.
 */
const serializeSections = (sections) => {
  if (!sections) return [];
  return sections.map(sec => {
    const nestedQuestions = [];
    const seenGroupIds = new Set();

    (sec.questions || []).forEach(q => {
      if (q._groupId) {
        if (!seenGroupIds.has(q._groupId)) {
          seenGroupIds.add(q._groupId);
          const groupQs = sec.questions.filter(item => item._groupId === q._groupId);
          nestedQuestions.push({
            type: 'group',
            groupId: q._groupId,
            label: q._groupLabel,
            questions: groupQs.map(({ _groupId, _groupLabel, ...rest }) => rest)
          });
        }
      } else {
        nestedQuestions.push(q);
      }
    });

    return {
      ...sec,
      questions: nestedQuestions
    };
  });
};

/**
 * useSurveyBuilderState — Manages survey builder state with undo/redo,
 * loading from API, draft autosave, and publish.
 *
 * @param {string|null} surveyId - The survey ID being edited (null for new)
 * @param {boolean} isAdmin - Whether the current user is an admin
 * @returns {{ surveyState, updateState, loading, undo, redo, history, future, hasDraft, isSaving, publish }}
 */
export function useSurveyBuilderState(surveyId, isAdmin) {
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
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
    sections: [{ title: 'Main Section', questions: [] }],
    groups: []
  });

  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);

  // Load survey data from API
  useEffect(() => {
    if (surveyId) {
      api.get(`/survey/${surveyId}`).then(res => {
        const root = res.data;
        const draft = res.data.draftData;
        if (draft) setHasDraft(true);

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
          sections: flattenSections(sections),
          groups: draft?.groups ?? root.groups ?? [],
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
  useEffect(() => {
    if (!surveyId || !isAdmin || loading) return;
    const t = setTimeout(() => {
      const draftPayload = {
        title: surveyState.title,
        sections: serializeSections(surveyState.sections),
        outboundPrecall: surveyState.customizeOutbound ? surveyState.outboundConfig : null,
        layoutMode: surveyState.layoutMode,
        groups: surveyState.groups || [],
        numberAssignmentMode: surveyState.numberAssignmentMode,
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
        sections: serializeSections(surveyState.sections),
        layoutMode: surveyState.layoutMode,
        governorateGoals: surveyState.governorateGoals,
        outboundPrecall: surveyState.customizeOutbound ? surveyState.outboundConfig : null,
        groups: surveyState.groups || [],
        numberAssignmentMode: surveyState.numberAssignmentMode,
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

  return { surveyState, updateState, loading, undo, redo, history, future, hasDraft, isSaving, publish };
}
