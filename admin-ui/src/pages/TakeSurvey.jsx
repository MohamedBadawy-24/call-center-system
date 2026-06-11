import React, { useState, useEffect, useContext, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { AuthContext } from '../context/AuthContext';
import { UIContext } from '../context/UIContext';
import { toast } from 'react-toastify';
import { INTERVIEW_OUTCOME_OPTIONS, evaluateCondition } from '../utils/outboundPrecallConfig';
import HandoverModal from '../components/HandoverModal';
import { UserPlus, Menu, ChevronLeft, ChevronRight, Save, PhoneOff, AlertTriangle } from 'lucide-react';
import SectionedSurveyView from '../components/SectionedSurveyView';

export default function TakeSurvey({ mockSurvey }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, setUser } = useContext(AuthContext);
  const { t } = useContext(UIContext);
  const [survey, setSurvey] = useState(null);

  const [questions, setQuestions] = useState([]);
  /** intro | questions | interview */
  const [phase, setPhase] = useState('intro');
  const [answers, setAnswers] = useState({});
  const [otherValues, setOtherValues] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [startTime, setStartTime] = useState(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [precallSerialNumber, setPrecallSerialNumber] = useState('');
  const [eligibility, setEligibility] = useState({ checked: false, canStart: false, reason: '' });
  const [eligLoading, setEligLoading] = useState(true);
  const [isHandoverOpen, setIsHandoverOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showEndCallConfirm, setShowEndCallConfirm] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [defaultOpenSectionIdx, setDefaultOpenSectionIdx] = useState(0);

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
      api
        .get(`/survey/${id}`)
        .then((res) => {
          setSurvey(res.data);
          let allQ = [];
          if (res.data.sections) {
            res.data.sections.forEach((sec) => {
              allQ = allQ.concat(sec.questions);
            });
          } else if (res.data.questions) {
            allQ = res.data.questions;
          }
          setQuestions(allQ);
        })
        .catch(console.error);
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
      const res = await api.get(`/agent/survey-eligibility?surveyId=${id}${serialParam ? `&serial=${serialParam}` : ''}`);
      const data = res.data;
      setEligibility({
        checked: true,
        canStart: data.canStartSurvey,
        reason: data.reason || '',
      });
      setPrecallSerialNumber(data.precallSerialNumber || '');
      return data;
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
            const draftRes = await api.get(`/agent/draft/${data.precallSerialNumber}`);
            if (draftRes.data && draftRes.data.answers && Object.keys(draftRes.data.answers).length > 0) {
              handleStartCall(data, draftRes.data);
            }
          } catch(e) {}
        }
      });
    }
  }, [user?.role, user?.currentStatus, user?.precallCompletedForActiveSession]);

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
      };
      
      // Update local storage / session storage if needed, or rely on autosave
      const timeoutId = setTimeout(() => {
        api.post('/agent/draft', draftData)
          .then(() => setLastSaved(new Date()))
          .catch(() => { /* ignore */ });
      }, 1000);
      
      return () => clearTimeout(timeoutId);
    }
  }, [answers, currentIdx, phase, user?.id, id, precallSerialNumber]);

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

    if (preloadedDraft) {
      draftAnswers = preloadedDraft.answers || {};
      draftIdx = preloadedDraft.currentIdx;
    } else if (data?.precallSerialNumber) {
      try {
        const draftRes = await api.get(`/agent/draft/${data.precallSerialNumber}`);
        if (draftRes.data && draftRes.data.answers) {
          draftAnswers = draftRes.data.answers;
          if (draftRes.data.otherValues) setOtherValues(draftRes.data.otherValues);
          draftIdx = draftRes.data.currentIdx;
        }
      } catch (_) { /* ignore */ }
    }

    const mergedAnswers = { ...initialAnswers, ...draftAnswers };
    setAnswers(mergedAnswers);

    const firstIdx = findNextVisibleIdx(0, mergedAnswers);
    if (firstIdx === -1) {
      goToInterviewStep();
    } else {
      setPhase('questions');
      if (typeof draftIdx === 'number' && draftIdx < (questions?.length || 0)) {
        setCurrentIdx(draftIdx);
      } else {
        setCurrentIdx(firstIdx);
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
    try {
      await api.post('/response', payload);
      
      // Clear the pre-call checklist draft for this survey
      if (user?.id) {
        const draftKey = `precallDraft:${user.id}:${survey._id || 'default'}`;
        sessionStorage.removeItem(draftKey);
      }

      // Drafts are handled by the backend automatically. We don't need to manually clear them here.

      const me = await api.get('/auth/me');
      setUser(me.data.user);
      localStorage.setItem('user', JSON.stringify(me.data.user));
      navigate(`/agent/precall?surveyId=${survey._id}`, { replace: true });
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Error saving response');
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

  const handleNextQuestion = (choiceLogic = null, providedAnswers = answers) => {
    const q = questions[currentIdx];
    const qId = q.questionId || `q_${currentIdx}`;
    const val = providedAnswers[qId];

    // Validations
    if (q.type === 'multiple_choice') {
      const arr = Array.isArray(val) ? val : [];
      const validArr = arr.filter(v => !(typeof v === 'string' && v.startsWith('other:') && v.substring(6).trim() === ''));
      if (q.minSelections && validArr.length < q.minSelections) {
        toast.error(`Please select at least ${q.minSelections} options.`);
        return;
      }
      if (q.maxSelections && validArr.length > q.maxSelections) {
        toast.error(`Please select at most ${q.maxSelections} options.`);
        return;
      }
      const hasOther = q.allowMultipleOther 
        ? arr.some(v => typeof v === 'string' && v.startsWith('other:'))
        : arr.includes('Other');

      if (hasOther) {
        if (q.allowMultipleOther) {
          const validOthers = arr.filter(v => typeof v === 'string' && v.startsWith('other:') && v.substring(6).trim() !== '');
          if (validOthers.length === 0) {
            setFieldErrors({ ...fieldErrors, [qId]: true });
            return;
          }
        } else if (!(otherValues[qId] || '').trim()) {
          toast.error('Please specify the "Other" option.');
          return;
        }
      }
    } else if (q.allowMultipleOther ? (Array.isArray(val) && val.some(v => typeof v === 'string' && v.startsWith('other:'))) : val === 'Other') {
      if (q.allowMultipleOther) {
        const validOthers = val.filter(v => typeof v === 'string' && v.startsWith('other:') && v.substring(6).trim() !== '');
        if (validOthers.length === 0) {
          setFieldErrors({ ...fieldErrors, [qId]: true });
          return;
        }
      } else if (!(otherValues[qId] || '').trim()) {
        toast.error('Please specify the "Other" option.');
        return;
      }
    }

    if (choiceLogic && choiceLogic.action) {
      if (choiceLogic.action === 'terminate') {
        goToInterviewStep();
        return;
      }
      if (choiceLogic.action === 'skip' && choiceLogic.skipToQuestionId) {
        const targetIdx = questions.findIndex((qst) => qst.questionId === choiceLogic.skipToQuestionId);
        if (targetIdx !== -1) {
          const nextIdx = findNextVisibleIdx(targetIdx, providedAnswers);
          if (nextIdx !== -1) setCurrentIdx(nextIdx);
          else goToInterviewStep();
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
        if (e.key === 'ArrowLeft') handlePrevious();
        if (e.key === 'ArrowRight') handleNextQuestion();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIdx, phase, answers, questions]);


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

  // Questions
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

  // Handle draft resume scrolling and default open section index
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

  const handleAnswerChange = (questionId, value) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
    const flatIdx = questions.findIndex(q => (q.questionId || String(q._id)) === questionId);
    if (flatIdx !== -1) {
      setCurrentIdx(flatIdx);
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
      
      if (val !== 'Other' && choiceLogic?.action === 'terminate') {
        goToInterviewStep();
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
      <div className="glass-card fade-enter-active" style={{ padding: '1.25rem', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
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
      </div>
    );
  };

  return (
    <div className="survey-layout">
      {/* Mobile Toggle */}
      <button className="btn-secondary mobile-sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
        <Menu size={20} />
      </button>

      {/* Sidebar */}
      <div className={`survey-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Questions</h3>
        <div className="q-badge-grid">
          {questions.map((qst, idx) => {
            let statusClass = '';
            const qId = qst.questionId || String(qst._id);
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
                  setCurrentIdx(idx);
                  const el = document.getElementById(`question-card-${qId}`);
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }}
                title={qst.text}
              >
                {idx + 1}
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
              <span>Question {progressStats.X} of {progressStats.Y}</span>
              <span>{progressStats.percentage}% completed</span>
            </div>
            <div className="survey-progress-bar-bg">
              <div className="survey-progress-bar-fill" style={{ width: `${progressStats.percentage}%` }}></div>
            </div>
          </div>

          <SectionedSurveyView
            sections={survey.sections || []}
            answers={answers}
            visibleQuestions={visibleQuestions}
            onAnswerChange={handleAnswerChange}
            renderQuestion={renderQuestion}
            readOnly={false}
            defaultOpenSectionIdx={defaultOpenSectionIdx}
          />
        </div>

        {/* Bottom Action Bar */}
        <div className="survey-bottom-bar">
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <button className="btn-secondary" onClick={handlePrevious} disabled={currentIdx === 0} style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ChevronLeft size={18} /> Previous
            </button>
            <button className="btn-primary" onClick={() => handleNextQuestion()} style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              Next <ChevronRight size={18} />
            </button>
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
  );
}
