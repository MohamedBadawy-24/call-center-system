/**
 * DIAGNOSTIC - OtherAnswersCoding.jsx
 * Page allowing Quality/Admin to code raw "other" choice text answers into numeric/categorical codes.
 *
 * Steps:
 * 1. Select campaign and question.
 * 2. Systems fetches other answers and saved codings.
 * 3. Inline editable value table with + Add Row.
 * 4. Auto-save on edit with 800ms debounce.
 * 5. Secure CSV/Excel export fetch.
 */
import React, { useEffect, useState, useContext, useRef } from 'react';
import { api } from '../api/client';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, HelpCircle, Save, Plus, ArrowLeft, Download } from 'lucide-react';
import { UIContext } from '../context/UIContext';
import { AuthContext } from '../context/AuthContext';
import { toast } from 'react-toastify';
import LoadingSpinner from '../components/LoadingSpinner';

export default function OtherAnswersCoding() {
  const { t } = useContext(UIContext);
  const { user } = useContext(AuthContext);

  const [campaigns, setCampaigns] = useState([]);
  const [selectedSurveyId, setSelectedSurveyId] = useState('');
  const [questions, setQuestions] = useState([]);
  const [selectedQuestionId, setSelectedQuestionId] = useState('');
  
  const [codings, setCodings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Keep a ref to track if codings changed locally to trigger auto-save
  const hasLocalChanges = useRef(false);

  // Fetch campaigns on mount
  useEffect(() => {
    const fetchCampaigns = async () => {
      try {
        const res = await api.get('/surveys');
        setCampaigns(res.data || []);
      } catch (err) {
        toast.error('Failed to load campaigns');
      }
    };
    fetchCampaigns();
  }, []);

  // Fetch questions when campaign changes
  useEffect(() => {
    if (!selectedSurveyId) {
      setQuestions([]);
      setSelectedQuestionId('');
      setCodings([]);
      return;
    }

    const fetchQuestions = async () => {
      setQuestionsLoading(true);
      try {
        const res = await api.get(`/quality/other-coding/${selectedSurveyId}/questions`);
        setQuestions(res.data || []);
        setSelectedQuestionId('');
        setCodings([]);
      } catch (err) {
        toast.error('Failed to load questions with other answers');
      } finally {
        setQuestionsLoading(false);
      }
    };
    fetchQuestions();
  }, [selectedSurveyId]);

  // Fetch coding table when question changes
  useEffect(() => {
    if (!selectedSurveyId || !selectedQuestionId) {
      setCodings([]);
      return;
    }

    const fetchCodingTable = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/quality/other-coding/${selectedSurveyId}/${selectedQuestionId}`);
        setCodings(res.data.codings || []);
        hasLocalChanges.current = false;
      } catch (err) {
        toast.error('Failed to load coding table');
      } finally {
        setLoading(false);
      }
    };
    fetchCodingTable();
  }, [selectedSurveyId, selectedQuestionId]);

  // Debounced auto-save logic
  useEffect(() => {
    if (!selectedSurveyId || !selectedQuestionId || !hasLocalChanges.current) return;

    const saveTable = async () => {
      setIsSaving(true);
      try {
        await api.put(`/quality/other-coding/${selectedSurveyId}/${selectedQuestionId}`, { codings });
        hasLocalChanges.current = false;
      } catch (err) {
        toast.error('Failed to auto-save coding table');
      } finally {
        setIsSaving(false);
      }
    };

    const timer = setTimeout(saveTable, 800);
    return () => clearTimeout(timer);
  }, [codings, selectedSurveyId, selectedQuestionId]);

  const handleValueChange = (idx, val) => {
    hasLocalChanges.current = true;
    setCodings(prev => prev.map((item, i) => i === idx ? { ...item, value: val } : item));
  };

  const handleAnswerChange = (idx, ans) => {
    hasLocalChanges.current = true;
    setCodings(prev => prev.map((item, i) => i === idx ? { ...item, answer: ans } : item));
  };

  const handleAddRow = () => {
    hasLocalChanges.current = true;
    setCodings(prev => [...prev, { answer: '', value: '' }]);
  };

  const handleDeleteRow = (idx) => {
    hasLocalChanges.current = true;
    setCodings(prev => prev.filter((_, i) => i !== idx));
  };

  const handleExport = async (format) => {
    try {
      const res = await api.get(`/quality/other-coding/${selectedSurveyId}/${selectedQuestionId}/export?format=${format}`, {
        responseType: 'blob'
      });
      const blob = new Blob([res.data], { type: format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const contentDisposition = res.headers['content-disposition'];
      let filename = `other_coding_${format === 'xlsx' ? 'export.xlsx' : 'export.csv'}`;
      if (contentDisposition) {
        const matches = contentDisposition.match(/filename="?([^"]+)"?/);
        if (matches && matches[1]) filename = matches[1];
      }
      
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error('Failed to export coding table');
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ paddingBottom: '4rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: 0 }}>
          <BookOpen size={32} color="var(--primary)" />
          {t('otherAnswersCoding')}
        </h1>
      </div>

      {/* Step 1: Campaign and Question Selection */}
      <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">{t('campaigns')}</label>
            <select
              className="input-field"
              value={selectedSurveyId}
              onChange={e => setSelectedSurveyId(e.target.value)}
            >
              <option value="">{t('precallSelectPlaceholder') || 'Select Campaign...'}</option>
              {campaigns.map(c => (
                <option key={c._id} value={c._id}>{c.title}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">{t('selectQuestion')}</label>
            <select
              className="input-field"
              value={selectedQuestionId}
              onChange={e => setSelectedQuestionId(e.target.value)}
              disabled={!selectedSurveyId || questionsLoading}
            >
              {questionsLoading ? (
                <option>{t('loading')}</option>
              ) : (
                <>
                  <option value="">{t('precallSelectPlaceholder') || 'Select Question...'}</option>
                  {questions.map(q => (
                    <option key={q.questionId} value={q.questionId}>{q.text}</option>
                  ))}
                </>
              )}
            </select>
          </div>
        </div>
      </div>

      {loading && <LoadingSpinner />}

      {/* Steps 2-4: Table, Add Row, Export */}
      {selectedQuestionId && !loading && (
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2 md:gap-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <HelpCircle size={18} color="var(--primary)" />
                Answers Coding List
                {isSaving && <span style={{ fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 'normal' }}>(Saving...)</span>}
              </h3>
              
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => handleExport('csv')}
                  className="btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}
                >
                  <Download size={16} /> CSV
                </button>
                <button
                  onClick={() => handleExport('xlsx')}
                  className="btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}
                >
                  <Download size={16} /> Excel
                </button>
              </div>
            </div>

            <div className="table-responsive w-full overflow-x-auto" style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', minWidth: '500px', borderCollapse: 'separate', borderSpacing: '0 0.5rem' }}>
              <thead>
                <tr>
                  <th>{t('answerColumn')}</th>
                  <th>{t('valueColumn')}</th>
                  <th style={{ width: '80px' }}></th>
                </tr>
              </thead>
              <tbody>
                {codings.map((c, idx) => (
                  <tr key={idx}>
                    <td>
                      <input
                        type="text"
                        className="input-field"
                        value={c.answer}
                        placeholder="Raw answer text..."
                        onChange={e => handleAnswerChange(idx, e.target.value)}
                        style={{ width: '100%', fontWeight: 700 }}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="input-field"
                        value={c.value}
                        placeholder="Categorical or numeric code..."
                        onChange={e => handleValueChange(idx, e.target.value)}
                        style={{ width: '100%' }}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => handleDeleteRow(idx)}
                        style={{ color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)', padding: '0.5rem' }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            {codings.length === 0 && (
              <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem 0' }}>
                No raw other answers found for this question yet. You can pre-code new values manually.
              </p>
            )}

            <button
              onClick={handleAddRow}
              className="btn-secondary"
              style={{ width: '100%', borderStyle: 'dashed', marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
            >
              <Plus size={16} /> {t('addRow')}
            </button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
