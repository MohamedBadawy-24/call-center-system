import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { UIContext } from '../context/UIContext';
import { AuthContext } from '../context/AuthContext';
import { Search, AlertTriangle, CheckCircle, XCircle, ArrowLeft, GitCompare } from 'lucide-react';
import { toast } from 'react-toastify';

export default function CampaignComparison() {
  const { t, isRtl } = useContext(UIContext);
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [surveys, setSurveys] = useState([]);
  const [surveysLoaded, setSurveysLoaded] = useState(false);
  const [selectedSurveyId, setSelectedSurveyId] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  // Load campaigns on mount
  React.useEffect(() => {
    api.get('/surveys').then(res => {
      setSurveys(res.data || []);
      setSurveysLoaded(true);
    }).catch(console.error);
  }, []);

  const handleCompare = async () => {
    if (!selectedSurveyId || !searchValue.trim()) {
      toast.warning('Please select a campaign and enter a serial number or phone number.');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await api.get('/admin/compare', {
        params: { surveyId: selectedSurveyId, searchValue: searchValue.trim() }
      });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch comparison data.');
    } finally {
      setLoading(false);
    }
  };

  const getAnswerForQuestion = (response, questionId) => {
    if (!response || !response.answers) return null;
    const ans = response.answers.find(a => a.questionId === questionId);
    return ans ? ans.value : null;
  };

  const formatAnswer = (value) => {
    if (value === null || value === undefined) return '—';
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  };

  const getAllQuestions = () => {
    if (!result?.surveyA?.sections) return [];
    const questions = [];
    for (const section of result.surveyA.sections) {
      for (const q of section.questions || []) {
        questions.push({ ...q, sectionTitle: section.title });
      }
    }
    return questions;
  };

  const allQuestions = result ? getAllQuestions() : [];

  return (
    <div className="fade-enter-active" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <button className="btn-secondary" onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minHeight: '40px' }}>
          <ArrowLeft size={16} />
          {t('back') || 'Back'}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <GitCompare size={28} style={{ color: 'var(--primary)' }} />
          <h1 style={{ margin: 0 }}>{t('campaignComparison') || 'Campaign Comparison'}</h1>
        </div>
      </div>

      {/* Search Panel */}
      <div className="glass-card" style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '1.25rem', marginTop: 0 }}>
          {t('selectCampaignAndSearch') || 'Select Campaign & Search'}
        </h2>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 280px' }}>
            <label className="form-label">{t('campaigns') || 'Campaign'}</label>
            <select
              className="input-field"
              value={selectedSurveyId}
              onChange={e => setSelectedSurveyId(e.target.value)}
            >
              <option value="">{t('selectCampaign') || '— Select a campaign —'}</option>
              {surveys
                .filter(s => s.isActive !== false)
                .map(s => (
                  <option key={s._id} value={s._id}>{s.title}</option>
                ))}
            </select>
          </div>

          <div style={{ flex: '1 1 240px' }}>
            <label className="form-label">{t('serialOrPhone') || 'Serial or Phone Number'}</label>
            <input
              className="input-field"
              type="text"
              placeholder="e.g. 1001 or 01012345678"
              value={searchValue}
              onChange={e => setSearchValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCompare()}
            />
          </div>

          <div>
            <button
              className="btn-primary"
              onClick={handleCompare}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minHeight: '46px' }}
            >
              {loading ? (
                <span className="spinner" style={{ width: '18px', height: '18px' }} />
              ) : (
                <Search size={18} />
              )}
              {t('compare') || 'Compare'}
            </button>
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="glass-card" style={{ borderColor: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
          <AlertTriangle size={24} style={{ color: 'var(--danger)', flexShrink: 0 }} />
          <p style={{ margin: 0, color: 'var(--danger)', fontWeight: 600 }}>{error}</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <>
          {/* Campaign Labels */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="glass-card" style={{ background: 'hsla(var(--p-h), var(--p-s), var(--p-l), 0.08)', borderColor: 'var(--primary)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--primary)', marginBottom: '0.4rem' }}>
                {t('targetAudienceAgent') || 'Agent Campaign'}
              </div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>{result.surveyA?.title}</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Serial: <strong>{result.serialA || '—'}</strong>
                {result.phoneNumber && <span> · Phone: <strong>{result.phoneNumber}</strong></span>}
              </div>
              {result.responseA?.agentId && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                  Agent: {result.responseA.agentId.name || result.responseA.agentId.email}
                </div>
              )}
            </div>

            <div className="glass-card" style={{ background: 'hsla(260, 80%, 65%, 0.08)', borderColor: 'var(--accent)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent)', marginBottom: '0.4rem' }}>
                {t('targetAudienceQuality') || 'Quality Campaign'}
              </div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>{result.surveyB?.title}</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Serial: <strong>{result.serialB || '—'}</strong>
              </div>
              {result.responseB?.agentId && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                  Agent: {result.responseB.agentId.name || result.responseB.agentId.email}
                </div>
              )}
            </div>
          </div>

          {/* No response banners */}
          {!result.responseA && (
            <div className="glass-card" style={{ borderColor: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', padding: '1rem 1.5rem' }}>
              <AlertTriangle size={20} style={{ color: 'var(--warning)', flexShrink: 0 }} />
              <span style={{ color: 'var(--warning)', fontWeight: 600 }}>No response found in the Agent campaign for this record.</span>
            </div>
          )}
          {!result.responseB && (
            <div className="glass-card" style={{ borderColor: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', padding: '1rem 1.5rem' }}>
              <AlertTriangle size={20} style={{ color: 'var(--warning)', flexShrink: 0 }} />
              <span style={{ color: 'var(--warning)', fontWeight: 600 }}>No response found in the Quality campaign for this record.</span>
            </div>
          )}

          {/* Comparison Table */}
          {result.responseA && result.responseB && allQuestions.length > 0 && (
            <div className="glass-card" style={{ overflow: 'hidden', padding: 0 }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', borderSpacing: 0 }}>
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
