import React, { useEffect, useState, useContext, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api/client';
import { motion, AnimatePresence } from 'framer-motion';
import { History, Search, Edit3, Lock, Unlock, ArrowLeft, Clock, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import { UIContext } from '../context/UIContext';
import { AuthContext } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import { toast } from 'react-toastify';

export default function AgentResponseHistory() {
  const langHook = useLanguage();
  const uiCtx = useContext(UIContext);
  const t = uiCtx?.t || langHook?.t;
  const language = uiCtx?.language || langHook?.language || 'en';
  const isRtl = language === 'ar';
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    fetchMyResponses();
  }, []);

  const fetchMyResponses = async () => {
    try {
      setLoading(true);
      const res = await api.get('/agent/my-responses');
      setResponses(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('[AGENT RESPONSES LOAD ERROR]', err);
      toast.error(t('failedToLoadResponses') || 'Failed to load your response history');
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (r, e) => {
    if (e) e.stopPropagation();
    if (!r.isEditUnlocked) {
      toast.warning(t('askAdminToUnlock') || 'Contact an admin to unlock this submission for editing.');
      return;
    }
    const surveyId = r.surveyId?._id || r.surveyId || '';
    navigate(`/agent/precall?surveyId=${surveyId}&serial=${r.serialNumber}&mode=edit`);
  };

  // Derive unique campaigns directly from the fetched history data
  const uniqueCampaigns = useMemo(() => {
    const campaigns = responses.map(item => item.surveyId?.title || item.campaignName || item.surveyTitle);
    return [...new Set(campaigns)].filter(Boolean);
  }, [responses]);

  const filteredResponses = useMemo(() => {
    return responses.filter(r => {
      const campaignTitle = r.surveyId?.title || r.campaignName || r.surveyTitle || '';
      const serial = String(r.serialNumber || '');
      const query = searchTerm.toLowerCase();

      const matchesSearch = serial.toLowerCase().includes(query) || campaignTitle.toLowerCase().includes(query);
      if (!matchesSearch) return false;

      const matchesCampaign = selectedCampaign === '' || campaignTitle === selectedCampaign;
      if (!matchesCampaign) return false;

      if (statusFilter === 'unlocked') return r.isEditUnlocked === true;
      if (statusFilter === 'completed') return r.status === 'completed';
      if (statusFilter === 'disqualified') return r.status === 'disqualified';
      if (statusFilter === 'postponed') return r.status === 'postponed';
      if (statusFilter === 'partial') return r.status === 'partial';

      return true;
    });
  }, [responses, searchTerm, statusFilter, selectedCampaign]);

  const getStatusLabel = (r) => {
    const st = String(r.interviewOutcome || r.status || '').toLowerCase();
    if (st === 'completed') return t('completed');
    if (st === 'partial') return t('partial');
    if (st === 'postponed') return t('postponed');
    if (st === 'disqualified' || st === 'refused' || st === 'no_qualified' || st === 'not_contacted') {
      return t(st) || st.toUpperCase();
    }
    return t(st) || r.interviewOutcome || r.status;
  };

  if (loading) return <LoadingSpinner fullPage />;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link to="/" className="btn-secondary" style={{ padding: '0.5rem', display: 'inline-flex', alignItems: 'center' }} title={t('backToDashboard')}>
            <ArrowLeft size={18} className={isRtl ? 'rotate-180' : ''} />
          </Link>
          <div>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: 0 }}>
              <History size={30} color="var(--primary)" />
              {t('mySubmissions')}
            </h1>
            <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>
              {t('mySubmissionsDesc')}
            </p>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full md:w-auto" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
            <Search size={18} style={{ position: 'absolute', left: isRtl ? 'auto' : '12px', right: isRtl ? '12px' : 'auto', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input
              type="text"
              placeholder={t('searchSerialOrSurvey')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field w-full"
              style={{ paddingLeft: isRtl ? '1rem' : '2.5rem', paddingRight: isRtl ? '2.5rem' : '1rem' }}
            />
          </div>

          {/* Campaign Filter */}
          <select
            value={selectedCampaign}
            onChange={(e) => setSelectedCampaign(e.target.value)}
            className="input-field"
            style={{ minWidth: '160px' }}
          >
            <option value="">{t('allCampaigns')}</option>
            {uniqueCampaigns.map(campaignName => (
              <option key={campaignName} value={campaignName}>
                {campaignName}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input-field"
            style={{ minWidth: '150px' }}
          >
            <option value="all">{t('allStatus')}</option>
            <option value="unlocked">🔓 {t('unlockedForEdit')}</option>
            <option value="completed">{t('completed')}</option>
            <option value="partial">{t('partial')}</option>
            <option value="postponed">{t('postponed')}</option>
            <option value="disqualified">{t('disqualified')}</option>
          </select>
        </div>
      </div>

      {/* Responses Table / List */}
      {filteredResponses.length === 0 ? (
        <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <FileText size={48} style={{ margin: '0 auto 1rem auto', opacity: 0.5 }} />
          <h3>{t('noResponsesFound')}</h3>
          <p style={{ fontSize: '0.9rem' }}>
            {searchTerm || statusFilter !== 'all' || selectedCampaign
              ? t('tryAdjustingFilters')
              : t('startSurveyToSeeHistory')}
          </p>
        </div>
      ) : (
        <div className="glass-card table-responsive w-full overflow-x-auto" style={{ padding: '0', overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)', textAlign: isRtl ? 'right' : 'left' }}>
                <th style={{ padding: '1rem 1.25rem', fontWeight: 800 }}>{t('serial')}</th>
                <th style={{ padding: '1rem 1.25rem', fontWeight: 800 }}>{t('survey')}</th>
                <th style={{ padding: '1rem 1.25rem', fontWeight: 800 }}>{t('date')}</th>
                <th style={{ padding: '1rem 1.25rem', fontWeight: 800 }}>{t('status')}</th>
                <th style={{ padding: '1rem 1.25rem', fontWeight: 800 }}>{t('editAccess')}</th>
                <th style={{ padding: '1rem 1.25rem', fontWeight: 800, textAlign: 'center' }}>{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredResponses.map((r) => (
                <React.Fragment key={r._id}>
                  <tr
                    className="hover-row"
                    style={{
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      background: r.isEditUnlocked ? 'rgba(245, 158, 11, 0.04)' : undefined
                    }}
                    onClick={() => setExpandedId(expandedId === r._id ? null : r._id)}
                  >
                    <td style={{ padding: '1.25rem' }}>
                      <div style={{ fontWeight: 900, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        #{r.serialNumber || 'N/A'}
                      </div>
                    </td>
                    <td style={{ padding: '1.25rem' }}>
                      <div style={{ fontWeight: 800 }}>{r.surveyId?.title || 'Unknown Campaign'}</div>
                    </td>
                    <td style={{ padding: '1.25rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Clock size={13} />
                        {new Date(r.completedAt || r.startedAt).toLocaleString(isRtl ? 'ar-EG' : 'en-US')}
                      </div>
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
                        {getStatusLabel(r)}
                      </span>
                    </td>
                    <td style={{ padding: '1.25rem' }}>
                      {r.isEditUnlocked ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.25rem 0.75rem',
                          borderRadius: '20px',
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          background: 'rgba(245, 158, 11, 0.15)',
                          color: 'var(--warning)',
                          border: '1px solid rgba(245, 158, 11, 0.3)'
                        }}>
                          <Unlock size={12} /> {t('unlockedForEdit')}
                        </span>
                      ) : (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.25rem 0.75rem',
                          borderRadius: '20px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background: 'rgba(255, 255, 255, 0.05)',
                          color: 'var(--text-secondary)'
                        }}>
                          <Lock size={12} /> {t('locked')}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '1.25rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
                        {r.isEditUnlocked ? (
                          <button
                            className="btn-primary"
                            style={{
                              padding: '0.4rem 0.9rem',
                              fontSize: '0.8rem',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              background: 'var(--warning)',
                              color: '#000',
                              fontWeight: 700
                            }}
                            onClick={(e) => handleEditClick(r, e)}
                            title={t('reEditSurvey')}
                          >
                            <Edit3 size={14} /> {t('edit')}
                          </button>
                        ) : (
                          <button
                            className="btn-secondary"
                            style={{
                              padding: '0.4rem 0.8rem',
                              fontSize: '0.75rem',
                              opacity: 0.7
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              toast.info(t('askAdminToUnlock'));
                            }}
                            title={t('locked')}
                          >
                            <Lock size={13} style={{ marginInlineEnd: '0.3rem' }} /> {t('locked')}
                          </button>
                        )}
                        <button
                          className="btn-secondary"
                          style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedId(expandedId === r._id ? null : r._id);
                          }}
                          title={expandedId === r._id ? (t('collapse') || 'Collapse') : (t('expand') || 'Expand')}
                        >
                          {expandedId === r._id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded answers preview */}
                  <AnimatePresence>
                    {expandedId === r._id && (
                      <tr>
                        <td colSpan="6" style={{ padding: 0, background: 'rgba(255,255,255,0.02)' }}>
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            style={{ overflow: 'hidden' }}
                          >
                            <div style={{ padding: '1.5rem 2rem' }}>
                              <h4 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem' }}>
                                <FileText size={16} color="var(--primary)" /> {t('submittedAnswers')}
                              </h4>
                              {Array.isArray(r.answers) && r.answers.length > 0 ? (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                                  {r.answers.map((a, idx) => (
                                    <div
                                      key={idx}
                                      style={{
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid var(--border)',
                                        padding: '0.75rem 1rem',
                                        borderRadius: '8px'
                                      }}
                                    >
                                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>
                                        {a.questionId}
                                      </div>
                                      <div style={{ fontWeight: 600, marginTop: '0.25rem' }}>
                                        {Array.isArray(a.value) ? a.value.join(', ') : String(a.value ?? '')}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                  {t('noAnswersRecorded')}
                                </p>
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
    </motion.div>
  );
}
