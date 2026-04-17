import React, { useState, useEffect, useContext } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { UIContext } from '../context/UIContext';

export default function TakeSurvey() {
  const { id } = useParams();
  const { user } = useContext(AuthContext);
  const { t } = useContext(UIContext);
  const [survey, setSurvey] = useState(null);
  
  // flattened array of questions for easier logic jumping
  const [questions, setQuestions] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(-1); // -1 means we are on the Intro Screen
  const [answers, setAnswers] = useState({});
  const [startTime, setStartTime] = useState(null);

  useEffect(() => {
    axios.get(`http://localhost:3000/survey/${id}`).then(res => {
      setSurvey(res.data);
      // Flatten questions from sections for linear navigation
      let allQ = [];
      if (res.data.sections) {
        res.data.sections.forEach(sec => {
          allQ = allQ.concat(sec.questions);
        });
      } else if (res.data.questions) {
        // Fallback for old schema
        allQ = res.data.questions;
      }
      setQuestions(allQ);
    }).catch(console.error);
  }, [id]);

  if (!survey) return <div className="container">{t('loading')}</div>;

  const handleStartCall = () => {
    if (questions.length === 0) {
      alert("This survey has no questions!");
      return;
    }
    setStartTime(Date.now());
    setCurrentIdx(0);
  };

  const handleAnswer = (val, choiceLogic = null) => {
    const q = questions[currentIdx];
    setAnswers({ ...answers, [q.questionId || `q_${currentIdx}`]: val });

    // evaluate logic
    if (choiceLogic && choiceLogic.action) {
      if (choiceLogic.action === 'terminate') {
        submitResponse('disqualified');
        return;
      }
      if (choiceLogic.action === 'skip' && choiceLogic.skipToQuestionId) {
        const targetIdx = questions.findIndex(qst => qst.questionId === choiceLogic.skipToQuestionId);
        if (targetIdx !== -1) {
          setCurrentIdx(targetIdx);
          return;
        }
      }
    }
    
    // next question
    if (currentIdx + 1 < questions.length) {
      setCurrentIdx(currentIdx + 1);
    } else {
      submitResponse('completed');
    }
  };

  const submitResponse = async (status) => {
    const duration = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
    const payload = {
      surveyId: survey._id,
      agentId: user?.id,
      status: status,
      durationSecs: duration,
      answers: Object.keys(answers).map(k => ({ questionId: k, value: answers[k] }))
    };
    try {
      await axios.post('http://localhost:3000/response', payload);
      alert(`${t('completed')}!`);
      setAnswers({});
      setStartTime(null);
      setCurrentIdx(-1);
    } catch (err) {
      console.error(err);
      alert("Error saving response");
    }
  };

  // Render Intro
  if (currentIdx === -1) {
    return (
      <div className="glass-card fade-enter-active">
        <h1>{survey.title}</h1>
        {survey.introScript && (
          <div className="agent-script-box">
            <strong style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>{t('agentReadAloud')}</strong>
            {survey.introScript}
          </div>
        )}
        <button className="btn-primary" onClick={handleStartCall}>{t('startQuestionnaire')}</button>
      </div>
    );
  }

  // Render Question
  const q = questions[currentIdx];
  if (!q) return <div>No valid question data format found.</div>;

  return (
    <div className="glass-card fade-enter-active" key={currentIdx}>
      <h3 style={{ color: "var(--text-secondary)", marginBottom: '0.5rem', fontSize: '0.9rem' }}>
        {q.category ? q.category.toUpperCase() : t('question')} {currentIdx + 1} {t('of')} {questions.length}
      </h3>
      <h2>{q.text}</h2>
      
      {q.script && (
        <div className="agent-script-box">
          <strong style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>{t('agentReadAloud')}</strong>
          {q.script}
        </div>
      )}

      {(q.type === 'info' || !q.type) && (
        <button className="btn-primary" onClick={() => handleAnswer("read")} style={{ marginTop: '1rem' }}>{t('next')}</button>
      )}

      {(q.type === 'single_choice' || q.type === 'multiple_choice') && (
        <div className="choice-grid">
          {q.choices && q.choices.map((c, i) => (
            <button key={i} className="choice-btn" onClick={() => handleAnswer(c.text, c.logic)}>
              {c.text}
            </button>
          ))}
        </div>
      )}

      {q.type === 'text' && (
        <div className="form-group" style={{ marginTop: "1rem" }}>
          <input 
            type="text" 
            className="input-field" 
            placeholder={t('typeAnswer')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.target.value) {
                handleAnswer(e.target.value);
              }
            }}
            autoFocus
          />
        </div>
      )}
    </div>
  );
}
