import React, { useState, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Monitor, Search, Save, User, FileText, CheckCircle } from 'lucide-react';
import { api } from '../api/client';
import { UIContext } from '../context/UIContext';
import { toast } from 'react-toastify';
import LoadingSpinner from '../components/LoadingSpinner';

export default function ShadowReview() {
  const { t } = useContext(UIContext);
  const [serialNumber, setSerialNumber] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [survey, setSurvey] = useState(null);
  
  const [shadowAnswers, setShadowAnswers] = useState({});
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!serialNumber.trim()) return;
    
    setLoading(true);
    setData(null);
    setSurvey(null);
    setShadowAnswers({});
    setNotes('');

    try {
      const res = await api.get(`/quality/shadow/${serialNumber.trim()}`);
      setData(res.data);
      
      // Fetch the full survey to render questions
      if (res.data.surveyId) {
        const surveyRes = await api.get(`/surveys/${res.data.surveyId}`);
        setSurvey(surveyRes.data);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to fetch shadow review data');
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerChange = (questionId, value) => {
    setShadowAnswers(prev => ({
      ...prev,
      [questionId]: value
    }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // Format answers as array
      const formattedAnswers = Object.entries(shadowAnswers).map(([questionId, value]) => ({
        questionId,
        value
      }));

      await api.post(`/quality/shadow/${serialNumber.trim()}`, {
        shadowAnswers: formattedAnswers,
        notes,
        openedAt: data.openedAt,
        agentId: data.agentId,
        surveyId: data.surveyId
      });
      
      toast.success('Shadow Review submitted successfully');
      setSerialNumber('');
      setData(null);
      setSurvey(null);
    } catch (err) {
      toast.error('Failed to submit shadow review');
    } finally {
      setSubmitting(false);
    }
  };

  const getAgentAnswer = (questionId) => {
    if (!data || !data.draft || !data.draft.answers) return '—';
    const ans = data.draft.answers.find(a => a.questionId === questionId);
    if (!ans) return '—';
    const v = ans.value;
    if (v === null || v === undefined) return '—';
    if (Array.isArray(v)) return v.map(item => typeof item === 'object' && item !== null ? Object.values(item).join(' | ') : String(item)).join(', ');
    if (typeof v === 'object') return Object.values(v).map(sub => sub != null ? String(sub) : '').join(' | ');
    return String(v);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ paddingBottom: '4rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: 0 }}>
          <Monitor size={32} color="var(--primary)" />
          {t('liveAudit') || 'Live Audit'}
        </h1>
      </div>

      <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '1rem' }}>
          <div className="search-container" style={{ flex: 1 }}>
            <Search className="search-icon" size={20} />
            <input 
              type="text" 
              placeholder="Enter Call Serial Number..." 
              className="search-input"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              disabled={loading}
            />
          </div>
          <button type="submit" className="btn-primary" disabled={loading || !serialNumber.trim()}>
            {loading ? 'Searching...' : 'Start Audit'}
          </button>
        </form>
      </div>

      {loading && <LoadingSpinner />}

      {data && survey && (
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem' }}>
            <div className="glass-card" style={{ flex: 1, padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div className="status-dot" style={{ width: '12px', height: '12px', background: data.isCompleted ? 'var(--success)' : 'var(--warning)' }}></div>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 800 }}>Status</span>
                <div style={{ fontWeight: 800 }}>{data.isCompleted ? 'Completed Response' : 'Live Draft'}</div>
              </div>
            </div>
            <div className="glass-card" style={{ flex: 1, padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <FileText size={24} color="var(--primary)" />
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 800 }}>Survey</span>
                <div style={{ fontWeight: 800 }}>{survey.title}</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            {/* Left Side: Agent's View */}
            <div>
              <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <User size={18} color="var(--text-secondary)" /> Agent Answers
              </h3>
              
              {survey.sections.map((section, sIdx) => (
                <div key={sIdx} className="glass-card" style={{ padding: '1.5rem', marginBottom: '1rem', background: 'var(--bg-secondary)', borderStyle: 'dashed' }}>
                  <h4 style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>{section.title}</h4>
                  {section.questions.map((q, qIdx) => (
                    <div key={q.questionId || qIdx} style={{ marginBottom: '1.5rem' }}>
                      <p style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                        {qIdx + 1}. {q.text}
                      </p>
                      <div style={{ padding: '0.75rem', background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                        {getAgentAnswer(q.questionId || q._id)}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Right Side: Quality's View */}
            <div>
              <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle size={18} color="var(--primary)" /> Your Evaluation
              </h3>

              {survey.sections.map((section, sIdx) => (
                <div key={sIdx} className="glass-card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
                  <h4 style={{ marginBottom: '1rem' }}>{section.title}</h4>
                  {section.questions.map((q, qIdx) => (
                    <div key={q.questionId || qIdx} style={{ marginBottom: '1.5rem' }}>
                      <p style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.5rem' }}>
                        {qIdx + 1}. {q.text}
                      </p>
                      {q.type === 'single-choice' || q.type === 'yes-no' ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                          {(q.options || ['Yes', 'No']).map((opt, oIdx) => (
                            <button
                              key={oIdx}
                              onClick={() => handleAnswerChange(q.questionId || q._id, opt)}
                              className="btn-secondary"
                              style={{
                                background: shadowAnswers[q.questionId || q._id] === opt ? 'var(--primary)' : 'var(--bg-primary)',
                                color: shadowAnswers[q.questionId || q._id] === opt ? '#fff' : 'var(--text-primary)',
                                borderColor: shadowAnswers[q.questionId || q._id] === opt ? 'var(--primary)' : 'var(--glass-border)',
                                padding: '0.5rem 1rem'
                              }}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <input
                          type="text"
                          className="glass-input"
                          placeholder="Your answer..."
                          value={shadowAnswers[q.questionId || q._id] || ''}
                          onChange={(e) => handleAnswerChange(q.questionId || q._id, e.target.value)}
                          style={{ width: '100%', padding: '0.75rem' }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              ))}

              <div className="glass-card" style={{ padding: '1.5rem', marginTop: '2rem' }}>
                <h4 style={{ marginBottom: '1rem' }}>Feedback Notes</h4>
                <textarea
                  className="glass-input"
                  rows="4"
                  placeholder="Enter overall feedback and notes for the agent..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{ width: '100%', padding: '1rem', resize: 'vertical' }}
                />

                <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                  <button 
                    onClick={handleSubmit} 
                    disabled={submitting}
                    className="btn-primary" 
                    style={{ padding: '0.75rem 2rem', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    {submitting ? <div className="spinner" style={{ width: '16px', height: '16px' }} /> : <><Save size={18} /> Submit Audit</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
