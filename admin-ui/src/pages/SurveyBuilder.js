import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function SurveyBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [introScript, setIntroScript] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [sections, setSections] = useState([{
    title: 'Main Section',
    questions: []
  }]);

  useEffect(() => {
    if (id) {
      axios.get(`http://localhost:3000/survey/${id}`).then(res => {
        setTitle(res.data.title || '');
        setIntroScript(res.data.introScript || '');
        setIsActive(res.data.isActive !== false);
        if (res.data.sections && res.data.sections.length > 0) {
          setSections(res.data.sections);
        }
      }).catch(console.error);
    }
  }, [id]);

  const saveSurvey = async () => {
    if (id && isActive) {
      alert('You cannot edit an active campaign. Please go back to the dashboard and End the Campaign first.');
      return;
    }

    try {
      const payload = { title, introScript, sections };
      if (id) {
        await axios.put(`http://localhost:3000/survey/${id}`, payload);
      } else {
        await axios.post('http://localhost:3000/survey', payload);
      }
      alert('Survey saved successfully!');
      navigate('/admin');
    } catch (err) {
      alert(err.response?.data?.error || 'Error saving survey');
    }
  };

  const addSection = () => {
    setSections([...sections, { title: 'New Section', questions: [] }]);
  };

  const addQuestion = (sIdx) => {
    const newSecs = [...sections];
    newSecs[sIdx].questions.push({
      questionId: `q_${Date.now().toString().slice(-6)}`, // Short visual ID
      text: '',
      script: '',
      category: 'main',
      type: 'single_choice',
      choices: []
    });
    setSections(newSecs);
  };

  const updateQuestion = (sIdx, qIdx, field, val) => {
    const newSecs = [...sections];
    newSecs[sIdx].questions[qIdx][field] = val;
    setSections(newSecs);
  };

  const addChoice = (sIdx, qIdx) => {
    const newSecs = [...sections];
    newSecs[sIdx].questions[qIdx].choices.push({
      text: '',
      logic: { action: 'continue', skipToQuestionId: '' }
    });
    setSections(newSecs);
  };

  const updateChoice = (sIdx, qIdx, cIdx, field, val) => {
    const newSecs = [...sections];
    if (field === 'text') {
      newSecs[sIdx].questions[qIdx].choices[cIdx].text = val;
    } else {
      if (!newSecs[sIdx].questions[qIdx].choices[cIdx].logic) {
        newSecs[sIdx].questions[qIdx].choices[cIdx].logic = { action: 'continue' };
      }
      newSecs[sIdx].questions[qIdx].choices[cIdx].logic[field] = val;
    }
    setSections(newSecs);
  };

  return (
    <div className="fade-enter-active">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>{id ? 'Edit Call Script' : 'Create Call Script'}</h1>
        <button className="btn-primary" onClick={saveSurvey}>Save Survey</button>
      </div>

      <div className="glass-card">
        <label className="form-label">Campaign Title</label>
        <input className="input-field" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Health Awareness Poll 2026" />

        <label className="form-label" style={{ marginTop: '1rem' }}>Global Intro Script (Read before starting)</label>
        <textarea className="input-field" value={introScript} onChange={e => setIntroScript(e.target.value)} rows={3} placeholder="e.g. Hello, my name is... I am calling from Baseera..." />
      </div>

      {sections.map((sec, sIdx) => (
        <div key={sIdx} className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <input 
              className="input-field" 
              style={{ fontWeight: 'bold', fontSize: '1.2rem', width: '50%' }}
              value={sec.title} 
              onChange={e => {
                const newSecs = [...sections];
                newSecs[sIdx].title = e.target.value;
                setSections(newSecs);
              }} 
            />
          </div>

          <div>
            {sec.questions.map((q, qIdx) => (
              <div key={qIdx} style={{ padding: '1.5rem', border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '1.5rem', background: '#fff', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                  <input className="input-field" placeholder="Question Text" value={q.text} onChange={e => updateQuestion(sIdx, qIdx, 'text', e.target.value)} style={{ flex: 1 }} />
                  <select className="input-field" style={{ width: '200px' }} value={q.type} onChange={e => updateQuestion(sIdx, qIdx, 'type', e.target.value)}>
                    <option value="single_choice">Single Choice</option>
                    <option value="multiple_choice">Multiple Choice</option>
                    <option value="text">Text Input</option>
                    <option value="info">Info / Script Only</option>
                  </select>
                </div>
                
                <textarea className="input-field" placeholder="Agent Read-Aloud Script for this question (optional)" value={q.script || ''} onChange={e => updateQuestion(sIdx, qIdx, 'script', e.target.value)} rows={2} style={{ marginBottom: '1rem' }} />

                {(q.type === 'single_choice' || q.type === 'multiple_choice') && (
                  <div style={{ padding: '1rem', background: 'var(--bg-color)', borderRadius: '8px' }}>
                    <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Choices & Skip Logic</h4>
                    {q.choices.map((c, cIdx) => (
                      <div key={cIdx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                        <input className="input-field" placeholder="Choice Text" value={c.text} onChange={e => updateChoice(sIdx, qIdx, cIdx, 'text', e.target.value)} style={{ flex: 1 }} />
                        <select className="input-field" style={{ width: '150px' }} value={c.logic?.action || 'continue'} onChange={e => updateChoice(sIdx, qIdx, cIdx, 'action', e.target.value)}>
                          <option value="continue">Continue</option>
                          <option value="skip">Skip To...</option>
                          <option value="terminate">Terminate Call</option>
                        </select>
                        {c.logic?.action === 'skip' && (
                          <input className="input-field" placeholder="Target Question ID (e.g. q_123456)" value={c.logic?.skipToQuestionId || ''} onChange={e => updateChoice(sIdx, qIdx, cIdx, 'skipToQuestionId', e.target.value)} style={{ width: '220px' }} />
                        )}
                      </div>
                    ))}
                    <button className="btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', marginTop: '0.5rem' }} onClick={() => addChoice(sIdx, qIdx)}>+ Add Choice</button>
                  </div>
                )}
                <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'flex-end' }}>
                  Question ID: <strong style={{ color: 'var(--primary)', marginLeft: '0.25rem' }}>{q.questionId}</strong> 
                </div>
              </div>
            ))}
          </div>

          <button className="btn-secondary" onClick={() => addQuestion(sIdx)} style={{ width: '100%', borderStyle: 'dashed' }}>+ Add Question</button>
        </div>
      ))}

      <button className="btn-secondary" style={{ width: '100%', marginBottom: '2rem', padding: '1rem' }} onClick={addSection}>+ Add New Section</button>

    </div>
  );
}
