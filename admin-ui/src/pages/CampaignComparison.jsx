import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { AuthContext } from '../context/AuthContext';
import { useLanguage } from '../hooks/useLanguage';
import { Search, AlertTriangle, CheckCircle, XCircle, ArrowLeft, GitCompare } from 'lucide-react';
import { toast } from 'react-toastify';

export default function CampaignComparison() {
  const { t, language } = useLanguage();
  const isRtl = language === 'ar';
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [surveys, setSurveys] = useState([]);
  const [surveysLoaded, setSurveysLoaded] = useState(false);
  const [selectedSurveyId, setSelectedSurveyId] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const loadSurveys = async () => {
    try {
      const res = await api.get('/admin/surveys-stats');
      const linked = res.data.filter(s => s.linkedCampaignId);
      setSurveys(linked);
      if (linked.length > 0) setSelectedSurveyId(linked[0]._id);
      setSurveysLoaded(true);
    } catch (err) {
      toast.error(t('failedLoadCampaigns') || 'Failed to load campaigns for comparison');
    }
  };

  const handleCompare = async (e) => {
    e.preventDefault();
    if (!selectedSurveyId || !searchValue.trim()) return;

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await api.get(`/admin/compare/${selectedSurveyId}/${encodeURIComponent(searchValue.trim())}`);
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.message || t('failedCompareResponses') || 'Failed to compare responses');
    } finally {
      setLoading(false);
    }
  };

  // Helper to extract a flat map of question answers
  const getFlatAnswers = (responseDoc) => {
    if (!responseDoc || !responseDoc.answers) return {};
    return responseDoc.answers;
  };

  // Merge questions from both surveys to show a comprehensive comparison table
  const allQuestionsMap = new Map();
  
  if (result) {
    const processSurvey = (survey) => {
      if (!survey || !survey.sections) return;
      survey.sections.forEach(sec => {
        sec.questions.forEach(q => {
          if (q.type === 'group') {
            if (q.subInputs) {
              q.subInputs.forEach(sub => {
                const flatId = `${q.questionId}_${sub.id}`;
                if (!allQuestionsMap.has(flatId)) {
                  allQuestionsMap.set(flatId, { id: flatId, text: `${q.text} - ${sub.label}` });
                }
              });
            }
          } else {
            if (!allQuestionsMap.has(q.questionId)) {
              allQuestionsMap.set(q.questionId, { id: q.questionId, text: q.text });
            }
          }
        });
      });
    };

    processSurvey(result.surveyA);
    processSurvey(result.surveyB);
  }

  const allQuestions = Array.from(allQuestionsMap.values());
  const ansA = result ? getFlatAnswers(result.responseA) : {};
  const ansB = result ? getFlatAnswers(result.responseB) : {};

  // Formatter for display
  const formatAnswer = (val) => {
    if (val === null || val === undefined || val === '') return <span style={{ color: 'var(--text-disabled)', fontStyle: 'italic' }}>—</span>;
    if (Array.isArray(val)) return val.join(', ');
    if (typeof val === 'boolean') return val ? (t('yes') || 'Yes') : (t('no') || 'No');
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  return (
    <div dir="auto" style={{ paddingBottom: '4rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <button className="btn-secondary" onClick={() => navigate('/admin')} style={{ padding: '0.5rem' }}>
          <ArrowLeft size={20} />
        </button>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: 0 }}>
          <GitCompare size={32} color="var(--primary)" />
          {t('campaignComparison') || 'Campaign Comparison'}
        </h1>
      </div>

      <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>{t('compareQualityAgentResponses') || 'Compare Quality vs Agent Responses'}</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
          {t('compareDescription') || "Select an Agent Campaign that has a linked Quality Campaign, then search by the record's identifier (Serial Number or Phone) to see the responses side-by-side."}
        </p>

        {!surveysLoaded ? (
          <button className="btn-primary" onClick={loadSurveys}>{t('loadLinkedCampaigns') || 'Load Linked Campaigns'}</button>
        ) : (
          <form onSubmit={handleCompare} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 300px' }}>
              <label className="form-label">{t('selectAgentCampaign') || 'Select Agent Campaign'}</label>
              <select className="input-field" value={selectedSurveyId} onChange={(e) => setSelectedSurveyId(e.target.value)} required>
                <option value="">-- {t('selectCampaign') || 'Select Campaign'} --</option>
                {surveys.map(s => (
                  <option key={s._id} value={s._id}>{s.title} ({t('matchBy') || 'Match by'}: {s.comparisonMatchField})</option>
                ))}
              </select>
            </div>
            
            <div style={{ flex: '1 1 250px' }}>
              <label className="form-label">{t('searchIdentifier') || 'Search Identifier'}</label>
              <div className="search-container" style={{ margin: 0 }}>
                <Search className="search-icon" size={20} />
                <input 
                  type="text" 
                  placeholder={t('serialOrPhone') || "Serial # or Phone..."} 
                  className="search-input"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', height: '68px' }}>
              <button type="submit" className="btn-primary" disabled={loading} style={{ height: '42px', padding: '0 2rem' }}>
                {loading ? (t('searching') || 'Searching...') : (t('compare') || 'Compare')}
              </button>
            </div>
          </form>
        )}

        {error && (
          <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
            <AlertTriangle size={20} />
            {error}
          </div>
        )}
      </div>

      {result && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="glass-card" style={{ background: 'hsla(var(--p-h), var(--p-s), var(--p-l), 0.08)', borderColor: 'var(--primary)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--primary)', marginBottom: '0.4rem' }}>
                {t('agentCampaign') || 'Agent Campaign'}
              </div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>{result.surveyA?.title}</div>
            </div>
            <div className="glass-card" style={{ background: 'hsla(260, 80%, 65%, 0.08)', borderColor: 'var(--accent)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '0.4rem' }}>
                {t('qualityCampaign') || 'Quality Campaign'}
              </div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>{result.surveyB?.title}</div>
            </div>
          </div>

          {!result.responseA && (
            <div className="glass-card" style={{ borderColor: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', padding: '1rem 1.5rem' }}>
              <AlertTriangle size={20} style={{ color: 'var(--warning)', flexShrink: 0 }} />
              <span style={{ color: 'var(--warning)', fontWeight: 600 }}>{t('noResponseFoundAgent') || 'No response found in the Agent campaign for this record.'}</span>
            </div>
          )}
          {!result.responseB && (
            <div className="glass-card" style={{ borderColor: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', padding: '1rem 1.5rem' }}>
              <AlertTriangle size={20} style={{ color: 'var(--warning)', flexShrink: 0 }} />
              <span style={{ color: 'var(--warning)', fontWeight: 600 }}>{t('noResponseFoundQuality') || 'No response found in the Quality campaign for this record.'}</span>
            </div>
          )}

          {result.responseA && result.responseB && allQuestions.length > 0 && (
            <div className="glass-card" style={{ overflow: 'hidden', padding: 0 }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--primary-low)' }}>
                      <th style={{ padding: '0.85rem 1.25rem', textAlign: isRtl ? 'right' : 'left', fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', width: '35%', borderBottom: '1px solid var(--border-color)' }}>
                        {t('question') || 'Question'}
                      </th>
                      <th style={{ padding: '0.85rem 1.25rem', textAlign: isRtl ? 'right' : 'left', fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--primary)', borderBottom: '1px solid var(--border-color)' }}>
                        {result.surveyA?.title}
                      </th>
                      <th style={{ padding: '0.85rem 1.25rem', textAlign: isRtl ? 'right' : 'left', fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent)', borderBottom: '1px solid var(--border-color)' }}>
                        {result.surveyB?.title}
                      </th>
                      <th style={{ padding: '0.85rem 1.25rem', textAlign: 'center', fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', width: '90px' }}>
                        {t('match') || 'Match'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {allQuestions.map((q, idx) => {
                      const qId = q.questionId || String(q._id);
                      const ansA = getAnswerForQuestion(result.responseA, qId);
                      const ansB = getAnswerForQuestion(result.responseB, qId);

                      const formattedA = formatAnswer(ansA);
                      const formattedB = formatAnswer(ansB);
                      const isMatch = formattedA === formattedB;
                      const bothEmpty = formattedA === '—' && formattedB === '—';
                      const isDiscrepancy = !isMatch && !bothEmpty;

                      return (
                        <tr
                          key={qId}
                          style={{
                            background: isDiscrepancy ? 'hsla(0, 85%, 60%, 0.06)' : 'transparent',
                            borderBottom: '1px solid var(--border-color)',
                            borderLeft: isDiscrepancy ? '3px solid var(--danger)' : '3px solid transparent',
                          }}
                        >
                          <td style={{ padding: '0.75rem 1.25rem', fontWeight: 500, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.2rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              {q.sectionTitle}
                            </div>
                            {q.text}
                          </td>
                          <td style={{ padding: '0.75rem 1.25rem', fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                            <span style={{ background: 'hsla(var(--p-h), var(--p-s), var(--p-l), 0.1)', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: 600 }}>
                              {formattedA}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1.25rem', fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                            <span style={{ background: 'hsla(260, 80%, 65%, 0.1)', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: 600 }}>
                              {formattedB}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1.25rem', textAlign: 'center' }}>
                            {bothEmpty ? (
                              <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>—</span>
                            ) : isMatch ? (
                              <CheckCircle size={18} style={{ color: 'var(--success)' }} />
                            ) : (
                              <XCircle size={18} style={{ color: 'var(--danger)' }} />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Summary Stats */}
          {result.responseA && result.responseB && allQuestions.length > 0 && (() => {
            let matches = 0, discrepancies = 0, skipped = 0;
            for (const q of allQuestions) {
              const qId = q.questionId || String(q._id);
              const a = formatAnswer(getAnswerForQuestion(result.responseA, qId));
              const b = formatAnswer(getAnswerForQuestion(result.responseB, qId));
              if (a === '—' && b === '—') skipped++;
              else if (a === b) matches++;
              else discrepancies++;
            }
            const total = matches + discrepancies;
            const pct = total > 0 ? Math.round((matches / total) * 100) : 0;

            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
                {[
                  { label: t('matchRate') || 'Match Rate', value: `${pct}%`, color: pct >= 80 ? 'var(--success)' : pct >= 60 ? 'var(--warning)' : 'var(--danger)' },
                  { label: t('matches') || 'Matches', value: matches, color: 'var(--success)' },
                  { label: t('discrepancies') || 'Discrepancies', value: discrepancies, color: 'var(--danger)' },
                  { label: t('notAnswered') || 'Not Answered', value: skipped, color: 'var(--text-secondary)' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="glass-card" style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color }}>{value}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                  </div>
                ))}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
