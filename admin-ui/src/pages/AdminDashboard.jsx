import React, { useEffect, useState, useContext, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api, SOCKET_BASE } from '../api/client';
import { motion, AnimatePresence } from 'framer-motion';
import { io } from 'socket.io-client';
import { 
  Plus, Users, UserPlus, GitBranch, History, BarChart3, Trash2, Edit3, 
  Play, Pause, Eye, Download, Search, Target, TrendingUp, Clock, Activity, FileText, CheckCircle, MessageSquare, BookOpen
} from 'lucide-react';
import { UIContext } from '../context/UIContext';
import { AuthContext } from '../context/AuthContext';
import { useLanguage } from '../hooks/useLanguage';
import { toast } from 'react-toastify';
import LoadingSpinner from '../components/LoadingSpinner';

export default function AdminDashboard() {
  const { t, language } = useLanguage();
  const isRtl = language === 'ar';
  const { user } = useContext(AuthContext);
  const [surveys, setSurveys] = useState([]);
  const [agentStats, setAgentStats] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState('overview');
  const [dailyGoal, setDailyGoal] = useState(50);
  const [suspendModal, setSuspendModal] = useState({ open: false, agentId: null, reason: "" });
  const socketRef = useRef(null);

  const isAdmin = user?.role === 'admin';
  const isQuality = user?.role === 'quality';
  const isStaff = isAdmin || isQuality;

  const fetchData = async () => {
    try {
      const [surveysRes, agentsRes, goalRes] = await Promise.all([
        api.get('/admin/surveys-stats'),
        api.get('/stats/agents'),
        api.get('/settings/dailyGoal')
      ]);
      setSurveys(surveysRes.data);
      setAgentStats(agentsRes.data);
      setDailyGoal(goalRes.data.dailyGoal || 50);
    } catch (err) {
      console.error("Data fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Setup Real-time Sync
    const token = localStorage.getItem('token');
    socketRef.current = io(SOCKET_BASE, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      timeout: 20000
    });
    socketRef.current.on('connect_error', (err) => {
      console.error('Socket connect_error (admin dashboard):', err?.message || err);
    });
    socketRef.current.on('stats-update', () => {
      fetchData(); // Refresh data on any system-wide change
    });

    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(interval);
      socketRef.current?.disconnect();
    };
  }, []);

  const handleExport = async (surveyId, title) => {
    setIsExporting(surveyId);
    try {
      const response = await api.get(`/admin/export-survey/${surveyId}`, {
        responseType: 'blob',
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `export_${title.replace(/\s+/g, '_')}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      toast.error("Failed to export data");
    } finally {
      setIsExporting(null);
    }
  };

  const formatTime = (secs) => {
    if (!secs) return "0s";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    let parts = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0 || h > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
  };

  const formatStatusTimer = (startAt) => {
    if (!startAt) return "00:00:00";
    const diff = Math.floor((now - new Date(startAt).getTime()) / 1000);
    if (diff < 0) return "00:00:00";
    const h = Math.floor(diff / 3600).toString().padStart(2, '0');
    const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
    const s = (diff % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'active': return '#10b981';
      case 'preparing': return '#a855f7';
      case 'break': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  const toggleSurveyStatus = async (surveyId) => {
    if (!isAdmin) return;
    try {
      await api.put(`/surveys/${surveyId}/toggle`, {});
      // Update locally immediately for punchy UI
      setSurveys(surveys.map(s => s._id === surveyId ? { ...s, isActive: !s.isActive } : s));
    } catch (err) {
      toast.error("Failed to toggle status");
    }
  };

  const deleteSurvey = async (surveyId, isActive) => {
    if (!isAdmin) return;
    if (isActive !== false) return toast.warning("End campaign to delete");
    
    toast(
      ({ closeToast }) => (
        <div>
          <p>{t('confirmDeleteSurvey')}</p>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button className="btn-secondary danger" onClick={async () => {
              closeToast();
              try {
                await api.delete(`/survey/${surveyId}`);
                setSurveys(surveys.filter(s => s._id !== surveyId));
                toast.success("Survey deleted");
              } catch (err) {
                toast.error(err.response?.data?.error || "Failed to delete survey");
              }
            }}>{t('confirmDeleteSurveyBtn') || 'Delete Survey'}</button>
            <button className="btn-secondary" onClick={closeToast}>{t('cancelDeleteSurvey') || 'Keep Survey'}</button>
          </div>
        </div>
      ),
      { autoClose: false, closeOnClick: false }
    );
  };

  const handleSuspend = async () => {
    if (!suspendModal.reason) return toast.error("Reason is required");
    try {
      await api.post(`/quality/suspend-agent/${suspendModal.agentId}`, { reason: suspendModal.reason });
      toast.success("Agent suspended");
      setSuspendModal({ open: false, agentId: null, reason: "" });
      fetchData();
    } catch (err) {
      toast.error("Failed to suspend agent");
    }
  };

  const handleUnsuspend = async (agentId) => {
    try {
      await api.post(`/quality/unsuspend-agent/${agentId}`);
      toast.success("Agent unsuspended");
      fetchData();
    } catch (err) {
      toast.error("Failed to unsuspend agent");
    }
  };

  const updateDailyGoal = async (val) => {
    try {
      await api.put('/admin/settings/dailyGoal', { dailyGoal: Number(val) });
      toast.success("Daily goal updated");
    } catch (err) {
      toast.error("Failed to save daily goal");
    }
  };

  // KPI Calculations
  const activeAgentsCount = agentStats.filter(a => a.currentStatus === 'active').length;
  const totalAgentsCount = agentStats.length || 1;
  const totalHandledCount = surveys.reduce((acc, s) => acc + (s.totalHandled || 0), 0);
  const totalCompletedCount = surveys.reduce((acc, s) => acc + (s.completed || 0), 0);
  const successRate = totalHandledCount > 0 ? ((totalCompletedCount / totalHandledCount) * 100).toFixed(1) : 0;
  
  const totalDuration = agentStats.reduce((acc, a) => acc + (a.totalDurationSecs || 0), 0);
  const globalCompletions = agentStats.reduce((acc, a) => acc + (a.completed || 0), 0);
  const ahtValue = globalCompletions > 0 ? Math.floor(totalDuration / globalCompletions) : 0;

  // Filtering & Sorting
  const filteredSurveys = surveys.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredAgents = agentStats
    .filter(a => a.agentName.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      const statusOrder = { active: 0, preparing: 1, break: 2, 'off-duty': 3 };
      return statusOrder[a.currentStatus] - statusOrder[b.currentStatus];
    });

  const agentsList = filteredAgents.filter(a => a.role === 'agent');
  const qualityList = filteredAgents.filter(a => a.role === 'quality');

  if (loading) return <LoadingSpinner fullPage />;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 }
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" style={{ paddingBottom: '4rem' }}>
      {/* Header & Global Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '3rem', flexWrap: 'wrap', gap: '1.5rem' }}>
        <div>
          <motion.h1 variants={itemVariants} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <BarChart3 size={32} color="var(--primary)" />
            {isQuality ? t('qualityAgent') : t('adminDashboard')}
          </motion.h1>
        </div>
        
        {isAdmin && (
          <motion.div variants={itemVariants} className="admin-header-actions flex flex-col md:flex-row items-stretch md:items-center gap-2 md:gap-3 w-full md:w-auto" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: 'var(--bg-secondary)', padding: '0.25rem 0.75rem', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Daily Goal:</span>
              <input 
                type="number" 
                value={dailyGoal}
                onChange={e => setDailyGoal(e.target.value)}
                onBlur={e => updateDailyGoal(e.target.value)}
                style={{ width: '60px', padding: '0.25rem', border: 'none', background: 'var(--bg-primary)', color: 'var(--text-primary)', borderRadius: '4px', textAlign: 'center' }}
              />
            </div>
            <Link to="/admin/requests" className="btn-secondary w-full md:w-auto" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><History size={16} />{t('changeRequests')}</Link>
            <Link to="/admin/users" className="btn-secondary w-full md:w-auto" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Users size={16} />{t('teamMembers')}</Link>
            <Link to="/admin/register" className="btn-secondary w-full md:w-auto" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><UserPlus size={16} />{t('addTeamMember')}</Link>
            <Link to="/admin/builder" className="btn-primary w-full md:w-auto" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={18} />{t('createSurvey')}</Link>
          </motion.div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem', overflowX: 'auto' }}>
        <button className="btn-secondary" onClick={() => setActiveTab('overview')} style={{ background: activeTab === 'overview' ? 'var(--primary)' : 'transparent', color: activeTab === 'overview' ? '#fff' : 'inherit', borderColor: activeTab === 'overview' ? 'transparent' : 'var(--glass-border)' }}>Overview & Campaigns</button>
        <button className="btn-secondary" onClick={() => setActiveTab('workforce')} style={{ background: activeTab === 'workforce' ? 'var(--primary)' : 'transparent', color: activeTab === 'workforce' ? '#fff' : 'inherit', borderColor: activeTab === 'workforce' ? 'transparent' : 'var(--glass-border)' }}>Workforce</button>
      </div>

      {activeTab === 'overview' && (
      <>
      <div className="kpi-grid">
        <motion.div variants={itemVariants} className="kpi-card">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="kpi-label">{t('workforceActive')}</span>
            <Activity size={16} color="var(--success)" />
          </div>
          <span className="kpi-value">{((activeAgentsCount / totalAgentsCount) * 100).toFixed(0)}%</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{activeAgentsCount} {t('activeStaffMsg')} {totalAgentsCount} </span>
        </motion.div>
        <motion.div variants={itemVariants} className="kpi-card">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="kpi-label">{t('globalSuccess')}</span>
            <Target size={16} color="var(--primary)" />
          </div>
          <span className="kpi-value">{successRate}%</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{totalCompletedCount} {t('completedSurveys')}</span>
        </motion.div>
        <motion.div variants={itemVariants} className="kpi-card">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="kpi-label">{t('avgHandleTime')}</span>
            <Clock size={16} color="var(--accent)" />
          </div>
          <span className="kpi-value">{formatTime(ahtValue)}</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t('avgHandleTime')}</span>
        </motion.div>
        <motion.div variants={itemVariants} className="kpi-card">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="kpi-label">{t('liveCampaigns')}</span>
            <TrendingUp size={16} color="var(--warning)" />
          </div>
          <span className="kpi-value">{surveys.filter(s => s.isActive).length}</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t('harvestingData')}</span>
        </motion.div>
      </div>
      
      {/* Search Bar */}
      <div className="search-container" style={{ marginTop: '2rem' }}>
        <Search className="search-icon" size={20} />
        <input 
          type="text" 
          placeholder={t('searchPlaceholder')} 
          className="search-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      
      {/* Survey Management */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <h2 style={{ marginBottom: 0 }}>{t('campaigns')}</h2>
      </div>

      <div className="choice-grid">
        <AnimatePresence>
          {filteredSurveys.map(s => {
            const progress = s.totalHandled > 0 ? (s.completed / s.totalHandled) * 100 : 0;
            return (
              <motion.div 
                layout
                key={s._id} 
                variants={itemVariants}
                initial="hidden" animate="visible" exit="hidden"
                className="glass-card" 
                style={{ marginBottom: 0, position: 'relative' }}
              >
                {isAdmin && (
                  <button 
                    onClick={() => deleteSurvey(s._id, s.isActive)}
                    style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: 'var(--danger)', cursor: s.isActive === false ? 'pointer' : 'not-allowed', opacity: s.isActive === false ? 0.6 : 0.2 }}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <div className={`status-dot ${s.isActive ? 'active' : 'off-duty'}`}></div>
                  <h3 style={{ marginBottom: 0 }}>{s.title}</h3>
                </div>
                
                <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem", fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{t('fulfillmentProgress')}</span>
                  {s.goal > 0 && <span style={{ color: 'var(--primary)' }}>{s.completed || 0} / {s.goal}</span>}
                </p>
                <div className="fulfillment-container">
                  <div className="fulfillment-bar" style={{ width: `${s.goal > 0 ? Math.min((s.completed / s.goal) * 100, 100) : progress}%` }}></div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', margin: '1rem 0' }}>
                  <div>
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{t('totalHandled')}</span>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{s.totalHandled || 0}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--success)' }}>{t('completed')}</span>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{s.completed || 0}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
                  {isAdmin ? (
                    <Link to={`/admin/builder/${s._id}`} className="btn-secondary" style={{ flex: 1, padding: '0.5rem' }}><Edit3 size={14} />{t('edit')}</Link>
                  ) : (
                    <Link to={`/admin/builder/${s._id}`} className="btn-secondary" style={{ flex: 1, padding: '0.5rem', opacity: 0.8 }}><Eye size={14} /> {t('audit')}</Link>
                  )}
                  
                  <button onClick={() => handleExport(s._id, s.title)} className="btn-secondary" style={{ flex: 1, padding: '0.5rem' }}>
                    {isExporting === s._id ? <div className="spinner" style={{ width: '12px', height: '12px' }} /> : <><Download size={14} /> {t('exportData')}</>}
                  </button>

                  {isAdmin && (
                    <button 
                      onClick={() => toggleSurveyStatus(s._id)} 
                      className="btn-primary" 
                      style={{ padding: '0.5rem 0.75rem', background: s.isActive ? 'var(--danger)' : undefined }}
                    >
                      {s.isActive ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      </>
      )}

      {activeTab === 'workforce' && (
      <>
      {/* Team Performance */}
      <motion.h2 variants={itemVariants} style={{ marginTop: '4rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <GitBranch size={24} color="var(--primary)" />
        {t('teamPerformance')}
      </motion.h2>

      <motion.div variants={itemVariants} className="glass-card table-responsive w-full overflow-x-auto" style={{ padding: '1rem', width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', minWidth: '650px', borderCollapse: 'separate', borderSpacing: '0 0.5rem' }}>
          <thead>
            <tr>
              <th>{t('agentName')}</th>
              <th>{t('status')}</th>
              <th>{t('totalHandled')}</th>
              <th style={{ color: 'var(--success)' }}>{t('completed')}</th>
              <th style={{ color: 'var(--danger)' }}>{t('disqualified')}</th>
              <th>{t('aht')}</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence>
              {agentsList.map(a => {
                const agentAHT = a.completed > 0 ? Math.floor(a.totalDurationSecs / a.completed) : 0;
                return (
                  <motion.tr layout key={a._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ opacity: a.suspended ? 0.5 : 1 }}>
                    <td style={{ fontWeight: 800 }}>
                      {a.agentName}
                      {a.suspended && <span style={{ marginLeft: '0.5rem', color: 'var(--danger)' }}>🔴 Suspended</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <div className={`status-dot ${a.currentStatus}`} style={{ background: getStatusColor(a.currentStatus) }}></div>
                        <span style={{ fontWeight: 800, fontSize: '0.75rem', color: getStatusColor(a.currentStatus), textTransform: 'uppercase' }}>
                          {t(a.currentStatus === 'preparing' ? 'preparing' : a.currentStatus === 'break' ? 'onBreak' : a.currentStatus === 'off-duty' ? 'offDuty' : 'active')}
                        </span>
                        {a.currentStatus !== 'off-duty' && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'monospace', opacity: 0.7 }}>
                            ({formatStatusTimer(a.statusStartedAt)})
                          </span>
                        )}
                      </div>
                    </td>
                    <td>{a.totalSurveys}</td>
                    <td style={{ fontWeight: 700 }}>{a.completed}</td>
                    <td style={{ fontWeight: 700 }}>{a.disqualified}</td>
                    <td style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{formatTime(agentAHT)}</td>
                    <td>
                      {isStaff && !a.suspended && a.role === 'agent' && (
                        <button className="btn-secondary danger" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }} onClick={() => setSuspendModal({ open: true, agentId: a._id, reason: "" })}>Suspend</button>
                      )}
                      {isStaff && a.suspended && a.role === 'agent' && (
                        <button className="btn-primary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }} onClick={() => handleUnsuspend(a._id)}>Unsuspend</button>
                      )}
                    </td>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>
      </motion.div>

      {/* Quality Performance */}
      <motion.h2 variants={itemVariants} style={{ marginTop: '4rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <CheckCircle size={24} color="var(--primary)" />
        {t('qualityTeam') || 'Quality Team'}
      </motion.h2>

      <motion.div variants={itemVariants} className="glass-card" style={{ padding: '1rem', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 0.5rem' }}>
          <thead>
            <tr>
              <th>{t('agentName')}</th>
              <th>{t('status')}</th>
              <th>{t('totalReview') || 'Total Review'}</th>
              <th>{t('actions') || 'Actions'}</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence>
              {qualityList.map(a => {
                return (
                  <motion.tr layout key={a._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <td style={{ fontWeight: 800 }}>{a.agentName}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <div className={`status-dot ${a.currentStatus}`} style={{ background: getStatusColor(a.currentStatus) }}></div>
                        <span style={{ fontWeight: 800, fontSize: '0.75rem', color: getStatusColor(a.currentStatus), textTransform: 'uppercase' }}>
                          {t(a.currentStatus === 'preparing' ? 'preparing' : a.currentStatus === 'break' ? 'onBreak' : a.currentStatus === 'off-duty' ? 'offDuty' : 'active')}
                        </span>
                        {a.currentStatus !== 'off-duty' && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'monospace', opacity: 0.7 }}>
                            ({formatStatusTimer(a.statusStartedAt)})
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ fontWeight: 700 }}>{a.totalReviews || 0}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <Link to="/admin/feedbacks" className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>
                          <MessageSquare size={14} /> {t('feedbacks') || 'Feedbacks'}
                        </Link>
                        <Link to="/sops" className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>
                          <BookOpen size={14} /> {t('sopUpdates') || 'SOP Updates'}
                        </Link>
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>
      </motion.div>
      </>
      )}

      {/* Suspend Modal */}
      <AnimatePresence>
        {suspendModal.open && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="drawer-overlay" onClick={() => setSuspendModal({ open: false, agentId: null, reason: "" })} />
            <motion.div initial={{ scale: 0.9, opacity: 0, x: '-50%', y: '-50%' }} animate={{ scale: 1, opacity: 1, x: '-50%', y: '-50%' }} exit={{ scale: 0.9, opacity: 0, x: '-50%', y: '-50%' }} className="glass-card modal-content" style={{ position: 'fixed', top: '50%', left: '50%', zIndex: 1000, width: '95%', maxWidth: '400px', maxHeight: '90vh', overflowY: 'auto' }}>
              <h3>{t('suspendAgent') || 'Suspend Agent'}</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>{t('suspendReasonPrompt') || 'Please provide a reason for suspension.'}</p>
              <textarea 
                value={suspendModal.reason} 
                onChange={e => setSuspendModal(prev => ({ ...prev, reason: e.target.value }))} 
                className="glass-input" 
                rows="3" 
                style={{ width: '100%', marginBottom: '1rem', padding: '0.75rem' }} 
                placeholder={t('suspendReasonPlaceholder') || 'Reason...'} 
              />
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button className="btn-secondary" onClick={() => setSuspendModal({ open: false, agentId: null, reason: "" })}>{t('cancelSuspend') || 'Cancel Suspension'}</button>
                <button className="btn-primary" onClick={handleSuspend} style={{ background: 'var(--danger)' }}>{t('suspendBtn') || 'Suspend'}</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
