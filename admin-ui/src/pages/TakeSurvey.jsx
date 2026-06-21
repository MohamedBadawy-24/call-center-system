import React, { useState, useEffect, useContext, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { AuthContext } from '../context/AuthContext';
import { UIContext } from '../context/UIContext';
import { toast } from 'react-toastify';
import { INTERVIEW_OUTCOME_OPTIONS, evaluateCondition } from '../utils/outboundPrecallConfig';
import HandoverModal from '../components/HandoverModal';
import { UserPlus, Menu, ChevronLeft, ChevronRight, Save, PhoneOff, AlertTriangle, ChevronDown } from 'lucide-react';
import SectionedSurveyView from '../components/SectionedSurveyView';
import { offlineDb } from '../utils/offlineDb';

class DebugErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("SURVEY CRASH:", error);
    console.error("COMPONENT STACK:", info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '2rem', color: 'red', fontFamily: 'monospace' }}>
          <h2>Survey Render Error (debug only)</h2>
          <pre>{this.state.error?.message}</pre>
          <pre>{this.state.error?.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function TakeSurvey({ mockSurvey }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, setUser } = useContext(AuthContext);
  const { t, language, isOnline } = useContext(UIContext);
  const isRtl = language === 'ar';
  const [survey, setSurvey] = useState(null);

  const [questions, setQuestions] = useState([]);
  /** intro | questions | interview */
  const [phase, setPhase] = useState('intro');
  const [answers, setAnswers] = useState({});
  const [otherValues, setOtherValues] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [startTime, setStartTime] = useState(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [currentSectionIdx, setCurrentSectionIdx] = useState(0);
  const [precallSerialNumber, setPrecallSerialNumber] = useState('');
  const [eligibility, setEligibility] = useState({ checked: false, canStart: false, reason: '' });
  const [eligLoading, setEligLoading] = useState(true);
  const [isHandoverOpen, setIsHandoverOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showEndCallConfirm, setShowEndCallConfirm] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [defaultOpenSectionIdx, setDefaultOpenSectionIdx] = useState(0);
  const [openSections, setOpenSections] = useState({});

  const [interactedQuestions, setInteractedQuestions] = useState(new Set());
  // Ref mirrors the Set synchronously so canProceedFromQuestion never reads a
  // stale closure value when called inside a setTimeout (e.g. auto-advance on
  // single-choice click).
  const interactedRef = useRef(new Set());
  const [showInteractionError, setShowInteractionError] = useState(false);

  const markInteracted = (questionId) => {
    // Write to the ref immediately — visible to all closures right now.
    interactedRef.current.add(questionId);
    // Also update state so the UI re-renders when needed.
    setInteractedQuestions(prev => {
      const next = new Set(prev);
      next.add(questionId);
      return next;
    });
    setShowInteractionError(false);
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const hasSerialParam = !!urlParams.get('serial');
    if (
      !hasSerialParam &&
      user?.role === 'agent' &&
      user?.currentStatus === 'active' &&
      user?.precallCompletedForActiveSession !== true
    ) {
      navigate(`/agent/precall?surveyId=${id}`, { replace: true });
    }
  }, [navigate, user?.currentStatus, user?.precallCompletedForActiveSession, user?.role, id]);

  useEffect(() => {
    if (mockSurvey) {
      setSurvey(mockSurvey);
      let allQ = [];
      if (mockSurvey.sections) {
        mockSurvey.sections.forEach((sec) => {
          allQ = allQ.concat(sec.questions);
        });
      }
      setQuestions(allQ);
      return;
    }

    if (id) {
      const loadSurvey = async () => {
        let surveyData = null;
        if (isOnline) {
          try {
            const res = await api.get(`/survey/${id}`);
            surveyData = res.data;
            await offlineDb.saveSurveyDef(surveyData);
          } catch (err) {
            console.error("Network survey fetch failed, checking offline cache...", err);
          }
        }

        if (!surveyData) {
          surveyData = await offlineDb.getSurveyDef(id);
          if (surveyData) {
            toast.info(t('loadedSurveyFromCache') || 'Loaded survey structure from local offline cache.');
          }
        }

        if (surveyData) {
          setSurvey(surveyData);
          let allQ = [];
          if (surveyData.sections) {
            surveyData.sections.forEach((sec) => {
              allQ = allQ.concat(sec.questions);
            });
          } else if (surveyData.questions) {
            allQ = surveyData.questions;
          }
          setQuestions(allQ);
        } else {
          toast.error(t('surveyLoadFailed') || 'Failed to load survey structure.');
        }
      };

      loadSurvey();
    }
  }, [id, mockSurvey]);

  const refreshEligibility = async () => {
    if (mockSurvey) {
      setEligibility({ checked: true, canStart: true, reason: '' });
      setPrecallSerialNumber('PREVIEW_123');
      return { canStartSurvey: true, precallSerialNumber: 'PREVIEW_123' };
    }
    
    setEligLoading(true);
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const serialParam = urlParams.get('serial');

      if (isOnline) {
        const res = await api.get(`/agent/survey-eligibility?surveyId=${id}${serialParam ? `&serial=${serialParam}` : ''}`);
        const data = res.data;
        setEligibility({
          checked: true,
          canStart: data.canStartSurvey,
          reason: data.reason || '',
        });
        setPrecallSerialNumber(data.precallSerialNumber || '');
        return data;
      } else {
        if (serialParam) {
          const offlinePrecalls = await offlineDb.getOfflinePrecalls();
          const offlinePrecall = offlinePrecalls.find(p => p.serialNumber === serialParam);
          if (offlinePrecall || serialParam.startsWith('OFFLINE-') || serialParam) {
            const data = { canStartSurvey: true, precallSerialNumber: serialParam, payload: offlinePrecall?.payload || {} };
            setEligibility({
              checked: true,
              canStart: true,
              reason: '',
            });
            setPrecallSerialNumber(serialParam);
            return data;
          }
        }
        setEligibility({ checked: true, canStart: false, reason: 'offline_no_serial' });
        return { canStartSurvey: false, reason: 'offline_no_serial' };
      }
    } catch (e) {
      console.error(e);
      setEligibility({ checked: true, canStart: false, reason: 'error' });
      return null;
    } finally {
      setEligLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'agent' && user?.currentStatus === 'active') {
      refreshEligibility().then(async (data) => {
        if (data?.canStartSurvey && data?.precallSerialNumber) {
          try {
            let draftData = null;
            if (isOnline) {
              try {
                const draftRes = await api.get(`/agent/draft/${data.precallSerialNumber}`);
                draftData = draftRes.data;
              } catch (e) {
                console.error("Network draft fetch failed, trying localIndexedDB...");
              }
            }
            if (!draftData) {
              draftData = await offlineDb.getLocalDraft(data.precallSerialNumber);
            }
            if (draftData && draftData.answers && Object.keys(draftData.answers).length > 0) {
              handleStartCall(data, draftData);
            }
          } catch(e) {}
        }
      });
    }
  }, [user?.role, user?.currentStatus, user?.precallCompletedForActiveSession, isOnline]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (phase === 'questions' || phase === 'interview') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [phase]);

  // Persist answers to API as they change
  useEffect(() => {
    if (mockSurvey) return; // Disable autosave for preview mode
    
    if (phase === 'questions' && user?.id && precallSerialNumber) {
      const cleanedAnswers = { ...answers };
      questions.forEach(qst => {
        const qId = qst.questionId || String(qst._id);
        if (qst.allowMultipleOther && cleanedAnswers[qId] && Array.isArray(cleanedAnswers[qId])) {
          cleanedAnswers[qId] = cleanedAnswers[qId].filter(v => typeof v !== 'string' || !v.startsWith('other:') || v.substring(6).trim() !== '');
          if (cleanedAnswers[qId].length === 0 && qst.type === 'single_choice') {
             delete cleanedAnswers[qId];
          }
        }
      });
      const draftData = {
        surveyId: id,
        serialNumber: precallSerialNumber,
        answers: cleanedAnswers,
        otherValues,
        currentIdx,
        currentSectionIdx: survey?.layoutMode === 'multi' ? currentSectionIdx : undefined,
      };
      
      const timeoutId = setTimeout(() => {
        if (isOnline) {
          api.post('/agent/draft', draftData)
            .then(() => setLastSaved(new Date()))
            .catch(async () => {
              await offlineDb.saveLocalDraft(draftData);
              setLastSaved(new Date());
            });
        } else {
          offlineDb.saveLocalDraft(draftData)
            .then(() => setLastSaved(new Date()));
        }
      }, 1000);
      
      return () => clearTimeout(timeoutId);
    }
  }, [answers, currentIdx, currentSectionIdx, phase, user?.id, id, precallSerialNumber, isOnline, survey?.layoutMode]);

  const handleStartCall = async (preloadedData = null, preloadedDraft = null) => {
    if (questions.length === 0) {
      toast.error('This survey has no questions!');
      return;
    }
    // Ignore synthetic React events passed from direct onClick binding
    const actualPreloaded = (preloadedData && (preloadedData.nativeEvent || preloadedData.target || typeof preloadedData.preventDefault === 'function')) ? null : preloadedData;
    const data = actualPreloaded || await refreshEligibility();
    if (!data?.canStartSurvey) {
      if (data?.reason === 'under_18' || data?.reason === 'under_18_not_qualified') {
        toast.error(t('under18CannotStartSurvey'));
      } else {
        toast.error(t('cannotStartSurveyGeneric'));
      }
      return;
    }

    setPrecallSerialNumber(data.precallSerialNumber || '');
    setStartTime(Date.now());
    
    // Merge pre-call answers AND existing survey answers so visibility logic and state are correct
    const initialAnswers = { 
      ...(data.payload || {}),
      ...(data.existingAnswers || {})
    };
    
    let draftAnswers = {};
    let draftIdx = null;
    let draftSecIdx = null;

    if (preloadedDraft) {
      draftAnswers = preloadedDraft.answers || {};
      draftIdx = preloadedDraft.currentIdx;
      draftSecIdx = preloadedDraft.currentSectionIdx;
    } else if (data?.precallSerialNumber) {
      try {
        let draftResData = null;
        if (isOnline) {
          try {
            const draftRes = await api.get(`/agent/draft/${data.precallSerialNumber}`);
            draftResData = draftRes.data;
          } catch (_) {}
        }
        if (!draftResData) {
          draftResData = await offlineDb.getLocalDraft(data.precallSerialNumber);
        }
        if (draftResData && draftResData.answers) {
          draftAnswers = draftResData.answers;
          if (draftResData.otherValues) setOtherValues(draftResData.otherValues);
          draftIdx = draftResData.currentIdx;
          draftSecIdx = draftResData.currentSectionIdx;
        }
      } catch (_) { /* ignore */ }
    }

    const mergedAnswers = { ...initialAnswers, ...draftAnswers };
    setAnswers(mergedAnswers);

    if (draftAnswers) {
      const preloaded = new Set(Object.keys(draftAnswers).filter(k => draftAnswers[k] !== '' && draftAnswers[k] !== null));
      interactedRef.current = preloaded;
      setInteractedQuestions(preloaded);
    }

    const firstIdx = findNextVisibleIdx(0, mergedAnswers);
    if (firstIdx === -1) {
      goToInterviewStep();
    } else {
      setPhase('questions');
      if (typeof draftIdx === 'number' && draftIdx < (questions?.length || 0)) {
        setCurrentIdx(draftIdx);
        if (typeof draftSecIdx === 'number') {
          setCurrentSectionIdx(draftSecIdx);
        } else if (survey?.sections) {
          const qId = questions[draftIdx]?.questionId || String(questions[draftIdx]?._id);
          const secIdx = survey.sections.findIndex(sec =>
            (sec.questions || []).some(q => (q.questionId || String(q._id)) === qId)
          );
          if (secIdx !== -1) {
            setCurrentSectionIdx(secIdx);
          }
        }
      } else {
        setCurrentIdx(firstIdx);
        if (survey?.sections) {
          const qId = questions[firstIdx]?.questionId || String(questions[firstIdx]?._id);
          const secIdx = survey.sections.findIndex(sec =>
            (sec.questions || []).some(q => (q.questionId || String(q._id)) === qId)
          );
          if (secIdx !== -1) {
            setCurrentSectionIdx(secIdx);
          }
        }
      }
    }
  };

  const findNextVisibleIdx = (startIndex, currentAnswers) => {
    if (!Array.isArray(questions)) return -1;
    for (let i = startIndex; i < questions.length; i++) {
      const qst = questions[i];
      if (!qst) continue;
      if (!qst.visibility) return i;
      try {
        if (evaluateCondition(qst.visibility, currentAnswers || {})) return i;
      } catch (err) {
        console.error("Condition evaluation error at index", i, err);
        // If visibility logic fails, we show the question to avoid blocking the survey
        return i;
      }
    }
    return -1;
  };

  const goToInterviewStep = () => {
    setPhase('interview');
  };

  const submitResponse = async () => {
    if (mockSurvey) {
      toast.success("Preview submitted successfully!");
      return;
    }

    const finalOutcome = answers.interview_result;
    if (!finalOutcome) {
      toast.error(t('mustSelectInterviewOutcome'));
      return;
    }
    const duration = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
    const finalReason = ['partial', 'refused', 'postponed'].includes(finalOutcome) 
      ? ((answers.outcome_reason || '').trim() || 'none') 
      : '';
      
    const payload = {
      surveyId: survey._id,
      durationSecs: duration,
      answers: Object.keys(answers)
        .filter((k) => {
          const qst = questions.find((q) => q.questionId === k || String(q._id) === k);
          if (!qst) return true; // Not a survey question (e.g. pre-call data)
          if (!qst.visibility) return true;
          try {
            return evaluateCondition(qst.visibility, answers);
          } catch (e) {
            return true;
          }
        })
        .map((k) => {
          const qst = questions.find((q) => q.questionId === k || String(q._id) === k);
          let val = answers[k];
          if (qst && qst.allowMultipleOther) {
             if (Array.isArray(val)) {
                val = val.filter(v => typeof v !== 'string' || !v.startsWith('other:') || v.substring(6).trim() !== '');
             }
          } else {
            if (Array.isArray(val)) {
              val = val.map(v => v === 'Other' ? `Other: ${otherValues[k] || ''}` : v);
            } else if (val === 'Other') {
              val = `Other: ${otherValues[k] || ''}`;
            }
          }
          return { questionId: k, value: val };
        }),
      interviewOutcome: finalOutcome,
      outcomeReason: finalReason,
      precallSerialNumber: precallSerialNumber || '',
    };
    const offlinePayload = {
      ...payload,
      isOfflineSync: true,
      offlineStartedAt: startTime ? new Date(startTime) : new Date(),
      offlineCompletedAt: new Date(),
    };

    if (isOnline) {
      try {
        await api.post('/response', payload);
        if (user?.id) {
          const draftKey = `precallDraft:${user.id}:${survey._id || 'default'}`;
          sessionStorage.removeItem(draftKey);
        }
        await offlineDb.deleteLocalDraft(precallSerialNumber);
        
        try {
          const me = await api.get('/auth/me');
          setUser(me.data.user);
          localStorage.setItem('user', JSON.stringify(me.data.user));
        } catch (_) {}
        toast.success(t('surveySubmittedSuccess') || 'Survey submitted successfully!');
        navigate(`/agent/precall?surveyId=${survey._id}`, { replace: true });
      } catch (err) {
        console.error(err);
        await offlineDb.saveOfflineResponse(offlinePayload);
        await offlineDb.deleteLocalDraft(precallSerialNumber);
        if (user?.id) {
          const draftKey = `precallDraft:${user.id}:${survey._id || 'default'}`;
          sessionStorage.removeItem(draftKey);
        }
        toast.info(t('surveySavedOffline') || 'Survey response saved offline. It will be synced when online.');
        navigate(`/agent/precall?surveyId=${survey._id}`, { replace: true });
      }
    } else {
      await offlineDb.saveOfflineResponse(offlinePayload);
      await offlineDb.deleteLocalDraft(precallSerialNumber);
      if (user?.id) {
        const draftKey = `precallDraft:${user.id}:${survey._id || 'default'}`;
        sessionStorage.removeItem(draftKey);
      }
      toast.info(t('surveySavedOffline') || 'Survey response saved offline. It will be synced when online.');
      navigate(`/agent/precall?surveyId=${survey._id}`, { replace: true });
    }
  };

  const OUTCOME_TKEY = {
    completed: 'precallInterviewCompleted',
    partial: 'precallInterviewPartial',
    refused: 'precallInterviewRefused',
    no_qualified: 'precallInterviewNoQualified',
    postponed: 'precallInterviewPostponed',
    not_contacted: 'precallInterviewNotContacted',
  };

  const toggleChoice = (val) => {
    const q = questions[currentIdx];
    const qId = q.questionId || `q_${currentIdx}`;
    const currArr = Array.isArray(answers[qId]) ? answers[qId] : [];
    
    if (val === 'Other' && q.allowMultipleOther) {
      const hasOther = currArr.some(v => typeof v === 'string' && v.startsWith('other:'));
      if (hasOther) {
        setAnswers({ ...answers, [qId]: currArr.filter(v => typeof v !== 'string' || !v.startsWith('other:')) });
      } else {
        setAnswers({ ...answers, [qId]: [...currArr, "other:"] });
      }
    } else {
      if (currArr.includes(val)) {
        setAnswers({ ...answers, [qId]: currArr.filter(v => v !== val) });
      } else {
        setAnswers({ ...answers, [qId]: [...currArr, val] });
      }
    }
    
    if (fieldErrors[qId]) {
      const newE = {...fieldErrors};
      delete newE[qId];
      setFieldErrors(newE);
    }
  };

  const setSingleChoice = (val, choiceLogic = null) => {
    const q = questions[currentIdx];
    const qId = q.questionId || `q_${currentIdx}`;
    
    if (val === 'Other' && q.allowMultipleOther) {
      setAnswers({ ...answers, [qId]: ["other:"] });
    } else {
      setAnswers({ ...answers, [qId]: val });
      
      // Auto-advance if no custom input is needed
      if (val !== 'Other' && (!choiceLogic || choiceLogic.action !== 'terminate')) {
         // Timeout helps UI feel responsive before jumping
         setTimeout(() => handleNextQuestion(choiceLogic, { ...answers, [qId]: val }), 150);
      }
    }
    
    if (fieldErrors[qId]) {
      const newE = {...fieldErrors};
      delete newE[qId];
      setFieldErrors(newE);
    }
  };

  const getQuestionValidationError = (q, providedAnswers = answers) => {
    const qId = q.questionId || String(q._id);
    const val = providedAnswers[qId];

    // Check if question is required
    if (q.required) {
      if (val === undefined || val === null || val === '') {
        return t('questionRequired') || 'This question requires an answer';
      }
      if (typeof val === 'string' && val.trim() === '') {
        return t('questionRequired') || 'This question requires an answer';
      }
      if (Array.isArray(val) && val.length === 0) {
        return t('questionRequired') || 'This question requires an answer';
      }
    }

    // Min selections check for multiple_choice
    if (q.type === 'multiple_choice') {
      const arr = Array.isArray(val) ? val : [];
      const validArr = arr.filter(v => !(typeof v === 'string' && v.startsWith('other:') && v.substring(6).trim() === ''));
      if (q.minSelections && validArr.length < q.minSelections) {
        return (t('selectAtLeastN') || 'Please select at least {n} options').replace('{n}', q.minSelections);
      }
      if (q.maxSelections && validArr.length > q.maxSelections) {
        return `Please select at most ${q.maxSelections} options.`;
      }
    }

    // Custom Other input validation
    const hasOtherSelected = q.allowMultipleOther
      ? (Array.isArray(val) && val.some(v => typeof v === 'string' && v.startsWith('other:')))
      : (q.type === 'multiple_choice' ? (Array.isArray(val) && val.includes('Other')) : val === 'Other');

    if (hasOtherSelected) {
      if (q.allowMultipleOther) {
        const arr = Array.isArray(val) ? val : [];
        const validOthers = arr.filter(v => typeof v === 'string' && v.startsWith('other:') && v.substring(6).trim() !== '');
        if (validOthers.length === 0) {
          return t('otherAnswerRequired') || 'Please specify the other answer';
        }
      } else {
        if (!(otherValues[qId] || '').trim()) {
          return t('otherAnswerRequired') || 'Please specify the other answer';
        }
      }
    }

    return null;
  };

  const canProceedFromQuestion = (question) => {
    const qId = question.questionId || String(question._id);
    // Exception 1: hidden by branching logic — never reached, but guard anyway
    if (!visibleQuestions[qId]) return true;

    // Exception 2: info/display type — always passable
    if (question.type === 'info') return true;

    // Exception 3: explicitly marked optional in builder
    if (question.optional === true) return true;

    // Read from the ref (not the state) to avoid stale-closure bugs when called
    // inside setTimeout callbacks (e.g. auto-advance after single-choice click).
    return interactedRef.current.has(qId);
  };

  const proceedToNext = (choiceLogic = null, providedAnswers = answers) => {
    const currentQ = questions[currentIdx];
    const qId = currentQ.questionId || String(currentQ._id);

    // Validate only the current question (existing logic)
    if (visibleQuestions[qId] !== false) {
      const err = getQuestionValidationError(currentQ, providedAnswers);
      if (err) {
        setFieldErrors(prev => ({ ...prev, [qId]: err }));
        return; // BLOCK ADVANCING
      }
    }

    setFieldErrors(prev => {
      const next = { ...prev };
      delete next[qId];
      return next;
    });

    const val = providedAnswers[qId];
    let activeChoiceLogic = choiceLogic;
    if (!activeChoiceLogic && currentQ.type === 'single_choice' && currentQ.choices) {
      const selectedChoice = currentQ.choices.find(c => c.text === val);
      if (selectedChoice?.logic) {
        activeChoiceLogic = selectedChoice.logic;
      }
    }

    if (activeChoiceLogic && activeChoiceLogic.action) {
      if (activeChoiceLogic.action === 'terminate') {
        goToInterviewStep();
        return;
      }
      if (activeChoiceLogic.action === 'skip' && activeChoiceLogic.skipToQuestionId) {
        const targetIdx = questions.findIndex((qst) => qst.questionId === activeChoiceLogic.skipToQuestionId);
        if (targetIdx !== -1) {
          const nextIdx = findNextVisibleIdx(targetIdx, providedAnswers);
          if (nextIdx !== -1) {
            setCurrentIdx(nextIdx);
          } else {
            goToInterviewStep();
          }
          return;
        }
      }
    }

    const nextIdx = findNextVisibleIdx(currentIdx + 1, providedAnswers);
    if (nextIdx !== -1) {
      setCurrentIdx(nextIdx);
    } else {
      goToInterviewStep();
    }
  };

  const handleNextQuestion = (choiceLogic = null, providedAnswers = answers) => {
    const currentQ = questions[currentIdx];
    if (!currentQ) return;

    // Step 8: Quality and admin bypass
    if (user?.role === 'quality' || user?.role === 'admin') {
      proceedToNext(choiceLogic, providedAnswers);
      return;
    }

    // Step 4: Validate interaction
    if (canProceedFromQuestion(currentQ)) {
      proceedToNext(choiceLogic, providedAnswers);
    } else {
      setShowInteractionError(true);
    }
  };

  useEffect(() => {
    setShowInteractionError(false);
  }, [currentIdx]);
  const handlePrevious = () => {
    let prevIdx = currentIdx - 1;
    while (prevIdx >= 0) {
      if (questions[prevIdx]?.visibility) {
        try {
          if (evaluateCondition(questions[prevIdx].visibility, answers)) break;
        } catch (e) {
          break; // Show if error
        }
      } else {
        break; // No visibility logic = visible
      }
      prevIdx--;
    }
    if (prevIdx >= 0) {
      setCurrentIdx(prevIdx);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (phase !== 'questions') return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'ArrowLeft') {
          if (survey?.layoutMode === 'multi') {
            handlePreviousSection();
          } else {
            handlePrevious();
          }
        }
        if (e.key === 'ArrowRight') {
          if (survey?.layoutMode === 'multi') {
            proceedToNextSection();
          } else {
            handleNextQuestion();
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIdx, currentSectionIdx, phase, answers, questions, survey?.layoutMode]);


  // ─── Hooks must be above ALL early returns (Rules of Hooks) ──────────────
  const visibleQuestions = useMemo(() => {
    const map = {};
    questions.forEach(q => {
      const qId = q.questionId || String(q._id);
      if (!q.visibility) {
        map[qId] = true;
      } else {
        try {
          map[qId] = evaluateCondition(q.visibility, answers || {});
        } catch (e) {
          map[qId] = true;
        }
      }
    });
    return map;
  }, [questions, answers]);

  const isSectionVisible = useCallback((secIdx, currentAnswers = answers) => {
    if (!survey?.sections || !survey.sections[secIdx]) return false;
    const sec = survey.sections[secIdx];
    return (sec.questions || []).some(q => {
      const qId = q.questionId || String(q._id);
      if (!q.visibility) return true;
      try {
        return evaluateCondition(q.visibility, currentAnswers);
      } catch (e) {
        return true;
      }
    });
  }, [survey, answers]);

  const visibleSectionIndices = useMemo(() => {
    const list = [];
    if (!survey?.sections) return list;
    survey.sections.forEach((_, idx) => {
      if (isSectionVisible(idx, answers)) {
        list.push(idx);
      }
    });
    return list;
  }, [survey, answers, isSectionVisible]);

  const pageStats = useMemo(() => {
    if (!survey?.sections) return { X: 1, Y: 1 };
    const visibleSecs = survey.sections.map((_, idx) => idx).filter(idx => isSectionVisible(idx, answers));
    const Y = visibleSecs.length;
    const currentPos = visibleSecs.indexOf(currentSectionIdx);
    const X = currentPos !== -1 ? currentPos + 1 : 1;
    return { X, Y };
  }, [survey, currentSectionIdx, answers, isSectionVisible]);

  const validateCurrentSection = () => {
    const errors = {};
    const currentSection = survey?.sections?.[currentSectionIdx];
    if (!currentSection) return errors;

    const visibleQuestionsInSec = (currentSection.questions || []).filter(q => {
      const qId = q.questionId || String(q._id);
      return visibleQuestions[qId] !== false;
    });

    visibleQuestionsInSec.forEach(q => {
      const qId = q.questionId || String(q._id);
      if (q.type === 'info' || q.optional === true) {
        return;
      }

      const isStaff = user?.role === 'quality' || user?.role === 'admin';
      if (!isStaff && !interactedRef.current.has(qId)) {
        errors[qId] = t('questionInteractionRequired') || 'Answer is required.';
        return;
      }

      const err = getQuestionValidationError(q, answers);
      if (err) {
        errors[qId] = err;
      }
    });

    return errors;
  };

  const proceedToNextSection = () => {
    const errors = validateCurrentSection();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(prev => ({ ...prev, ...errors }));
      return;
    }

    const currentSection = survey?.sections?.[currentSectionIdx];
    setFieldErrors(prev => {
      const next = { ...prev };
      (currentSection?.questions || []).forEach(q => {
        const qId = q.questionId || String(q._id);
        delete next[qId];
      });
      return next;
    });

    const visibleQuestionsInSec = (currentSection?.questions || []).filter(q => {
      const qId = q.questionId || String(q._id);
      return visibleQuestions[qId] !== false;
    });

    let activeChoiceLogic = null;
    for (const q of visibleQuestionsInSec) {
      const qId = q.questionId || String(q._id);
      const val = answers[qId];
      if (q.type === 'single_choice' && q.choices) {
        const selectedChoice = q.choices.find(c => c.text === val);
        if (selectedChoice?.logic) {
          activeChoiceLogic = selectedChoice.logic;
          break;
        }
      }
    }

    if (activeChoiceLogic && activeChoiceLogic.action) {
      if (activeChoiceLogic.action === 'terminate') {
        goToInterviewStep();
        return;
      }
      if (activeChoiceLogic.action === 'skip' && activeChoiceLogic.skipToQuestionId) {
        const targetIdx = questions.findIndex((qst) => qst.questionId === activeChoiceLogic.skipToQuestionId);
        if (targetIdx !== -1) {
          const targetQ = questions[targetIdx];
          const targetQId = targetQ.questionId || String(targetQ._id);
          const targetSecIdx = survey.sections.findIndex(sec => 
            (sec.questions || []).some(q => (q.questionId || String(q._id)) === targetQId)
          );
          
          if (targetSecIdx !== -1) {
            let nextSecIdx = targetSecIdx;
            while (nextSecIdx < survey.sections.length) {
              if (isSectionVisible(nextSecIdx, answers)) {
                setCurrentSectionIdx(nextSecIdx);
                const firstQOfSec = survey.sections[nextSecIdx].questions[0];
                if (firstQOfSec) {
                  const firstQId = firstQOfSec.questionId || String(firstQOfSec._id);
                  const flatIdx = questions.findIndex(q => (q.questionId || String(q._id)) === firstQId);
                  if (flatIdx !== -1) setCurrentIdx(flatIdx);
                }
                return;
              }
              nextSecIdx++;
            }
            goToInterviewStep();
            return;
          }
        }
      }
    }

    let nextSecIdx = currentSectionIdx + 1;
    while (nextSecIdx < survey.sections.length) {
      if (isSectionVisible(nextSecIdx, answers)) {
        setCurrentSectionIdx(nextSecIdx);
        const firstQOfSec = survey.sections[nextSecIdx].questions[0];
        if (firstQOfSec) {
          const firstQId = firstQOfSec.questionId || String(firstQOfSec._id);
          const flatIdx = questions.findIndex(q => (q.questionId || String(q._id)) === firstQId);
          if (flatIdx !== -1) setCurrentIdx(flatIdx);
        }
        return;
      }
      nextSecIdx++;
    }

    goToInterviewStep();
  };

  const handlePreviousSection = () => {
    let prevSecIdx = currentSectionIdx - 1;
    while (prevSecIdx >= 0) {
      if (isSectionVisible(prevSecIdx, answers)) {
        setCurrentSectionIdx(prevSecIdx);
        const firstQOfSec = survey.sections[prevSecIdx].questions[0];
        if (firstQOfSec) {
          const firstQId = firstQOfSec.questionId || String(firstQOfSec._id);
          const flatIdx = questions.findIndex(q => (q.questionId || String(q._id)) === firstQId);
          if (flatIdx !== -1) setCurrentIdx(flatIdx);
        }
        return;
      }
      prevSecIdx--;
    }
  };

  const jumpToQuestionIdx = (idx) => {
    setCurrentIdx(idx);
    const targetQ = questions[idx];
    if (targetQ && survey?.sections) {
      const qId = targetQ.questionId || String(targetQ._id);
      const secIdx = survey.sections.findIndex(sec =>
        (sec.questions || []).some(q => (q.questionId || String(q._id)) === qId)
      );
      if (secIdx !== -1) {
        setCurrentSectionIdx(secIdx);
      }
    }
  };

  const progressStats = useMemo(() => {
    let totalVisible = 0;
    let answeredVisible = 0;

    questions.forEach(q => {
      const qId = q.questionId || String(q._id);
      if (visibleQuestions[qId] !== false) {
        totalVisible++;
        const ans = answers[qId];
        if (ans !== undefined && ans !== null && ans !== '') {
          if (Array.isArray(ans)) {
            const valid = ans.filter(v => typeof v !== 'string' || !v.startsWith('other:') || v.substring(6).trim() !== '');
            if (valid.length > 0) {
              answeredVisible++;
            }
          } else {
            answeredVisible++;
          }
        }
      }
    });

    const percentage = totalVisible > 0 ? Math.round((answeredVisible / totalVisible) * 100) : 0;
    return {
      X: answeredVisible,
      Y: totalVisible,
      percentage
    };
  }, [questions, answers, visibleQuestions]);

  const currentVisibleNumber = useMemo(() => {
    let num = 1;
    questions.forEach((q, idx) => {
      const qId = q.questionId || String(q._id);
      if (visibleQuestions[qId] !== false && idx < currentIdx) {
        num++;
      }
    });
    return num;
  }, [questions, visibleQuestions, currentIdx]);

  // Handle draft resume scrolling and default open section index
  // Must also live above all early returns — Rules of Hooks
  useEffect(() => {
    if (questions.length > 0 && survey?.sections && phase === 'questions') {
      const targetQ = questions[currentIdx];
      if (targetQ) {
        const qId = targetQ.questionId || String(targetQ._id);
        const secIdx = survey.sections.findIndex(sec =>
          (sec.questions || []).some(q => (q.questionId || String(q._id)) === qId)
        );
        if (secIdx !== -1) {
          setDefaultOpenSectionIdx(secIdx);
          setOpenSections(prev => ({ ...prev, [secIdx]: true }));
        }

        const timer = setTimeout(() => {
          const el = document.getElementById(`question-card-${qId}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 300);
        return () => clearTimeout(timer);
      }
    }
  }, [questions, survey, currentIdx, phase]);
  // ─────────────────────────────────────────────────────────────────────────

  if (!survey) return <div className="container">{t('loading')}</div>;

  // Intro
  if (phase === 'intro') {
    return (
      <div className="glass-card fade-enter-active">
        <h1>{survey.title}</h1>
        {survey.introScript && (
          <div className="agent-script-box">
            <strong style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>{t('agentReadAloud')}</strong>
            {survey.introScript}
          </div>
        )}
        {user?.role === 'agent' && eligibility.checked && !eligibility.canStart && (
          <p style={{ color: 'var(--danger)', fontWeight: 700, marginBottom: '1rem' }}>{t('under18CannotStartSurvey')}</p>
        )}
        <button
          className="btn-primary"
          onClick={() => handleStartCall()}
          disabled={user?.role === 'agent' && (eligLoading || (eligibility.checked && !eligibility.canStart))}
        >
          {t('startQuestionnaire')}
        </button>
        {precallSerialNumber && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setIsHandoverOpen(true)}
            style={{ marginTop: '1rem', marginLeft: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <UserPlus size={18} />
            {t('handover') || 'Handover Call'}
          </button>
        )}

        <HandoverModal 
            isOpen={isHandoverOpen} 
            onClose={() => setIsHandoverOpen(false)}
            serialNumber={precallSerialNumber}
            onSuccess={() => navigate('/', { replace: true })}
        />
      </div>
    );
  }

  // Final interview outcome (required)
  if (phase === 'interview') {
    return (
      <div className="glass-card fade-enter-active">
        <h2>{t('surveyInterviewOutcomeTitle')}</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>{t('surveyInterviewOutcomeHelp')}</p>
        <select
          className="input-field"
          style={{ marginBottom: '1rem', maxWidth: '100%' }}
          value={answers.interview_result || ''}
          onChange={(e) => setAnswers({ ...answers, interview_result: e.target.value })}
        >
          <option value="">{t('precallSelectPlaceholder')}</option>
          {INTERVIEW_OUTCOME_OPTIONS.map((v) => (
            <option key={v} value={v}>
              {t(OUTCOME_TKEY[v])}
            </option>
          ))}
        </select>
        {['partial', 'refused', 'postponed'].includes(answers.interview_result) && (
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
              {t('reason') || 'Reason'}
            </label>
            <textarea
              className="input-field"
              rows={3}
              placeholder={t('typeReasonPlaceholder') || 'Type reason here... (defaults to "none" if empty)'}
              value={answers.outcome_reason || ''}
              onChange={(e) => setAnswers({ ...answers, outcome_reason: e.target.value })}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          <button type="button" className="btn-primary" onClick={() => submitResponse()} disabled={!answers.interview_result}>
            {t('submitSurvey')}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate('/agent/precall')}>
            {t('backToChecklist')}
          </button>
        </div>
      </div>
    );
  }

  // Questions phase rendering below

  const handleAnswerChange = (questionId, value) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
    markInteracted(questionId);
    const flatIdx = questions.findIndex(q => (q.questionId || String(q._id)) === questionId);
    if (flatIdx !== -1) {
      setCurrentIdx(flatIdx);
    }
    if (fieldErrors[questionId]) {
      setFieldErrors(prev => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
    }
  };

  const toggleChoiceForQuestion = (q, val) => {
    const qId = q.questionId || String(q._id);
    const currArr = Array.isArray(answers[qId]) ? answers[qId] : [];
    let updated;
    if (val === 'Other' && q.allowMultipleOther) {
      const hasOther = currArr.some(v => typeof v === 'string' && v.startsWith('other:'));
      if (hasOther) {
        updated = currArr.filter(v => typeof v !== 'string' || !v.startsWith('other:'));
      } else {
        updated = [...currArr, "other:"];
      }
    } else {
      if (currArr.includes(val)) {
        updated = currArr.filter(v => v !== val);
      } else {
        updated = [...currArr, val];
      }
    }
    
    handleAnswerChange(qId, updated);
    
    if (fieldErrors[qId]) {
      const newE = { ...fieldErrors };
      delete newE[qId];
      setFieldErrors(newE);
    }
  };

  const setSingleChoiceForQuestion = (q, val, choiceLogic = null) => {
    const qId = q.questionId || String(q._id);
    
    if (val === 'Other' && q.allowMultipleOther) {
      handleAnswerChange(qId, ["other:"]);
    } else {
      handleAnswerChange(qId, val);
      
      // Auto-advance if not choosing 'Other', layout is not multi, and logic isn't to terminate
      if (survey?.layoutMode !== 'multi') {
        if (val !== 'Other' && (!choiceLogic || choiceLogic.action !== 'terminate')) {
          setTimeout(() => handleNextQuestion(choiceLogic, { ...answers, [qId]: val }), 150);
        } else if (val !== 'Other' && choiceLogic?.action === 'terminate') {
          goToInterviewStep();
        }
      }
    }
    
    if (fieldErrors[qId]) {
      const newE = { ...fieldErrors };
      delete newE[qId];
      setFieldErrors(newE);
    }
  };

  const parseDynamicText = (text) => {
    if (!text) return "";
    let parsed = String(text);
    const matches = parsed.match(/\{([^}]+)\}/g);
    if (matches) {
      matches.forEach(match => {
        const key = match.slice(1, -1);
        if (answers[key] !== undefined) {
          parsed = parsed.replace(match, String(answers[key]));
        }
      });
    }
    return parsed;
  };

  const renderQuestion = (q, sIdx, qIdx) => {
    const qId = q.questionId || String(q._id);
    const flatIdx = questions.findIndex(qst => (qst.questionId || String(qst._id)) === qId);
    
    const dynamicQuestionText = parseDynamicText(q.text);
    const dynamicScriptText = parseDynamicText(q.script);

    const isSelected = (val) => {
      if (val === 'Other' && q.allowMultipleOther) {
        const arr = Array.isArray(answers[qId]) ? answers[qId] : [];
        return arr.some(v => typeof v === 'string' && v.startsWith('other:'));
      }
      if (q.type === 'multiple_choice') return (Array.isArray(answers[qId]) && answers[qId].includes(val));
      return answers[qId] === val;
    };

    const choices = [...(q.choices || [])];
    if (q.allowOther) choices.push({ text: 'Other', isOther: true });

    return (
      <div id={`question-card-${qId}`} className="glass-card fade-enter-active" style={{ padding: '1.25rem', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
        <h3 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
          {typeof q.category === 'string' ? q.category.toUpperCase() : t('question')} {flatIdx + 1}
        </h3>
        <h2>{dynamicQuestionText}</h2>

        {q.script && (
          <div className="agent-script-box" style={{ marginTop: '0.5rem' }}>
            <strong style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>{t('agentReadAloud')}</strong>
            {dynamicScriptText}
          </div>
        )}

        {(q.type === 'single_choice' || q.type === 'multiple_choice') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
            <div className="choice-grid" style={{ marginTop: 0 }}>
              {choices.map((c, i) => (
                <button 
                  key={i} 
                  className={`choice-btn ${isSelected(c.text) ? 'active' : ''}`} 
                  onClick={() => q.type === 'multiple_choice' ? toggleChoiceForQuestion(q, c.text) : setSingleChoiceForQuestion(q, c.text, c.logic)}
                  style={isSelected(c.text) ? { backgroundColor: 'var(--primary)', color: 'white', borderColor: 'var(--primary)' } : {}}
                  type="button"
                >
                  {c.text}
                </button>
              ))}
            </div>

            {isSelected('Other') && (
              <div style={{ marginTop: '0.5rem' }}>
                {q.allowMultipleOther ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {(() => {
                        const arr = Array.isArray(answers[qId]) ? answers[qId] : [];
                        const others = arr.filter(v => typeof v === 'string' && v.startsWith('other:'));
                        if (others.length === 0) others.push('other:');
                        return others.map((val, idx) => {
                          const textVal = val.substring(6);
                          return (
                            <div key={idx} style={{ display: 'flex', gap: '0.5rem' }}>
                              <input
                                type="text"
                                className="input-field"
                                placeholder="Please specify..."
                                value={textVal}
                                onChange={(e) => {
                                  const newText = e.target.value;
                                  const newAnswers = [...arr];
                                  let otherCounter = 0;
                                  for (let i = 0; i < newAnswers.length; i++) {
                                    if (typeof newAnswers[i] === 'string' && newAnswers[i].startsWith('other:')) {
                                      if (otherCounter === idx) {
                                        newAnswers[i] = `other:${newText}`;
                                        break;
                                      }
                                      otherCounter++;
                                    }
                                  }
                                  handleAnswerChange(qId, newAnswers);
                                }}
                              />
                              <button 
                                type="button" 
                                className="btn-secondary" 
                                style={{ padding: '0.5rem', color: '#ef4444' }} 
                                onClick={() => {
                                  const newAnswers = [...arr];
                                  let otherCounter = 0;
                                  for (let i = 0; i < newAnswers.length; i++) {
                                    if (typeof newAnswers[i] === 'string' && newAnswers[i].startsWith('other:')) {
                                      if (otherCounter === idx) {
                                        newAnswers.splice(i, 1);
                                        break;
                                      }
                                      otherCounter++;
                                    }
                                  }
                                  handleAnswerChange(qId, newAnswers);
                                }}
                                disabled={others.length <= 1}
                              >
                                −
                              </button>
                            </div>
                          );
                        });
                      })()}
                    </div>
                    <button 
                      type="button" 
                      className="btn-secondary" 
                      style={{ alignSelf: 'flex-start', fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
                      onClick={() => {
                        const arr = Array.isArray(answers[qId]) ? answers[qId] : [];
                        handleAnswerChange(qId, [...arr, "other:"]);
                      }}
                    >
                      {t('addAnother') || '+ Add another'}
                    </button>
                  </div>
                ) : (
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Please specify..."
                    value={otherValues[qId] || ''}
                    onChange={(e) => {
                      setOtherValues(prev => ({ ...prev, [qId]: e.target.value }));
                      markInteracted(qId);
                      if (fieldErrors[qId]) {
                        setFieldErrors(prev => {
                          const next = { ...prev };
                          delete next[qId];
                          return next;
                        });
                      }
                    }}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {q.type === 'text' && (
          <div className="form-group" style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="text"
              className="input-field"
              placeholder={t('typeAnswer')}
              value={answers[qId] || ''}
              onChange={(e) => handleAnswerChange(qId, e.target.value)}
              style={{ flex: 1 }}
              autoFocus={flatIdx === currentIdx}
            />
          </div>
        )}

        {fieldErrors[qId] && (
          <div className="field-error-text" style={{ color: 'var(--danger)', marginTop: '0.75rem', fontWeight: 600, fontSize: '0.9rem' }}>
            {fieldErrors[qId]}
          </div>
        )}

        {showInteractionError && (
          <p className="field-error-text">
            {t('questionInteractionRequired')}
          </p>
        )}
      </div>
    );
  };

  return (
    <DebugErrorBoundary>
      <div className="survey-layout">
        {/* Mobile Toggle */}
        <button className="btn-secondary mobile-sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
          <Menu size={20} />
        </button>

        {/* Sidebar Overlay */}
        {sidebarOpen && (
          <div className="survey-sidebar-overlay" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Sidebar */}
        <div className={`survey-sidebar ${sidebarOpen ? 'open' : ''}`} style={{ width: '300px' }}>
          <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: 700 }}>{t('sections') || 'Sections'}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {survey.sections && survey.sections.map((sec, sIdx) => {
              const questionsInSec = sec.questions || [];
              const visibleQuestionsInSec = questionsInSec.filter((q) => {
                const qId = q.questionId || String(q._id);
                return visibleQuestions[qId] !== false;
              });

              if (visibleQuestionsInSec.length === 0) return null;

              const isOpen = !!openSections[sIdx];
              const ArrowIcon = isOpen ? ChevronDown : (isRtl ? ChevronLeft : ChevronRight);

              return (
                <div key={sIdx} className="sidebar-section-card" style={{ marginBottom: '0.25rem' }}>
                  <div
                    className="sidebar-section-header"
                    onClick={() => setOpenSections(prev => ({ ...prev, [sIdx]: !prev[sIdx] }))}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      userSelect: 'none',
                      padding: '0.6rem 0.75rem',
                      background: 'var(--surface-hover)',
                      borderRadius: '6px',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                      <ArrowIcon size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={sec.title}>
                        {sec.title || `${t('section') || 'Section'} ${sIdx + 1}`}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.75rem', background: 'var(--primary-low)', color: 'var(--primary)', padding: '0.1rem 0.4rem', borderRadius: '10px', fontWeight: 'bold', flexShrink: 0 }}>
                      {visibleQuestionsInSec.length}
                    </span>
                  </div>

                  {isOpen && (
                    <div className="sidebar-section-content" style={{ padding: '0.5rem', background: 'var(--surface)' }}>
                      <div className="q-badge-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(35px, 1fr))', gap: '0.4rem', marginTop: 0 }}>
                        {visibleQuestionsInSec.map((qst) => {
                          const qId = qst.questionId || String(qst._id);
                          const idx = questions.findIndex(q => (q.questionId || String(q._id)) === qId);

                          let statusClass = '';
                          if (idx === currentIdx) {
                            statusClass = 'current';
                          } else if (answers[qId] !== undefined && answers[qId] !== null && answers[qId] !== '') {
                            statusClass = 'answered';
                          }

                          return (
                            <div
                              key={idx}
                              className={`q-badge ${statusClass}`}
                              onClick={() => {
                                jumpToQuestionIdx(idx);
                              }}
                              style={{
                                width: '35px',
                                height: '35px',
                                fontSize: '0.8rem',
                                ...(idx === currentIdx ? { backgroundColor: 'var(--primary)', color: 'white', borderColor: 'var(--primary)', boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.3)' } : {})
                              }}
                              title={qst.text}
                            >
                              {idx + 1}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Main Content */}
        <div className="survey-main">
          <div className="survey-content">
            <div className="survey-progress-container">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                {survey?.layoutMode === 'multi' ? (
                  <span>{t('page') || 'Page'} {pageStats.X} {t('of') || 'of'} {pageStats.Y}</span>
                ) : (
                  <span>Question {currentVisibleNumber} of {progressStats.Y}</span>
                )}
                <span>{progressStats.percentage}% completed</span>
              </div>
              <div className="survey-progress-bar-bg">
                <div className="survey-progress-bar-fill" style={{ width: `${progressStats.percentage}%` }}></div>
              </div>
            </div>

            {survey?.layoutMode === 'multi' ? (
              (() => {
                const currentSection = survey.sections[currentSectionIdx];
                if (!currentSection) return <div>No valid section data found.</div>;
                
                const visibleQuestionsInSec = (currentSection.questions || []).filter(q => {
                  const qId = q.questionId || String(q._id);
                  return visibleQuestions[qId] !== false;
                });
                
                return (
                  <div key={currentSectionIdx} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {currentSection.title && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'var(--primary-low)', color: 'var(--primary)', borderRadius: '6px', fontSize: '0.9rem', fontWeight: 700, alignSelf: 'flex-start' }}>
                        {currentSection.title}
                      </div>
                    )}
                    {visibleQuestionsInSec.map((q, qIdx) => renderQuestion(q, currentSectionIdx, qIdx))}
                  </div>
                );
              })()
            ) : (
              (() => {
                const currentQ = questions[currentIdx];
                if (!currentQ) return <div>No valid question data format found.</div>;

                const qId = currentQ.questionId || String(currentQ._id);
                let sIdx = 0;
                let qIdx = 0;
                let sectionTitle = "";

                if (survey.sections) {
                  sIdx = survey.sections.findIndex(sec =>
                    (sec.questions || []).some(q => (q.questionId || String(q._id)) === qId)
                  );
                  if (sIdx !== -1) {
                    qIdx = survey.sections[sIdx].questions.findIndex(q => (q.questionId || String(q._id)) === qId);
                    sectionTitle = survey.sections[sIdx].title;
                  } else {
                    sIdx = 0;
                  }
                }

                return (
                  <div key={currentIdx} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {sectionTitle && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'var(--primary-low)', color: 'var(--primary)', borderRadius: '6px', fontSize: '0.9rem', fontWeight: 700, alignSelf: 'flex-start' }}>
                        {sectionTitle}
                      </div>
                    )}
                    {renderQuestion(currentQ, sIdx, qIdx)}
                  </div>
                );
              })()
            )}
          </div>

          {/* Bottom Action Bar */}
          <div className="survey-bottom-bar">
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              {survey?.layoutMode === 'multi' ? (
                <>
                  <button className="btn-secondary" onClick={handlePreviousSection} disabled={currentSectionIdx === 0} style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ChevronLeft size={18} /> Previous
                  </button>
                  <button className="btn-primary" onClick={proceedToNextSection} style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    Next <ChevronRight size={18} />
                  </button>
                </>
              ) : (
                <>
                  <button className="btn-secondary" onClick={handlePrevious} disabled={currentIdx === 0} style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ChevronLeft size={18} /> Previous
                  </button>
                  <button className="btn-primary" onClick={() => handleNextQuestion()} style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    Next <ChevronRight size={18} />
                  </button>
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
              {lastSaved && (
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Save size={14} /> Saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              <button className="btn-secondary" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={() => setShowEndCallConfirm(true)}>
                <PhoneOff size={18} /> End Call
              </button>
            </div>
          </div>
          
          {/* End Call Confirmation Modal */}
          {showEndCallConfirm && (
            <div className="modal-overlay">
              <div className="modal-content glass-card fade-enter-active" style={{ maxWidth: '400px' }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem', color: 'var(--danger)' }}>
                  <AlertTriangle size={24} />
                  <h2 style={{ margin: 0 }}>End Call?</h2>
                </div>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                  Are you sure you want to end this interview? You will be taken to the submission screen to finalize the outcome.
                </p>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                  <button className="btn-secondary" onClick={() => setShowEndCallConfirm(false)}>Cancel</button>
                  <button className="btn-primary" style={{ backgroundColor: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => { setShowEndCallConfirm(false); goToInterviewStep(); }}>
                    Yes, End Call
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </DebugErrorBoundary>
  );
}
