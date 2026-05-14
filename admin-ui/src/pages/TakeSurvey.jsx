import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { AuthContext } from '../context/AuthContext';
import { UIContext } from '../context/UIContext';
import { INTERVIEW_OUTCOME_OPTIONS, evaluateCondition } from '../utils/outboundPrecallConfig';
import HandoverModal from '../components/HandoverModal';
import { UserPlus } from 'lucide-react';

function surveyEligibilityIntroReason(reason, t) {
  if (reason === 'under_18' || reason === 'under_18_not_qualified') return t('under18CannotStartSurvey');
  if (reason === 'not_active') return t('mustBeActive');
  if (reason === 'survey_mismatch') return t('cannotStartSurveyWrongCampaign');
  return t('cannotStartSurveyGeneric');
}

export default function TakeSurvey() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlSerial = searchParams.get('serial');
  const { user, setUser } = useContext(AuthContext);
  const { t } = useContext(UIContext);
  const [survey, setSurvey] = useState(null);

  const [questions, setQuestions] = useState([]);
  /** intro | questions | interview */
  const [phase, setPhase] = useState('intro');
  const [answers, setAnswers] = useState({});
  const [startTime, setStartTime] = useState(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [interviewOutcome, setInterviewOutcome] = useState('');
  const [outcomeReason, setOutcomeReason] = useState('');
  const [precallSerialNumber, setPrecallSerialNumber] = useState('');
  const [eligibility, setEligibility] = useState({ checked: false, canStart: false, reason: '' });
  const [eligLoading, setEligLoading] = useState(true);
  const [isHandoverOpen, setIsHandoverOpen] = useState(false);

  useEffect(() => {
    const hasSerialParam = !!urlSerial;
    if (
      !hasSerialParam &&
      user?.role === 'agent' &&
      user?.currentStatus === 'active' &&
      user?.precallCompletedForActiveSession !== true
    ) {
      navigate(`/agent/precall?surveyId=${id}`, { replace: true });
    }
  }, [navigate, user?.currentStatus, user?.precallCompletedForActiveSession, user?.role, id, urlSerial]);

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

  const refreshEligibility = useCallback(async () => {
    setEligLoading(true);
    try {
      const serialQ = urlSerial ? `&serial=${encodeURIComponent(urlSerial)}` : '';
      const res = await api.get(`/agent/survey-eligibility?surveyId=${id}${serialQ}`);
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
  }, [id, urlSerial]);

  useEffect(() => {
    if (user?.role === 'agent' && user?.currentStatus === 'active') {
      refreshEligibility();
    }
  }, [user?.role, user?.currentStatus, user?.precallCompletedForActiveSession, refreshEligibility]);

  const findNextVisibleIdx = useCallback(
    (startIndex, currentAnswers) => {
      if (!Array.isArray(questions)) return -1;
      for (let i = startIndex; i < questions.length; i++) {
        const qst = questions[i];
        if (!qst) continue;
        if (!qst.visibility) return i;
        try {
          if (evaluateCondition(qst.visibility, currentAnswers || {})) return i;
        } catch (err) {
          console.error('Condition evaluation error at index', i, err);
          return i;
        }
      }
      return -1;
    },
    [questions]
  );

  const goToInterviewStep = useCallback(() => {
    setPhase('interview');
    setInterviewOutcome('');
  }, []);

  const handleStartCall = useCallback(async () => {
    if (questions.length === 0) {
      alert('This survey has no questions!');
      return;
    }
    const data = await refreshEligibility();
    if (!data?.canStartSurvey) {
      alert(surveyEligibilityIntroReason(data?.reason, t));
      return;
    }

    setPrecallSerialNumber(data.precallSerialNumber || '');
    setStartTime(Date.now());

    let merged = {
      ...(data.payload || {}),
      ...(data.existingAnswers || {}),
    };
    let targetIdx = findNextVisibleIdx(0, merged);

    if (data?.precallSerialNumber) {
      try {
        const draftRes = await api.get(`/drafts/${encodeURIComponent(data.precallSerialNumber)}`);
        const draft = draftRes.data;
        if (draft?.answers) {
          merged = { ...merged, ...draft.answers };
        }
        if (draft && typeof draft.currentIdx === 'number' && questions.length > 0) {
          const clamped = Math.max(0, Math.min(draft.currentIdx, questions.length - 1));
          const fromDraft = findNextVisibleIdx(clamped, merged);
          targetIdx = fromDraft !== -1 ? fromDraft : findNextVisibleIdx(0, merged);
        } else if (draft?.answers) {
          targetIdx = findNextVisibleIdx(0, merged);
        }
      } catch (err) {
        console.error('Draft restoration error:', err);
      }
    }

    setAnswers(merged);
    if (data?.interviewOutcome) setInterviewOutcome(data.interviewOutcome);
    if (data?.outcomeReason) setOutcomeReason(data.outcomeReason);

    if (targetIdx === -1) {
      goToInterviewStep();
    } else {
      setPhase('questions');
      setCurrentIdx(targetIdx);
    }
  }, [questions, refreshEligibility, findNextVisibleIdx, goToInterviewStep, t]);

  // Persist answers to Server as they change (must run every render — do not place after early return)
  useEffect(() => {
    if (phase === 'questions' && precallSerialNumber) {
      const timer = setTimeout(async () => {
        try {
          await api.post('/drafts', {
            surveyId: id,
            serialNumber: precallSerialNumber,
            answers,
            currentIdx,
          });
        } catch (err) {
          console.error('Failed to save draft to server:', err);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [answers, currentIdx, phase, id, precallSerialNumber]);

  if (!survey) return <div className="container">{t('loading')}</div>;

  const submitResponse = async () => {
    if (!interviewOutcome) {
      alert(t('mustSelectInterviewOutcome'));
      return;
    }
    if (['partial', 'refused', 'postponed'].includes(interviewOutcome) && !outcomeReason.trim()) {
      alert(t('outcomeReasonRequired') || 'Reason is required for this outcome.');
      return;
    }

    const duration = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
    const payload = {
      surveyId: survey._id,
      durationSecs: duration,
      answers: Object.keys(answers).map((k) => ({ questionId: k, value: answers[k] })),
      interviewOutcome,
      outcomeReason: ['partial', 'refused', 'postponed'].includes(interviewOutcome) ? outcomeReason.trim() : '',
      precallSerialNumber: precallSerialNumber || '',
    };
    try {
      console.log('[TakeSurvey] Submitting response payload:', payload);
      const res = await api.post('/response', payload);
      console.log('[TakeSurvey] Response submission successful:', res.data);

      if (user?.id && user?.statusStartedAt) {
        const draftKey = `precallDraft:${user.id}:${String(user.statusStartedAt)}`;
        sessionStorage.removeItem(draftKey);
      }

      if (precallSerialNumber) {
        await api.delete(`/drafts/${encodeURIComponent(precallSerialNumber)}`);
      }

      const me = await api.get('/auth/me');
      setUser(me.data.user);
      localStorage.setItem('user', JSON.stringify(me.data.user));
      navigate('/', { replace: true });
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
          <p style={{ color: 'var(--danger)', fontWeight: 700, marginBottom: '1rem' }}>
            {surveyEligibilityIntroReason(eligibility.reason, t)}
          </p>
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
          value={interviewOutcome}
          onChange={(e) => setInterviewOutcome(e.target.value)}
        >
          <option value="">{t('precallSelectPlaceholder')}</option>
          {INTERVIEW_OUTCOME_OPTIONS.map((v) => (
            <option key={v} value={v}>
              {t(OUTCOME_TKEY[v])}
            </option>
          ))}
        </select>
        {['partial', 'refused', 'postponed'].includes(interviewOutcome) && (
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, color: 'var(--primary)' }}>
              {interviewOutcome === 'postponed' && t('postponedReasonLabel')}
              {interviewOutcome === 'partial' && t('partialReasonLabel')}
              {interviewOutcome === 'refused' && t('refusedReasonLabel')}
              <span style={{ color: 'var(--danger)', marginLeft: '0.25rem' }}>*</span>
            </label>
            <textarea
              className="input-field"
              rows={3}
              placeholder={t('typeReasonPlaceholder')}
              value={outcomeReason}
              onChange={(e) => setOutcomeReason(e.target.value)}
              style={{ width: '100%', resize: 'vertical', borderColor: !outcomeReason.trim() ? 'var(--danger)' : '' }}
            />
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          <button type="button" className="btn-primary" onClick={() => submitResponse()} disabled={!interviewOutcome}>
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
    if (!text) return '';
    let parsed = String(text);
    const matches = parsed.match(/\{([^}]+)\}/g);
    if (matches) {
      matches.forEach((match) => {
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
              const isActive = answers[q.questionId || `q_${currentIdx}`] === c.text;
              return (
                <button 
                  key={i} 
                  className={`choice-btn ${isActive ? 'active' : ''}`} 
                  onClick={() => handleAnswer(c.text, c.logic)}
                >
                  {c.text}
                </button>
              );
            })}
        </div>
      )}

      {q.type === 'text' && (
        <div className="form-group" style={{ marginTop: '1rem' }}>
          <input
            type="text"
            className="input-field"
            placeholder={t('typeAnswer')}
            value={answers[q.questionId || `q_${currentIdx}`] || ''}
            onChange={(e) => setAnswers(prev => ({ ...prev, [q.questionId || `q_${currentIdx}`]: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.target.value) {
                handleAnswer(e.target.value);
              }
            }}
            autoFocus
          />
        </div>
      )}

      <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem', justifyContent: 'space-between' }}>
        <button 
          className="btn-secondary" 
          onClick={() => {
            setCurrentIdx(Math.max(0, currentIdx - 1));
            window.scrollTo(0, 0);
          }}
          disabled={currentIdx === 0}
        >
          {t('previous') || 'Previous'}
        </button>
        <button 
          className="btn-primary" 
          onClick={() => {
            const nextIdx = findNextVisibleIdx(currentIdx + 1, answers);
            if (nextIdx !== -1) {
              setCurrentIdx(nextIdx);
              window.scrollTo(0, 0);
            } else {
              goToInterviewStep();
              window.scrollTo(0, 0);
            }
          }}
        >
          {t('next') || 'Next'}
        </button>
      </div>
    </div>
  );
}
