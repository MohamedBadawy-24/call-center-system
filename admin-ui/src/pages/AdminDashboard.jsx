import React, { useEffect, useState, useContext, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api, SOCKET_BASE } from '../api/client';
import { motion, AnimatePresence } from 'framer-motion';
import { io } from 'socket.io-client';
import { 
  Plus, Users, UserPlus, GitBranch, History, BarChart3, Trash2, Edit3, 
  Play, Pause, Eye, Download, Search, Target, TrendingUp, Clock, Activity, FileText, CheckCircle, MessageSquare, BookOpen, Paperclip, Copy
} from 'lucide-react';
import { UIContext } from '../context/UIContext';
import { AuthContext } from '../context/AuthContext';
import { useLanguage } from '../hooks/useLanguage';
import { toast } from 'react-toastify';
import LoadingSpinner from '../components/LoadingSpinner';
import CampaignAssetsModal from '../components/CampaignAssetsModal';
import KPICard from '../components/dashboard/KPICard';
import CampaignCard from '../components/dashboard/CampaignCard';

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
  const [assetsModal, setAssetsModal] = useState({ open: false, campaign: null });
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
                toast.error(err.response?.data?.error || "Failed to delete campaign");
              }
            }}>{t('confirmDeleteSurveyBtn') || 'Delete Survey'}</button>
            <button className="btn-secondary" onClick={closeToast}>{t('cancelDeleteSurvey') || 'Keep Survey'}</button>
          </div>
        </div>
      ),
      { autoClose: false, closeOnClick: false }
    );
  };

  const handleAssetsUpdated = (campaignId, updatedAssets) => {
    setSurveys(prev => prev.map(s => s._id === campaignId ? { ...s, assets: updatedAssets } : s));
    if (assetsModal.campaign && assetsModal.campaign._id === campaignId) {
      setAssetsModal(prev => ({
        ...prev,
        campaign: { ...prev.campaign, assets: updatedAssets }
      }));
    }
  };

  const handleCloneCampaign = async (id, title) => {
    const confirmMsg = t('cloneCampaignConfirm') || 'Clone this campaign? A new inactive copy will be created with clean assets.';
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await api.post(`/admin/campaigns/${id}/clone`);
      if (res.data?.campaign) {
        setSurveys(prev => [res.data.campaign, ...prev]);
        toast.success(t('cloneCampaignSuccess') || 'Campaign cloned successfully as draft');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || t('cloneCampaignError') || 'Failed to clone campaign');
    }
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
    visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.05 } }
  };

  const kpiContainerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.05 }
    }
  };

  const campaignContainerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.08, delayChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] }
    }
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" style={{ paddingBottom: '4rem' }}>
      {/* Header & Primary Action Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <motion.h1 variants={itemVariants} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: 0, fontSize: '1.75rem', fontWeight: 800 }}>
            <BarChart3 size={32} color="var(--primary)" />
            {isQuality ? t('qualityAgent') : t('adminDashboard')}
          </motion.h1>
        </div>

        {isAdmin && (
          <motion.div variants={itemVariants}>
            <Link
              to="/admin/builder"
              className="btn-primary transition-all duration-200 active:scale-95 hover:brightness-110"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '0.65rem 1.25rem',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '0.95rem',
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.25)'
              }}
            >
              <Plus size={18} />
              {t('createSurvey')}
            </Link>
          </motion.div>
        )}
      </div>

      {/* Secondary Action Bar: Team Management Actions + Relocated Daily Goal */}
      {isAdmin && (
        <motion.div
          variants={itemVariants}
          className="admin-header-actions"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
            marginBottom: '2rem',
            padding: '0.65rem 1rem',
            background: 'var(--card-bg)',
            borderRadius: '12px',
            border: '1px solid var(--glass-border)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <Link
              to="/admin/users"
              className="btn-secondary transition-all duration-200 active:scale-95 hover:brightness-110"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', padding: '0.45rem 0.85rem' }}
            >
              <Users size={15} />
              {t('teamMembers')}
            </Link>
            <Link
              to="/admin/register"
              className="btn-secondary transition-all duration-200 active:scale-95 hover:brightness-110"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', padding: '0.45rem 0.85rem' }}
            >
              <UserPlus size={15} />
              {t('addTeamMember')}
            </Link>
            <Link
              to="/admin/requests"
              className="btn-secondary transition-all duration-200 active:scale-95 hover:brightness-110"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', padding: '0.45rem 0.85rem' }}
            >
              <History size={15} />
              {t('changeRequests')}
            </Link>
          </div>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'var(--bg-secondary)',
              padding: '0.3rem 0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--glass-border)'
            }}
          >
            <Target size={15} color="var(--primary)" />
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Daily Goal:</span>
            <input
              type="number"
              value={dailyGoal}
              onChange={e => setDailyGoal(e.target.value)}
              onBlur={e => updateDailyGoal(e.target.value)}
              style={{
                width: '54px',
                padding: '0.2rem 0.35rem',
                border: '1px solid var(--glass-border)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                borderRadius: '4px',
                textAlign: 'center',
                fontWeight: 700,
                fontSize: '0.85rem'
              }}
            />
          </div>
        </motion.div>
      )}

      {/* Modern Underline Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '2rem',
          marginBottom: '2rem',
          borderBottom: '1px solid var(--glass-border)',
          overflowX: 'auto'
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          style={{
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'overview' ? '3px solid var(--primary)' : '3px solid transparent',
            padding: '0.75rem 0.25rem',
            fontWeight: activeTab === 'overview' ? 700 : 500,
            fontSize: '0.95rem',
            color: activeTab === 'overview' ? 'var(--primary)' : 'var(--text-secondary)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            whiteSpace: 'nowrap'
          }}
        >
          <BarChart3 size={17} />
          <span>Overview & Campaigns</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('workforce')}
          style={{
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'workforce' ? '3px solid var(--primary)' : '3px solid transparent',
            padding: '0.75rem 0.25rem',
            fontWeight: activeTab === 'workforce' ? 700 : 500,
            fontSize: '0.95rem',
            color: activeTab === 'workforce' ? 'var(--primary)' : 'var(--text-secondary)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            whiteSpace: 'nowrap'
          }}
        >
          <Users size={17} />
          <span>Workforce</span>
        </button>
      </div>

      {activeTab === 'overview' && (
        <>
          {/* Responsive KPI Grid with Staggered Entrance */}
          <motion.div
            className="kpi-grid"
            variants={kpiContainerVariants}
            initial="hidden"
            animate="visible"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '1.25rem',
              marginTop: '0.5rem',
              marginBottom: '2.5rem'
            }}
          >
            <KPICard
              label={t('workforceActive')}
              value={`${((activeAgentsCount / totalAgentsCount) * 100).toFixed(0)}%`}
              subtext={`${activeAgentsCount} ${t('activeStaffMsg')} ${totalAgentsCount}`}
              icon={Activity}
              iconColor="#10b981"
              iconBg="rgba(16, 185, 129, 0.12)"
              variants={itemVariants}
            />
            <KPICard
              label={t('globalSuccess')}
              value={`${successRate}%`}
              subtext={`${totalCompletedCount} ${t('completedSurveys')}`}
              icon={Target}
              iconColor="var(--primary)"
              iconBg="rgba(59, 130, 246, 0.12)"
              variants={itemVariants}
            />
            <KPICard
              label={t('avgHandleTime')}
              value={formatTime(ahtValue)}
              subtext={t('avgHandleTime')}
              icon={Clock}
              iconColor="#8b5cf6"
              iconBg="rgba(139, 92, 246, 0.12)"
              variants={itemVariants}
            />
            <KPICard
              label={t('liveCampaigns')}
              value={surveys.filter(s => s.isActive).length}
              subtext={t('harvestingData')}
              icon={TrendingUp}
              iconColor="#f59e0b"
              iconBg="rgba(245, 158, 11, 0.12)"
              variants={itemVariants}
            />
          </motion.div>

          {/* Section Header: Title on Left & Search Bar Aligned on Right */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem',
              marginBottom: '1.5rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>{t('campaigns')}</h2>
              <span
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--text-secondary)',
                  background: 'var(--bg-secondary)',
                  padding: '0.2rem 0.65rem',
                  borderRadius: '12px',
                  fontWeight: 700
                }}
              >
                {filteredSurveys.length}
              </span>
            </div>

            <div className="search-container" style={{ margin: 0, maxWidth: '320px', width: '100%' }}>
              <Search className="search-icon" size={18} />
              <input
                type="text"
                placeholder={t('searchPlaceholder')}
                className="search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <motion.div
            className="choice-grid"
            variants={campaignContainerVariants}
            initial="hidden"
            animate="visible"
          >
            <AnimatePresence>
              {filteredSurveys.map(s => (
                <CampaignCard
                  key={s._id}
                  survey={s}
                  isAdmin={isAdmin}
                  isRtl={isRtl}
                  t={t}
                  onToggleStatus={toggleSurveyStatus}
                  onDelete={deleteSurvey}
                  onClone={handleCloneCampaign}
                  onExport={handleExport}
                  onOpenAssets={(survey) => setAssetsModal({ open: true, campaign: survey })}
                  isExporting={isExporting === s._id}
                  variants={itemVariants}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        </>
      )}

      {activeTab === 'workforce' && (
        <>
          {/* Team Performance Header with Search Bar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem',
              marginTop: '2rem',
              marginBottom: '1.5rem'
            }}
          >
            <motion.h2 variants={itemVariants} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.4rem', fontWeight: 700 }}>
              <GitBranch size={24} color="var(--primary)" />
              {t('teamPerformance')}
            </motion.h2>

            <div className="search-container" style={{ margin: 0, maxWidth: '320px', width: '100%' }}>
              <Search className="search-icon" size={18} />
              <input
                type="text"
                placeholder={t('searchPlaceholder')}
                className="search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

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

      {/* Campaign Assets & Attachments Modal */}
      <CampaignAssetsModal
        isOpen={assetsModal.open}
        onClose={() => setAssetsModal({ open: false, campaign: null })}
        campaign={assetsModal.campaign}
        onAssetsUpdated={handleAssetsUpdated}
      />
    </motion.div>
  );
}
