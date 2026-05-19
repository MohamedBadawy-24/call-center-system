import React, { useEffect, useState, useContext } from 'react';
import { api } from '../api/client';
import { motion, AnimatePresence } from 'framer-motion';
import { History, Search, ChevronDown, ChevronUp, User, ClipboardList, Clock } from 'lucide-react';
import { UIContext } from '../context/UIContext';
import LoadingSpinner from '../components/LoadingSpinner';

import { io } from 'socket.io-client';
import { SOCKET_BASE } from '../api/client';
import { Download, X as CloseIcon, Filter } from 'lucide-react';

export default function ResponseHistory() {
  const { t, language } = useContext(UIContext);
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Export states
  const [showExportModal, setShowExportModal] = useState(false);
  const [surveys, setSurveys] = useState([]);
  const [agents, setAgents] = useState([]);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportFilters, setExportFilters] = useState({
    surveyId: '',
    agentId: '',
    status: '',
    startDate: '',
    endDate: '',
    format: 'xlsx'
  });

  useEffect(() => {
    fetchResponses(true);
    fetchMetadata();

    const socket = io(SOCKET_BASE);
    socket.on('stats-update', () => {
      fetchResponses(false);
    });

    return () => socket.disconnect();
  }, []);

  const fetchMetadata = async () => {
    try {
      const [sRes, aRes] = await Promise.all([
        api.get('/surveys'),
        api.get('/users/list')
      ]);
      setSurveys(sRes.data);
      setAgents(aRes.data.filter(u => u.role === 'agent'));
    } catch (err) {
      console.error("Metadata fetch error:", err);
    }
  };

  const fetchResponses = async (showSpinner = false) => {
    try {
      if (showSpinner) setLoading(true);
      const res = await api.get('/admin/responses');
      setResponses(res.data);
    } catch (err) {
      console.error("Failed to fetch responses:", err);
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  const handleExport = async (e) => {
    e.preventDefault();
    if (!exportFilters.surveyId) {
      alert(t('selectSurveyToExport'));
      return;
    }
    try {
      setExportLoading(true);
      const params = new URLSearchParams(exportFilters).toString();
      const response = await api.get(`/admin/export-advanced?${params}`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const ext = exportFilters.format === 'sav' ? 'sav' : 'xlsx';
      link.setAttribute('download', `export_${new Date().getTime()}.${ext}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setShowExportModal(false);
    } catch (err) {
      console.error("Export error:", err);
      alert("Export failed. Please try again.");
    } finally {
      setExportLoading(false);
    }
  };

  const getQuestionText = (survey, questionId) => {
    if (!survey || !survey.sections) return questionId;
    for (const section of survey.sections) {
      const q = section.questions?.find(qi => (qi.questionId === questionId || qi._id === questionId));
      if (q) return q.text;
    }
    return questionId;
  };

  const filteredResponses = responses.filter(r => {
    const s = searchTerm.toLowerCase();
    return (
      r.surveyId?.title?.toLowerCase().includes(s) ||
      r.agentId?.name?.toLowerCase().includes(s) ||
      r.interviewOutcome?.toLowerCase().includes(s) ||
      r.serialNumber?.toLowerCase().includes(s)
    );
  });

  if (loading) return <LoadingSpinner fullPage />;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="response-history-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: 0 }}>
          <History size={32} color="var(--primary)" />
          {t('responseHistory')}
        </h1>
        
        <div style={{ display: 'flex', gap: '1rem', flex: 1, maxWidth: '600px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input 
              type="text" 
              className="input-field" 
              placeholder={t('searchPlaceholder')} 
              style={{ paddingLeft: '40px' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="btn-primary" onClick={() => setShowExportModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Download size={18} /> {t('advancedExport')}
          </button>
        </div>
      </div>

      {/* Export Modal */}
      <AnimatePresence>
        {showExportModal && (
          <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="drawer-overlay"
              style={{ 
                zIndex: 2000, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                padding: '1.5rem' 
              }}
              onClick={() => setShowExportModal(false)}
            >
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="glass-card"
                onClick={(e) => e.stopPropagation()}
                style={{ 
                  width: '100%', 
                  maxWidth: '500px', 
                  maxHeight: '90vh', 
                  overflowY: 'auto',
                  padding: '2.5rem',
                  position: 'relative',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                  border: '1px solid var(--primary)'
                }}
              >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Download color="var(--primary)" /> {t('advancedExport')}
                </h2>
                <button className="nav-action-btn" onClick={() => setShowExportModal(false)}>
                  <CloseIcon size={20} />
                </button>
              </div>

              <form onSubmit={handleExport} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div className="form-group">
                  <label className="form-label">{t('campaignTitle')}</label>
                  <select 
                    className="input-field" 
                    required 
                    value={exportFilters.surveyId}
                    onChange={e => setExportFilters({ ...exportFilters, surveyId: e.target.value })}
                  >
                    <option value="">{t('precallSelectPlaceholder')}</option>
                    {surveys.map(s => <option key={s._id} value={s._id}>{s.title}</option>)}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">{t('startDate')}</label>
                    <input 
                      type="date" 
                      className="input-field"
                      value={exportFilters.startDate}
                      onChange={e => setExportFilters({ ...exportFilters, startDate: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('endDate')}</label>
                    <input 
                      type="date" 
                      className="input-field"
                      value={exportFilters.endDate}
                      onChange={e => setExportFilters({ ...exportFilters, endDate: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">{t('agentName')}</label>
                  <select 
                    className="input-field" 
                    value={exportFilters.agentId}
                    onChange={e => setExportFilters({ ...exportFilters, agentId: e.target.value })}
                  >
                    <option value="">{t('allAgents')}</option>
                    {agents.map(a => <option key={a._id} value={a._id}>{a.name}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">{t('status')}</label>
                  <select 
                    className="input-field" 
                    value={exportFilters.status}
                    onChange={e => setExportFilters({ ...exportFilters, status: e.target.value })}
                  >
                    <option value="">{t('allStatuses')}</option>
                    <option value="completed">Completed</option>
                    <option value="partial">Partial</option>
                    <option value="disqualified">Disqualified</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">{t('exportFormat')}</label>
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600 }}>
                      <input 
                        type="radio" 
                        name="format" 
                        value="xlsx" 
                        checked={exportFilters.format === 'xlsx'}
                        onChange={e => setExportFilters({ ...exportFilters, format: e.target.value })}
                      />
                      EXCEL
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600 }}>
                      <input 
                        type="radio" 
                        name="format" 
                        value="sav" 
                        checked={exportFilters.format === 'sav'}
                        onChange={e => setExportFilters({ ...exportFilters, format: e.target.value })}
                      />
                      SPSS (.sav)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600 }}>
                      <input 
                        type="radio" 
                        name="format" 
                        value="access" 
                        checked={exportFilters.format === 'access'}
                        onChange={e => setExportFilters({ ...exportFilters, format: e.target.value })}
                      />
                      ACCESS (Import)
                    </label>
                  </div>
                  {exportFilters.format === 'access' && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem', fontStyle: 'italic' }}>
                      * Downloads an optimized Excel file ready for MS Access "External Data" import.
                    </div>
                  )}
                </div>

                <button 
                  type="submit" 
                  className="btn-primary" 
                  disabled={exportLoading}
                  style={{ marginTop: '0.5rem', height: '3rem', fontSize: '1.1rem' }}
                >
                  {exportLoading ? t('loading') : t('download')}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        {filteredResponses.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <ClipboardList size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
            <p>No responses found matching your search.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid var(--border-color)' }}>
                <tr>
                   <th style={{ padding: '1.25rem', textAlign: 'left' }}>{t('serial') || 'Serial'}</th>
                   <th style={{ padding: '1.25rem', textAlign: 'left' }}>{t('surveyTitle')}</th>
                   <th style={{ padding: '1.25rem', textAlign: 'left' }}>{t('agentName')}</th>
                   <th style={{ padding: '1.25rem', textAlign: 'left' }}>{t('submissionDate')}</th>
                   <th style={{ padding: '1.25rem', textAlign: 'left' }}>{t('outcome')}</th>
                   <th style={{ padding: '1.25rem', textAlign: 'center' }}>{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredResponses.map(r => (
                  <React.Fragment key={r._id}>
                    <tr 
                      style={{ 
                        borderBottom: '1px solid var(--border-color)', 
                        transition: 'background 0.2s',
                        cursor: 'pointer'
                      }}
                      className="hover-row"
                      onClick={() => setExpandedId(expandedId === r._id ? null : r._id)}
                    >
                       <td style={{ padding: '1.25rem' }}>
                        <div style={{ fontWeight: 900, color: 'var(--primary)' }}>#{r.serialNumber || 'N/A'}</div>
                      </td>
                      <td style={{ padding: '1.25rem' }}>
                        <div style={{ fontWeight: 800 }}>{r.surveyId?.title || 'Unknown Survey'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem' }}>
                          <Clock size={12} /> {r.durationSecs || 0} {t('sec')}
                        </div>
                      </td>
                      <td style={{ padding: '1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <User size={16} color="var(--primary)" />
                          <span>{r.agentId?.name || 'Unknown Agent'}</span>
                        </div>
                      </td>
                      <td style={{ padding: '1.25rem', fontSize: '0.85rem' }}>
                        {new Date(r.completedAt || r.startedAt).toLocaleString()}
                      </td>
                      <td style={{ padding: '1.25rem' }}>
                        <span style={{ 
                          padding: '0.25rem 0.75rem', 
                          borderRadius: '20px', 
                          fontSize: '0.75rem', 
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          background: 
                            r.status === 'completed' ? 'rgba(var(--success-rgb), 0.1)' : 
                            r.status === 'disqualified' ? 'rgba(var(--danger-rgb), 0.1)' :
                            'rgba(var(--warning-rgb), 0.1)',
                          color: 
                            r.status === 'completed' ? 'var(--success)' : 
                            r.status === 'disqualified' ? 'var(--danger)' :
                            'var(--warning)'
                        }}>
                          {r.interviewOutcome || r.status}
                        </span>
                      </td>
                      <td style={{ padding: '1.25rem', textAlign: 'center' }}>
                        <button 
                          className="btn-secondary" 
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}
                        >
                          {expandedId === r._id ? t('closeAnswers') : t('viewAnswers')}
                          {expandedId === r._id ? <ChevronUp size={14} style={{ marginLeft: '0.4rem' }} /> : <ChevronDown size={14} style={{ marginLeft: '0.4rem' }} />}
                        </button>
                      </td>
                    </tr>
                    
                    <AnimatePresence>
                      {expandedId === r._id && (
                        <tr>
                          <td colSpan="5" style={{ padding: 0, background: 'rgba(255,255,255,0.02)' }}>
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              style={{ overflow: 'hidden' }}
                            >
                              <div style={{ padding: '1.5rem 2.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                                {r.outcomeReason && (
                                  <div className="answer-item" style={{ borderLeft: '3px solid var(--warning)', paddingLeft: '1rem', gridColumn: '1 / -1' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                                      {t('reason') || 'Reason for Outcome'}
                                    </div>
                                    <div style={{ fontWeight: 600 }}>{r.outcomeReason}</div>
                                  </div>
                                )}
                                {r.answers && r.answers.length > 0 ? (
                                  r.answers.map((ans, idx) => (
                                    <div key={idx} className="answer-item" style={{ borderLeft: '3px solid var(--primary)', paddingLeft: '1rem' }}>
                                      <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                                        {getQuestionText(r.surveyId, ans.questionId)}
                                      </div>
                                      <div style={{ fontWeight: 600 }}>{ans.value || '—'}</div>
                                    </div>
                                  ))
                                ) : (
                                  <div style={{ color: 'var(--text-secondary)', gridColumn: '1 / -1' }}>No answers recorded for this response.</div>
                                )}
                              </div>
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      <style>{`
        .hover-row:hover {
          background: rgba(255,255,255,0.05);
        }
        .answer-item {
          transition: transform 0.2s;
        }
        .answer-item:hover {
          transform: translateX(5px);
        }
        th {
          font-weight: 800;
          color: var(--text-secondary);
          text-transform: uppercase;
          font-size: 0.75rem;
          letter-spacing: 0.05em;
        }
      `}</style>
    </motion.div>
  );
}
