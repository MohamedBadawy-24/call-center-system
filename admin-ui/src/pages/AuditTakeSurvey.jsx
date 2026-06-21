import React, { useState, useEffect, useContext, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { AuthContext } from '../context/AuthContext';
import { UIContext } from '../context/UIContext';
import { toast } from 'react-toastify';
import { INTERVIEW_OUTCOME_OPTIONS, evaluateCondition } from '../utils/outboundPrecallConfig';
import { Menu, ChevronLeft, ChevronRight, Save, PhoneOff, AlertTriangle, ChevronDown, CheckCircle } from 'lucide-react';

export default function AuditTakeSurvey() {
  const { surveyId, agentId, serialNumber } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const { t, language } = useContext(UIContext);
  const isRtl = language === 'ar';

  const [survey, setSurvey] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [phase, setPhase] = useState('questions'); // 'questions' | 'interview'
  const [answers, setAnswers] = useState({});
  const [otherValues, setOtherValues] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [currentSectionIdx, setCurrentSectionIdx] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showEndCallConfirm, setShowEndCallConfirm] = useState(false);
  const [defaultOpenSectionIdx, setDefaultOpenSectionIdx] = useState(0);
  const [openSections, setOpenSections] = useState({});
  const [isMirroring, setIsMirroring] = useState(true);

  // Tracks which question IDs have been manually changed by the auditor
  const [modifiedByAuditor, setModifiedByAuditor] = useState(new Set());

  // Quality Evaluation outcome states
  const [evaluationOutcome, setEvaluationOutcome] = useState('passed');
  const [notes, setNotes] = useState('');
  const [submittingAudit, setSubmittingAudit] = useState(false);

  // Load Survey Details
  useEffect(() => {
    if (surveyId) {
      api.get(`/survey/${surveyId}`)
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
  }, [surveyId]);

  // Initial Fetch & Dynamic Polling for Agent's Draft Answers
  useEffect(() => {
    if (!serialNumber) return;

    const syncAgentDraft = async () => {
      try {
        const draftRes = await api.get(`/agent/draft/${serialNumber}`);
        if (draftRes.data && draftRes.data.answers) {
          const agentDraftAnswers = draftRes.data.answers;
          
          setAnswers(prevAnswers => {
            const nextAnswers = { ...prevAnswers };
            // Merge agent answers only if the auditor has not manually overridden them
            Object.keys(agentDraftAnswers).forEach(qId => {
              if (!modifiedByAuditor.has(qId)) {
                nextAnswers[qId] = agentDraftAnswers[qId];
              }
            });
            return nextAnswers;
          });

          if (draftRes.data.otherValues) {
            setOtherValues(prevOther => {
              const nextOther = { ...prevOther };
              Object.keys(draftRes.data.otherValues).forEach(qId => {
                if (!modifiedByAuditor.has(qId)) {
                  nextOther[qId] = draftRes.data.otherValues[qId];
                }
              });
              return nextOther;
            });
          }

          if (isMirroring) {
            if (typeof draftRes.data.currentIdx === 'number') {
              setCurrentIdx(draftRes.data.currentIdx);
            }
            if (typeof draftRes.data.currentSectionIdx === 'number') {
              setCurrentSectionIdx(draftRes.data.currentSectionIdx);
            }
          }
        }
      } catch (err) {
        console.error('Failed to sync agent draft answers:', err);
      }
    };

    syncAgentDraft();
    const interval = setInterval(syncAgentDraft, 3000); // Poll agent draft every 3 seconds

    return () => clearInterval(interval);
  }, [serialNumber, modifiedByAuditor, isMirroring]);

  // Auto-expand current section in sidebar
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
      }
    }
  }, [questions, survey, currentIdx, phase]);

  const handleAnswerChange = (questionId, value) => {
    setModifiedByAuditor(prev => {
      const next = new Set(prev);
      next.add(questionId);
      return next;
    });

    setAnswers(prev => ({ ...prev, [questionId]: value }));

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
  };

  const getQuestionValidationError = (q, providedAnswers = answers) => {
    const qId = q.questionId || String(q._id);
    const val = providedAnswers[qId];

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

  const handleNextQuestion = (choiceLogic = null, providedAnswers = answers) => {
    const currentQ = questions[currentIdx];
    if (!currentQ) return;

    const qId = currentQ.questionId || String(currentQ._id);

    // Validate only current question
    if (visibleQuestions[qId] !== false) {
      const err = getQuestionValidationError(currentQ, providedAnswers);
      if (err) {
        setFieldErrors(prev => ({ ...prev, [qId]: err }));
        return;
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
          break;
        }
      } else {
        break;
      }
      prevIdx--;
    }
    if (prevIdx >= 0) {
      setCurrentIdx(prevIdx);
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
        return i;
      }
    }
    return -1;
  };

  const goToInterviewStep = () => {
    setPhase('interview');
  };

  const submitAuditResult = async () => {
    setSubmittingAudit(true);
    try {
      // Load pre-call audit answers from sessionStorage
      let auditorPrecallAnswers = {};
      const savedPrecallRaw = sessionStorage.getItem(`auditPrecallAnswers:${agentId}`);
      if (savedPrecallRaw) {
        auditorPrecallAnswers = JSON.parse(savedPrecallRaw);
      }

      const qualityName = auditorPrecallAnswers.quality_name || user?.name || '';

      // Prepare shadowAnswers
      const shadowAnswers = Object.keys(answers).map(k => {
        const qst = questions.find(q => q.questionId === k || String(q._id) === k);
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
      });

      // Submit Audit
      await api.post('/quality/audit', {
        agentId,
        evaluationOutcome,
        notes,
        qualityName,
        auditorAnswers: auditorPrecallAnswers,
        shadowAnswers,
      });

      // Clear precall audit answers
      sessionStorage.removeItem(`auditPrecallAnswers:${agentId}`);

      toast.success(t('auditSubmitted') || 'Audit checklist & survey answers saved successfully.');
      navigate('/quality/monitor');
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to submit quality audit');
    } finally {
      setSubmittingAudit(false);
    }
  };

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
                            </div>
                          );
                        });
                      })()}
                    </div>
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
            />
          </div>
        )}

        {fieldErrors[qId] && (
          <div className="field-error-text" style={{ color: 'var(--danger)', marginTop: '0.75rem', fontWeight: 600, fontSize: '0.9rem' }}>
            {fieldErrors[qId]}
          </div>
        )}
      </div>
    );
  };

  if (!survey) return <div className="container">{t('loading')}</div>;

  // Final quality submission outcome
  if (phase === 'interview') {
    return (
      <div className="glass-card fade-enter-active">
        <h2 style={{ marginBottom: '1.5rem' }}>{t('auditEvaluationOutcome') || 'Quality Audit Evaluation'}</h2>
        
        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
          <label className="form-label">{t('auditOutcome') || 'Outcome'}</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600 }}>
              <input
                type="radio"
                name="outcome"
                value="passed"
                checked={evaluationOutcome === 'passed'}
                onChange={(e) => setEvaluationOutcome(e.target.value)}
              />
              {t('auditPassed') || 'Passed'}
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600 }}>
              <input
                type="radio"
                name="outcome"
                value="failed"
                checked={evaluationOutcome === 'failed'}
                onChange={(e) => setEvaluationOutcome(e.target.value)}
              />
              {t('auditFailed') || 'Failed'}
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600 }}>
              <input
                type="radio"
                name="outcome"
                value="needs_follow_up"
                checked={evaluationOutcome === 'needs_follow_up'}
                onChange={(e) => setEvaluationOutcome(e.target.value)}
              />
              {t('auditNeedsFollowUp') || 'Needs Follow-up'}
            </label>
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
          <label className="form-label">{t('notes') || 'Notes'}</label>
          <textarea
            className="input-field"
            rows="4"
            maxLength="500"
            placeholder="Audit notes & quality feedback..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ width: '100%', resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          <button type="button" className="btn-primary" onClick={submitAuditResult} disabled={submittingAudit}>
            {submittingAudit ? 'Submitting...' : t('submitAudit') || 'Submit Audit'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => setPhase('questions')}>
            {t('backToQuestions') || 'Back to Questions'}
          </button>
        </div>
      </div>
    );
  }

  return (
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div className="survey-progress-container" style={{ flex: 1, marginBottom: 0, marginRight: '1.5rem' }}>
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

            {/* Live Mirror Indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '0.4rem 0.8rem', borderRadius: '20px', fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 700 }}>
              <span className="status-dot active" style={{ background: 'var(--primary)', width: '8px', height: '8px' }}></span>
              {t('shadowMirrorLive') || 'Mirrored Live'}
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
            <button className="btn-secondary" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={() => setShowEndCallConfirm(true)}>
              <PhoneOff size={18} /> End Call / Finalize Audit
            </button>
          </div>
        </div>

        {/* End Call Confirmation Modal */}
        {showEndCallConfirm && (
          <div className="modal-overlay">
            <div className="modal-content glass-card fade-enter-active" style={{ maxWidth: '400px' }}>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem', color: 'var(--danger)' }}>
                <AlertTriangle size={24} />
                <h2 style={{ margin: 0 }}>End Survey Audit?</h2>
              </div>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                Are you sure you want to end this shadow audit session? You will be taken to the final quality evaluation form to submit.
              </p>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button className="btn-secondary" onClick={() => setShowEndCallConfirm(false)}>Cancel</button>
                <button className="btn-primary" style={{ backgroundColor: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => { setShowEndCallConfirm(false); goToInterviewStep(); }}>
                  Yes, End Audit
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
