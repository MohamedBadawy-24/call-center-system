import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { AuthContext } from '../context/AuthContext';
import { UIContext } from '../context/UIContext';
import { INTERVIEW_OUTCOME_OPTIONS, evaluateCondition } from '../utils/outboundPrecallConfig';
import HandoverModal from '../components/HandoverModal';
import { UserPlus } from 'lucide-react';

export default function TakeSurvey() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, setUser } = useContext(AuthContext);
  const { t } = useContext(UIContext);
  const [survey, setSurvey] = useState(null);

  const [questions, setQuestions] = useState([]);
  /** intro | questions | interview */
  const [phase, setPhase] = useState('intro');
  const [answers, setAnswers] = useState({});
  const [startTime, setStartTime] = useState(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [precallSerialNumber, setPrecallSerialNumber] = useState('');
  const [eligibility, setEligibility] = useState({ checked: false, canStart: false, reason: '' });
  const [eligLoading, setEligLoading] = useState(true);
  const [isHandoverOpen, setIsHandoverOpen] = useState(false);

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
  }, [id]);

  const refreshEligibility = async () => {
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
      refreshEligibility();
    }
  }, [user?.role, user?.currentStatus, user?.precallCompletedForActiveSession]);

  // Persist answers to API as they change
  useEffect(() => {
    if (phase === 'questions' && user?.id && precallSerialNumber) {
      const draftData = {
        surveyId: id,
        serialNumber: precallSerialNumber,
        answers,
        currentIdx,
      };
      // Debounce slightly or fire and forget
      api.post('/agent/draft', draftData).catch(() => { /* ignore */ });
    }
  }, [answers, currentIdx, phase, user?.id, id, precallSerialNumber]);

  if (!survey) return <div className="container">{t('loading')}</div>;

  const handleStartCall = async () => {
    if (questions.length === 0) {
      alert('This survey has no questions!');
      return;
    }
    const data = await refreshEligibility();
    if (!data?.canStartSurvey) {
      if (data?.reason === 'under_18' || data?.reason === 'under_18_not_qualified') {
        alert(t('under18CannotStartSurvey'));
      } else {
        alert(t('cannotStartSurveyGeneric'));
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
    setAnswers(initialAnswers);

    // Find first visible question based on merged answers
    const firstIdx = findNextVisibleIdx(0, initialAnswers);
    if (firstIdx === -1) {
      goToInterviewStep();
    } else {
      setPhase('questions');
      setCurrentIdx(firstIdx);
      // Attempt to restore progress if we have a draft for this serial
      if (data?.precallSerialNumber) {
        try {
          const draftRes = await api.get(`/agent/draft/${data.precallSerialNumber}`);
          if (draftRes.data && draftRes.data.answers && Object.keys(draftRes.data.answers).length > 0) {
            const mergedWithDraft = { ...initialAnswers, ...draftRes.data.answers };
            setAnswers(mergedWithDraft);
            if (typeof draftRes.data.currentIdx === 'number' && draftRes.data.currentIdx < (questions?.length || 0)) {
              setCurrentIdx(draftRes.data.currentIdx);
            }
          }
        } catch (_) { /* ignore bad draft */ }
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
    const finalOutcome = answers.interview_result;
    if (!finalOutcome) {
      alert(t('mustSelectInterviewOutcome'));
      return;
    }
    const duration = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
    const finalReason = ['partial', 'refused', 'postponed'].includes(finalOutcome) 
      ? ((answers.outcome_reason || '').trim() || 'none') 
      : '';
      
    const payload = {
      surveyId: survey._id,
      durationSecs: duration,
      answers: Object.keys(answers).map((k) => ({ questionId: k, value: answers[k] })),
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
      alert(err.response?.data?.error || 'Error saving response');
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

  const handleAnswer = (val, choiceLogic = null) => {
    const q = questions[currentIdx];
    const newAnswers = { ...answers, [q.questionId || `q_${currentIdx}`]: val };
    setAnswers(newAnswers);

    if (choiceLogic && choiceLogic.action) {
      if (choiceLogic.action === 'terminate') {
        goToInterviewStep();
        return;
      }
      if (choiceLogic.action === 'skip' && choiceLogic.skipToQuestionId) {
        const targetIdx = questions.findIndex((qst) => qst.questionId === choiceLogic.skipToQuestionId);
        if (targetIdx !== -1) {
          // Still check visibility for the target question and beyond
          const nextIdx = findNextVisibleIdx(targetIdx, newAnswers);
          if (nextIdx !== -1) {
            setCurrentIdx(nextIdx);
          } else {
            goToInterviewStep();
          }
          return;
        }
      }
    }

    const nextIdx = findNextVisibleIdx(currentIdx + 1, newAnswers);
    if (nextIdx !== -1) {
      setCurrentIdx(nextIdx);
    } else {
      goToInterviewStep();
    }
  };



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
          onClick={handleStartCall}
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
  const q = questions[currentIdx];
  if (!q) return <div>No valid question data format found.</div>;

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

  const dynamicQuestionText = parseDynamicText(q.text);
  const dynamicScriptText = parseDynamicText(q.script);

  return (
    <div className="glass-card fade-enter-active" key={currentIdx}>
      <h3 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
        {typeof q.category === 'string' ? q.category.toUpperCase() : t('question')} {currentIdx + 1} {t('of')} {questions.length}
      </h3>
      <h2>{dynamicQuestionText}</h2>

      {q.script && (
        <div className="agent-script-box">
          <strong style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>{t('agentReadAloud')}</strong>
          {dynamicScriptText}
        </div>
      )}

      {(q.type === 'info' || !q.type) && (
        <button className="btn-primary" onClick={() => handleAnswer('read')} style={{ marginTop: '1rem' }}>
          {t('next')}
        </button>
      )}

      {(q.type === 'single_choice' || q.type === 'multiple_choice') && (
        <div className="choice-grid">
          {Array.isArray(q.choices) &&
            q.choices.map((c, i) => {
              const isSelected = answers[q.questionId || `q_${currentIdx}`] === c.text;
              return (
                <button 
                  key={i} 
                  className={`choice-btn ${isSelected ? 'active' : ''}`} 
                  onClick={() => handleAnswer(c.text, c.logic)}
                  style={isSelected ? { backgroundColor: 'var(--primary)', color: 'white', borderColor: 'var(--primary)' } : {}}
                >
                  {c.text}
                </button>
              );
            })}
        </div>
      )}

      {q.type === 'text' && (
        <div className="form-group" style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type="text"
            className="input-field"
            placeholder={t('typeAnswer')}
            defaultValue={answers[q.questionId || `q_${currentIdx}`] || ''}
            id={`text-input-${currentIdx}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.target.value) {
                handleAnswer(e.target.value);
              }
            }}
            style={{ flex: 1 }}
            autoFocus
          />
          <button 
            className="btn-primary"
            onClick={() => {
              const val = document.getElementById(`text-input-${currentIdx}`).value;
              if (val) handleAnswer(val);
            }}
            style={{ padding: '0 1.5rem', height: '42px' }}
          >
            {t('next')}
          </button>
        </div>
      )}
    </div>
  );
}
