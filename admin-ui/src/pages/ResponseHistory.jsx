import React, { useEffect, useState, useContext, useMemo } from 'react';
import { api } from '../api/client';
import { motion, AnimatePresence } from 'framer-motion';
import { History, Search, ChevronDown, ChevronUp, User, ClipboardList, Clock } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import LoadingSpinner from '../components/LoadingSpinner';
import FlagPopover from '../components/FlagPopover';

import { io } from 'socket.io-client';
import { SOCKET_BASE } from '../api/client';
import { Download, X as CloseIcon, Filter, Flag, AlertTriangle, Check, Trash2, RefreshCcw } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { toast } from 'react-toastify';

export default function ResponseHistory() {
  const { t, language } = useLanguage();
  const isRtl = language === 'ar';
  const { user } = useContext(AuthContext);
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
  const [viewFlagged, setViewFlagged] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [activePopoverResponseId, setActivePopoverResponseId] = useState(null);
  const [resolveErrorMap, setResolveErrorMap] = useState({});

  // Delete modal state
  const [deleteModalResponse, setDeleteModalResponse] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleDeleteResponse = async (responseId, action) => {
    try {
      setDeleteLoading(true);
      await api.post(`/admin/responses/${responseId}/delete`, { action });
      if (action === 'hard_delete') {
        setResponses(prev => prev.filter(r => r._id !== responseId));
        toast.success('Response permanently deleted');
      } else {
        setResponses(prev => prev.map(r => {
          if (r._id === responseId) {
            return { ...r, status: 'disqualified', isValid: false };
          }
          return r;
        }));
        toast.success('Response disqualified (soft delete)');
      }
      setDeleteModalResponse(null);
    } catch (err) {
      console.error('[DELETE RESPONSE ERROR]', err);
      toast.error(err.response?.data?.error || 'Failed to delete response');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleResolveFlag = async (responseId, e) => {
    e.stopPropagation();
    try {
      setResolveErrorMap(prev => ({ ...prev, [responseId]: null }));
      await api.patch(`/reviews/${responseId}/resolve`);
      setResponses(prev => prev.map(resObj => {
        if (resObj._id === responseId) {
          return {
            ...resObj,
            resolved: true
          };
        }
        return resObj;
      }));
    } catch (err) {
      console.error("[RESOLVE FLAG ERROR]", err);
      const errMsg = err.response?.data?.error || "Failed to resolve flag";
      setResolveErrorMap(prev => ({ ...prev, [responseId]: errMsg }));
    }
  };

  useEffect(() => {
    if (viewFlagged) {
      fetchFlagged();
    } else {
      fetchResponses(true);
    }
    fetchMetadata();

    const token = localStorage.getItem('token');
    const socket = io(SOCKET_BASE, { auth: { token } });
    socket.on('stats-update', () => {
      if (viewFlagged) fetchFlagged();
      else fetchResponses(false);
    });

    return () => socket.disconnect();
  }, [viewFlagged, showDeleted]);

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
      const res = await api.get(`/admin/responses?showDeleted=${showDeleted}`);
      setResponses(res.data);
    } catch (err) {
      console.error("Failed to fetch responses:", err);
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  const fetchFlagged = async () => {
    try {
      setLoading(true);
      const res = await api.get('/reviews/flagged');
      // Map the flagged array to look like responses, but add the flag info
      const mapped = res.data.map(f => {
        if (!f.responseId) return null;
        return {
          ...f.responseId,
          flagNote: f.flagNote,
          flaggedBy: f.qualityId?.name,
          flaggedAt: f.createdAt,
          resolved: f.resolved,
          resolvedBy: f.resolvedBy,
          resolvedAt: f.resolvedAt
        };
      }).filter(Boolean);
      setResponses(mapped);
    } catch (err) {
      toast.error("Failed to fetch flagged responses");
    } finally {
      setLoading(false);
    }
  };


  const handleExport = async (e) => {
    e.preventDefault();
    if (!exportFilters.surveyId) {
      toast.error(t('selectSurveyToExport'));
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
      toast.error(t('surveyLoadFailed') || 'Export failed. Please try again.');
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

  const resolveNoteRef = (survey, refId) => {
    if (!refId || refId === 'general' || refId === 'generalEntireSurvey') {
      return t('generalEntireSurvey') || 'General / Entire Survey';
    }
    if (!survey || !survey.sections) return refId;
    const searchQuestions = (qList) => {
      for (const q of (qList || [])) {
        const qId = q.questionId || q._id;
        if (String(qId) === String(refId)) return `${qId} - ${q.text || ''}`;
        if (q.type === 'group' && Array.isArray(q.questions)) {
          const found = searchQuestions(q.questions);
          if (found) return found;
        }
      }
      return null;
    };
    for (const sec of survey.sections) {
      const found = searchQuestions(sec.questions);
      if (found) return found;
    }
    return refId;
  };

  const codeToLabelMap = useMemo(() => {
    const map = {};
    surveys.forEach(survey => {
      (survey.sections || []).forEach(sec => {
        const processQ = (qList) => {
          (qList || []).forEach(q => {
            if (q.type === 'group' && Array.isArray(q.questions)) {
              processQ(q.questions);
            } else {
              const qId = q.questionId || q._id;
              if (qId) {
                if (!map[qId]) map[qId] = {};
                (q.choices || []).forEach(c => {
                  const val = c.value || c.text || c;
                  const text = c.text || c;
                  map[qId][String(val).trim()] = text;
                });
                (q.options || []).forEach(opt => {
                  const val = typeof opt === 'object' ? (opt.value || opt.label || opt) : opt;
                  const text = typeof opt === 'object' ? (opt.label || opt.text || opt) : opt;
                  map[qId][String(val).trim()] = text;
                });
                if (q.type === 'multi_input' && q.subInputs) {
                  q.subInputs.forEach(sub => {
                    (sub.options || []).forEach(opt => {
                      const val = typeof opt === 'object' ? (opt.value || opt.label || opt) : opt;
                      const text = typeof opt === 'object' ? (opt.label || opt.text || opt) : opt;
                      map[qId][String(val).trim()] = text;
                    });
                  });
                }
              }
            }
          });
        };
        processQ(sec.questions);
      });
    });
    return map;
  }, [surveys]);

  const formatCellValue = (value, questionId = null) => {
    if (value === null || value === undefined || value === '') return '—';
    if (Array.isArray(value)) return value.map(v => formatCellValue(v, questionId)).join(', ');
    if (typeof value === 'object') {
      return Object.values(value).map(v => formatCellValue(v, questionId)).join(' | ');
    }
    const valStr = String(value).trim();
    if (questionId && codeToLabelMap[questionId] && codeToLabelMap[questionId][valStr]) {
      return codeToLabelMap[questionId][valStr];
    }
    return valStr;
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
        
        <div className="response-history-actions flex flex-col md:flex-row items-stretch md:items-center gap-2 md:gap-4 w-full md:w-auto" style={{ display: 'flex', gap: '1rem', flex: 1, maxWidth: '600px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input 
              type="text" 
              className="input-field w-full" 
              placeholder={t('searchPlaceholder')} 
              style={{ paddingLeft: '40px' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            className="btn-secondary w-full md:w-auto" 
            onClick={() => { setViewFlagged(false); setShowDeleted(!showDeleted); }} 
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: showDeleted ? 'var(--danger)' : '', color: showDeleted ? '#fff' : '' }}
          >
            <Trash2 size={18} /> {showDeleted ? (t('allResponses') || 'View All') : (t('showDeleted') || 'Deleted Responses')}
          </button>
          <button 
            className="btn-secondary w-full md:w-auto" 
            onClick={() => { setShowDeleted(false); setViewFlagged(!viewFlagged); }} 
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: viewFlagged ? 'var(--danger)' : '', color: viewFlagged ? '#fff' : '' }}
          >
            <Flag size={18} /> {viewFlagged ? (t('allResponses') || 'View All') : (t('flaggedResponse') || 'Flagged Only')}
          </button>
          <button className="btn-primary w-full md:w-auto" onClick={() => setShowExportModal(true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
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
            <p style={{ margin: 0, fontWeight: 600 }}>{t('emptyStateNoResponses') || 'No responses found matching your search.'}</p>
          </div>
        ) : (
          <div className="table-responsive w-full overflow-x-auto" style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse' }}>
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
                        cursor: 'pointer',
                        ...(r.isValid === false ? { background: 'rgba(239, 68, 68, 0.05)', opacity: 0.8 } : {})
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
                          <span>{r.agentId?.name || t('notAssigned')}</span>
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
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
                          <button 
                            className="btn-secondary" 
                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}
                          >
                            {expandedId === r._id ? t('closeAnswers') : t('viewAnswers')}
                            {expandedId === r._id ? <ChevronUp size={14} style={{ marginLeft: '0.4rem' }} /> : <ChevronDown size={14} style={{ marginLeft: '0.4rem' }} />}
                          </button>

                          {viewFlagged && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              {r.resolved ? (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  padding: '0.25rem 0.75rem',
                                  borderRadius: '20px',
                                  fontSize: '0.75rem',
                                  fontWeight: 800,
                                  textTransform: 'uppercase',
                                  background: 'hsla(150, 80%, 40%, 0.1)',
                                  color: 'var(--success)'
                                }}>
                                  <Check size={12} strokeWidth={3} style={{ marginRight: language === 'ar' ? '0' : '0.25rem', marginLeft: language === 'ar' ? '0.25rem' : '0' }} />
                                  {t('resolvedBadge')}
                                </span>
                              ) : (
                                <>
                                  {user?.role === 'admin' && (
                                    <button 
                                      className="btn-secondary" 
                                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}
                                      onClick={(e) => handleResolveFlag(r._id, e)}
                                    >
                                      {t('markAsResolved')}
                                    </button>
                                  )}
                                  {resolveErrorMap[r._id] && (
                                    <span style={{ color: 'var(--danger)', fontSize: '0.7rem', fontWeight: 600, display: 'block', marginTop: '0.25rem' }}>
                                      {resolveErrorMap[r._id]}
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                          {(user?.role === 'quality' || user?.role === 'admin') && !viewFlagged && r.isValid !== false && (
                            <div style={{ position: 'relative' }}>
                              <button 
                                className="btn-secondary" 
                                style={{ padding: '0.4rem' }}
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  setActivePopoverResponseId(prev => prev === r._id ? null : r._id); 
                                }}
                                title={r.flagged ? t('flaggedResponse') : t('flagResponse')}
                              >
                                <Flag size={14} color={r.flagged ? "var(--primary)" : "var(--text-secondary)"} fill={r.flagged ? "var(--primary)" : "none"} />
                              </button>
                              {activePopoverResponseId === r._id && (
                                <FlagPopover
                                  responseId={r._id}
                                  serialNumber={r.serialNumber || 'N/A'}
                                  isFlagged={!!r.flagged}
                                  existingFlagCategory={r.flagCategory}
                                  existingFlagNote={r.flagNote}
                                  onFlagSuccess={(updatedReview) => {
                                    setResponses(prev => prev.map(resObj => {
                                      if (resObj._id === r._id) {
                                        return {
                                          ...resObj,
                                          flagged: true,
                                          flagCategory: updatedReview.flagCategory,
                                          flagNote: updatedReview.flagNote,
                                          flaggedBy: user?.name,
                                          flaggedAt: updatedReview.createdAt
                                        };
                                      }
                                      return resObj;
                                    }));
                                    setActivePopoverResponseId(null);
                                    if (viewFlagged) fetchFlagged();
                                  }}
                                  onClose={() => setActivePopoverResponseId(null)}
                                />
                              )}
                            </div>
                          )}
                          {user?.role === 'admin' && !viewFlagged && r.isValid !== false && (
                            <button
                              className="btn-secondary"
                              style={{ padding: '0.4rem', color: 'var(--danger)' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteModalResponse(r);
                              }}
                              title="Delete Response"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                          {user?.role === 'admin' && !viewFlagged && r.isValid === false && (
                            <button
                              className="btn-secondary"
                              style={{ padding: '0.4rem', color: 'var(--success)' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteResponse(r._id, 'restore');
                              }}
                              title={t('restoreResponse') || 'Restore Response'}
                            >
                              <RefreshCcw size={14} />
                            </button>
                          )}
                        </div>
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
                                  {r.flagNote && (
                                    <div className="answer-item" style={{ borderLeft: '3px solid var(--danger)', paddingLeft: '1rem', gridColumn: '1 / -1', background: 'rgba(var(--danger-rgb), 0.05)', padding: '1rem', borderRadius: '8px' }}>
                                      <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--danger)', marginBottom: '0.25rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <AlertTriangle size={16} /> {t('flaggedResponse') || 'Flagged'} — {r.flaggedBy} · {new Date(r.flaggedAt).toLocaleDateString()}
                                      </div>
                                      <div style={{ fontWeight: 600 }}>{r.flagNote}</div>
                                    </div>
                                  )}
                                  {r.outcomeReason && (
                                    <div className="answer-item" style={{ borderLeft: '3px solid var(--warning)', paddingLeft: '1rem', gridColumn: '1 / -1' }}>
                                      <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                                        {t('reason') || 'Reason for Outcome'}
                                      </div>
                                      <div style={{ fontWeight: 600 }}>{r.outcomeReason}</div>
                                    </div>
                                  )}
                                  {(() => {
                                    let unifiedNotes = [];
                                    if (r.agentNotes && Array.isArray(r.agentNotes) && r.agentNotes.length > 0) {
                                      // Modern responses
                                      unifiedNotes = r.agentNotes.filter(n => n && n.text);
                                    } else if (r.agentNote && r.agentNote.text) {
                                      // Legacy responses fallback
                                      unifiedNotes = [r.agentNote];
                                    }
                                    if (unifiedNotes.length === 0) return null;
                                    return unifiedNotes.map((note, idx) => (
                                      <div key={idx} className="answer-item" style={{ borderLeft: '3px solid #eab308', paddingLeft: '1rem', gridColumn: '1 / -1', background: 'rgba(234, 179, 8, 0.06)', padding: '1rem', borderRadius: '8px' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#a16207', marginBottom: '0.25rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                          📝 {t('agentNote') || 'Agent Note'} {unifiedNotes.length > 1 ? `#${idx + 1}` : ''} — {resolveNoteRef(r.surveyId, note.referenceQuestionId)}
                                        </div>
                                        <div style={{ fontWeight: 600, whiteSpace: 'pre-wrap' }}>{note.text}</div>
                                      </div>
                                    ));
                                  })()}
                                {r.answers && r.answers.length > 0 ? (
                                  r.answers.map((ans, idx) => (
                                    <div key={idx} className="answer-item" style={{ borderLeft: '3px solid var(--primary)', paddingLeft: '1rem' }}>
                                      <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                                        {getQuestionText(r.surveyId, ans.questionId)}
                                      </div>
                                      <div style={{ fontWeight: 600 }}>{formatCellValue(ans.value, ans.questionId)}</div>
                                    </div>
                                  ))
                                ) : (
                                  <div style={{ color: 'var(--text-secondary)', gridColumn: '1 / -1' }}>{t('notAnswered') || 'No answers recorded.'}</div>
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


      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteModalResponse && (
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
            onClick={() => !deleteLoading && setDeleteModalResponse(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="glass-card"
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: '480px',
                padding: '2rem',
                position: 'relative',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                border: '1px solid var(--danger)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.15rem' }}>
                  <Trash2 color="var(--danger)" size={20} /> {t('deleteResponse') || 'How do you want to handle this response?'}
                </h2>
                <button className="nav-action-btn" onClick={() => !deleteLoading && setDeleteModalResponse(null)}>
                  <CloseIcon size={18} />
                </button>
              </div>

              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                Serial: <strong>{deleteModalResponse.serialNumber || 'N/A'}</strong> · Agent: <strong>{deleteModalResponse.agentId?.name || 'Unknown'}</strong>
              </div>

              {/* Option A: Soft Delete */}
              <button
                className="btn-secondary"
                disabled={deleteLoading}
                onClick={() => handleDeleteResponse(deleteModalResponse._id, 'soft_delete')}
                style={{
                  width: '100%',
                  padding: '1rem',
                  marginBottom: '0.75rem',
                  textAlign: isRtl ? 'right' : 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                }}
              >
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                  🔒 {t('disqualifySoftDelete') || 'Disqualify (Soft Delete)'}
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 400 }}>
                  {t('disqualifyWarning') || 'Data stays in agent stats but is marked invalid/disqualified. Excluded from exports.'}
                </span>
              </button>

              {/* Option B: Hard Delete */}
              <button
                className="btn-secondary"
                disabled={deleteLoading}
                onClick={() => handleDeleteResponse(deleteModalResponse._id, 'hard_delete')}
                style={{
                  width: '100%',
                  padding: '1rem',
                  marginBottom: '1rem',
                  textAlign: isRtl ? 'right' : 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem',
                  border: '1px solid var(--danger)',
                  borderRadius: '8px',
                  background: 'rgba(var(--danger-rgb, 220, 53, 69), 0.05)',
                }}
              >
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--danger)' }}>
                  🗑️ {t('hardDelete') || 'Permanently Delete'}
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--danger)', fontWeight: 400 }}>
                  ⚠️ {t('hardDeleteWarning') || 'This permanently deletes the response data forever. This action cannot be undone.'}
                </span>
              </button>

              <button
                className="btn-secondary"
                onClick={() => setDeleteModalResponse(null)}
                disabled={deleteLoading}
                style={{ width: '100%', padding: '0.75rem' }}
              >
                {t('cancel') || 'Cancel'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
