import React, { useContext, useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon, Globe, LogOut, LayoutDashboard, User as UserIcon, Settings, X, ChevronDown, CheckCircle, PauseCircle, CircleOff, Monitor, AlertCircle, Loader, Activity, BookOpen, MessageSquare, History } from 'lucide-react';

import AgentDashboard from './pages/AgentDashboard';
import PreCallChecklist from './pages/PreCallChecklist';
import TakeSurvey from './pages/TakeSurvey';
import AdminDashboard from './pages/AdminDashboard';
import SurveyBuilder from './pages/SurveyBuilder/index';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ProfileSettings from './pages/ProfileSettings';
import ProfileRequests from './pages/ProfileRequests';
import LiveMonitorAudit from './pages/LiveMonitorAudit';
import OtherAnswersCoding from './pages/OtherAnswersCoding';
import AuditPreCallChecklist from './pages/AuditPreCallChecklist';
import AuditTakeSurvey from './pages/AuditTakeSurvey';
import UserManagement from './pages/UserManagement';
import Analytics from './pages/Analytics';
import Feedbacks from './pages/Feedbacks';
import SopUpdates from './pages/SopUpdates';
import ResponseHistory from './pages/ResponseHistory';
import AgentResponseHistory from './pages/AgentResponseHistory';
import QualityAgentStats from './pages/QualityAgentStats';
import QualityDropOff from './pages/QualityDropOff';
import CampaignComparison from './pages/CampaignComparison';
import PrivateRoute from './components/PrivateRoute';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { UIProvider, UIContext } from './context/UIContext';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const StatusSelector = ({ user, updateStatus, t, timer }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const statuses = [
    { id: 'active', label: t('active'), icon: <CheckCircle size={16} />, color: '#10b981' },
    { id: 'preparing', label: t('preparing'), icon: <Loader size={16} />, color: '#a855f7' },
    { id: 'break', label: t('onBreak'), icon: <PauseCircle size={16} />, color: '#f59e0b' },
    { id: 'off-duty', label: t('offDuty'), icon: <CircleOff size={16} />, color: '#6b7280' }
  ];

  const currentStatusObj = statuses.find(s => s.id === user.currentStatus) || statuses[1]; // Default to preparing if missing

  return (
    <div className="status-selector-container" ref={menuRef}>
      <motion.div 
        className="status-pill premium"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setIsOpen(!isOpen)}
        style={{ borderColor: isOpen ? 'var(--primary)' : 'var(--glass-border)' }}
      >
        <div className={`status-dot ${user.currentStatus}`}></div>
        <div className="status-label-group">
          <span className="status-current-label" style={{ color: currentStatusObj.color }}>
            {currentStatusObj.label}
          </span>
          {user.currentStatus !== 'off-duty' && (
            <span className="status-timer mini">{timer}</span>
          )}
        </div>
        <ChevronDown size={14} className={`status-chevron ${isOpen ? 'open' : ''}`} />
      </motion.div>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="status-dropdown"
          >
            {statuses.map((s) => (
              <button
                key={s.id}
                className={`status-option ${user.currentStatus === s.id ? 'active' : ''}`}
                onClick={async () => {
                  try {
                    let reason = null;
                    if (s.id === 'break') {
                      reason = window.prompt(t('enterBreakReason') || "Please enter your break reason (Lunch or Meeting):", "Lunch");
                      if (!reason || !['Lunch', 'Meeting'].includes(reason)) {
                        toast.error(t('invalidBreakReason') || "Invalid or empty break reason. Must be 'Lunch' or 'Meeting'.");
                        return;
                      }
                    }
                    await updateStatus(s.id, reason);
                    setIsOpen(false);
                    if (user?.role === 'agent' && s.id === 'active') {
                      navigate('/agent/precall', { replace: true });
                    }
                  } catch (e) {
                    toast.error(e.response?.data?.error || 'Failed to update status');
                  }
                }}
              >
                <span className="status-option-icon" style={{ color: s.color }}>{s.icon}</span>
                <span className="status-option-label">{s.label}</span>
                {user.currentStatus === s.id && <div className="status-active-indicator" style={{ background: s.color }} />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Global Guard to block UI unless Active (for Agents/Quality)
const StatusGuard = ({ children }) => {
  const { user, updateStatus } = useContext(AuthContext);
  const { t } = useContext(UIContext);
  const location = useLocation();

  const isStaffRole = user?.role === 'agent';
  const isNotActive = user?.currentStatus !== 'active';
  const isAuthPage = location.pathname === '/login' || location.pathname === '/forgot-password';

  // Only guard non-auth pages for specifically restricted roles
  if (user && isStaffRole && isNotActive && !isAuthPage) {
    return (
      <div style={{ position: 'relative' }}>
        <AnimatePresence>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass-card"
            style={{ 
              position: 'fixed',
              top: '80px', // Below navbar
              left: '2rem',
              right: '2rem',
              bottom: '2rem',
              zIndex: 1000,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              backdropFilter: 'blur(16px)',
              background: 'hsla(var(--bg-h), var(--bg-s), var(--bg-l), 0.4)',
              border: '2px solid hsla(var(--p-h), var(--p-s), var(--p-l), 0.2)',
              borderRadius: 'var(--radius-lg)',
              textAlign: 'center',
              padding: '2rem'
            }}
          >
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 12 }}
            >
              <AlertCircle size={64} color="var(--primary)" style={{ marginBottom: '1.5rem', opacity: 0.8 }} />
            </motion.div>
            <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>{t('statusActionRequired')}</h2>
            <p style={{ maxWidth: '400px', color: 'var(--text-secondary)', fontSize: '1.1rem', fontWeight: 600, lineHeight: 1.6 }}>
              {t('mustBeActiveDashboard')}
            </p>
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => updateStatus('active')}
              className="btn-primary"
              style={{ marginTop: '2rem', padding: '0.75rem 2rem', fontSize: '1.1rem', borderRadius: 'var(--radius-md)' }}
            >
              {t('active')}
            </motion.button>

            <motion.div 
              style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 600 }}
            >
              <ChevronDown size={16} style={{ transform: 'rotate(-90deg)' }} />
              {t('useNavbarStatus') || 'Or use status bar in navbar'}
            </motion.div>
          </motion.div>
        </AnimatePresence>
        <div style={{ opacity: 0.2, pointerEvents: 'none', filter: 'blur(4px)' }}>
          {children}
        </div>
      </div>
    );
  }

  return children;
};

const NavBar = () => {
  const location = useLocation();
  const { user, logout, updateStatus } = useContext(AuthContext);
  const { theme, toggleTheme, language, setLanguage, t } = useContext(UIContext);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [timer, setTimer] = useState("00:00:00");
  const [unseenSopCount, setUnseenSopCount] = useState(0);
  const [unseenFeedbackCount, setUnseenFeedbackCount] = useState(0);
  const isAdminOrQualityPath = location.pathname.startsWith('/admin');
  const isAgentOrQuality = user?.role === 'agent' || user?.role === 'quality';
  const isStaff = user?.role === 'admin' || user?.role === 'quality';

  useEffect(() => {
    let interval;
    if (isAgentOrQuality && user?.statusStartedAt) {
      interval = setInterval(() => {
        const start = new Date(user.statusStartedAt).getTime();
        const now = new Date().getTime();
        const diff = Math.floor((now - start) / 1000);
        
        const h = Math.floor(diff / 3600).toString().padStart(2, '0');
        const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
        const s = (diff % 60).toString().padStart(2, '0');
        setTimer(`${h}:${m}:${s}`);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isAgentOrQuality, user?.statusStartedAt]);

  useEffect(() => {
    if (user) {
      import('./api/client').then(({ api }) => {
        if (user.role === 'agent') {
          api.get('/reviews/unseen-count').then(res => setUnseenFeedbackCount(res.data.count)).catch(console.error);
          api.get('/sops/unseen-count').then(res => setUnseenSopCount(res.data.count)).catch(console.error);
        } else if (isStaff) {
          api.get('/reviews/unseen-count').then(res => setUnseenFeedbackCount(res.data.count)).catch(console.error);
        }
      });
    }
  }, [user, isStaff, location.pathname]);

  if (!user && location.pathname === '/login') return null;

  return (
    <>
      <motion.nav 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="nav-bar"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <Link to="/" className="nav-brand">
            <img src="/icon.png" alt="Baseera Icon" className="block md:hidden h-8 w-8 dark-glow transition-transform duration-300 hover:scale-105" />
            <img src="/logo.png" alt="Baseera Logo" className="hidden md:block h-8 w-auto dark-glow transition-transform duration-300 hover:scale-105" />
          </Link>
          
          {user && (
            <div className="nav-links desktop-nav-links">
              <Link to="/" className={!isAdminOrQualityPath && location.pathname !== '/profile' ? "active" : ""}>
                <LayoutDashboard size={18} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                {t('agentPortal')}
              </Link>
              {isStaff && (
                <Link to="/admin" className={isAdminOrQualityPath ? "active" : ""}>
                  <Settings size={18} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                  {user.role === 'quality' ? "Performance" : t('adminDashboard')}
                </Link>
              )}
            </div>
          )}
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {isAgentOrQuality && user && (
            <StatusSelector user={user} updateStatus={updateStatus} t={t} timer={timer} />
          )}

          {user && !isStaff && (
            <Link to="/sops" style={{ position: 'relative', color: 'inherit' }} onClick={() => setUnseenSopCount(0)}>
              <Activity size={20} />
              {unseenSopCount > 0 && (
                <span style={{
                  position: 'absolute', top: '-5px', right: '-8px', background: 'var(--danger)', color: '#fff', 
                  fontSize: '0.6rem', fontWeight: 'bold', width: '16px', height: '16px', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%'
                }}>
                  {unseenSopCount > 9 ? '9+' : unseenSopCount}
                </span>
              )}
            </Link>
          )}

          {user && (
            <Link to="/admin/feedbacks" style={{ position: 'relative', color: 'inherit' }} onClick={() => setUnseenFeedbackCount(0)}>
              <MessageSquare size={20} />
              {unseenFeedbackCount > 0 && (
                <span style={{
                  position: 'absolute', top: '-5px', right: '-8px', background: 'var(--danger)', color: '#fff', 
                  fontSize: '0.6rem', fontWeight: 'bold', width: '16px', height: '16px', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%'
                }}>
                  {unseenFeedbackCount > 9 ? '9+' : unseenFeedbackCount}
                </span>
              )}
            </Link>
          )}

          {user && (
            <motion.div 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="avatar" 
              onClick={() => setDrawerOpen(true)}
            >
              {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </motion.div>
          )}
        </div>
      </motion.nav>

      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="drawer-overlay"
              onClick={() => setDrawerOpen(false)}
            />
            <motion.div 
              initial={{ x: language === 'ar' ? '-100%' : '100%' }}
              animate={{ x: 0 }}
              exit={{ x: language === 'ar' ? '-100%' : '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="side-drawer"
            >
              <div className="drawer-header">
                <button 
                  className="nav-action-btn" 
                  onClick={() => setDrawerOpen(false)}
                  style={{ position: 'absolute', top: '1.5rem', right: '1.5rem' }}
                >
                  <X size={20} />
                </button>
                <div className="drawer-user-info">
                  <h3>{user.name}</h3>
                  <span>{user.role.toUpperCase()} {t('role')}</span>
                </div>
              </div>

              <div className="drawer-content">
                <div className="mobile-nav-links" style={{ display: 'none', flexDirection: 'column', gap: '0.25rem', marginBottom: '1.25rem' }}>
                  <span className="drawer-section-label">{t('navigation') || 'Navigation'}</span>
                  <Link to="/" className="drawer-item" onClick={() => setDrawerOpen(false)}>
                    <LayoutDashboard size={18} /> {t('agentPortal')}
                  </Link>
                  {isStaff && (
                    <Link to="/admin" className="drawer-item" onClick={() => setDrawerOpen(false)}>
                      <Settings size={18} /> {user.role === 'quality' ? "Performance" : t('adminDashboard')}
                    </Link>
                  )}
                </div>

                <span className="drawer-section-label">{t('accountSettings')}</span>
                <Link to="/profile" className="drawer-item" onClick={() => setDrawerOpen(false)}>
                  <UserIcon size={18} /> {t('myProfile')}
                </Link>
                <Link to="/agent/history" className="drawer-item" onClick={() => setDrawerOpen(false)}>
                  <History size={18} /> {t('mySubmissions') || 'My Submissions'}
                </Link>
                <Link to="/sops" className="drawer-item" onClick={() => { setDrawerOpen(false); setUnseenSopCount(0); }}>
                  <BookOpen size={18} /> {t('sopUpdates') || 'SOP Updates'}
                </Link>

                <Link to="/admin/feedbacks" className="drawer-item" onClick={() => { setDrawerOpen(false); setUnseenFeedbackCount(0); }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <MessageSquare size={18} /> {t('feedbacks') || 'Feedbacks'}
                  </div>
                  {unseenFeedbackCount > 0 && (
                    <span style={{ background: 'var(--danger)', color: '#fff', fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '10px' }}>
                      {unseenFeedbackCount}
                    </span>
                  )}
                </Link>

                {isStaff && (
                  <>
                    <Link to="/quality/monitor" className="drawer-item" onClick={() => setDrawerOpen(false)}>
                      <Monitor size={18} /> {t('liveMonitorAudit') || 'Live Monitor & Audit'}
                    </Link>
                    <Link to="/admin/analytics" className="drawer-item" onClick={() => setDrawerOpen(false)}>
                      <Activity size={18} /> {t('historicalAnalytics') || 'Analytics'}
                    </Link>
                    <Link to="/admin/responses" className="drawer-item" onClick={() => setDrawerOpen(false)}>
                      <History size={18} /> {t('responseHistory') || 'Response History'}
                    </Link>
                  </>
                )}

                {isStaff && (
                  <div style={{ marginTop: '1.5rem' }}>
                    <span className="drawer-section-label">{t('qualityTools') || 'Quality Tools'}</span>
                    <Link to="/quality/agent-stats" className="drawer-item" onClick={() => setDrawerOpen(false)}>
                      <Activity size={18} /> {t('agentStats') || 'Agent Stats'}
                    </Link>
                    <Link to="/quality/drop-off" className="drawer-item" onClick={() => setDrawerOpen(false)}>
                      <History size={18} /> {t('dropOffReport') || 'Drop-Off Report'}
                    </Link>
                    <Link to="/quality/other-coding" className="drawer-item" onClick={() => setDrawerOpen(false)}>
                      <BookOpen size={18} /> {t('otherAnswersCoding') || 'Other Answers Coding'}
                    </Link>
                  </div>
                )}

                <div style={{ marginTop: '2.5rem' }}>
                  <span className="drawer-section-label">{t('theme')} & {t('language')}</span>
                  
                  <div className="drawer-toggle-group">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: 700 }}>
                      <Globe size={18} color="var(--primary)" /> {t('language')}
                    </div>
                    <button 
                      className="btn-secondary" 
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                      onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
                    >
                      {language === 'en' ? 'Arabic' : 'English'}
                    </button>
                  </div>

                  <div className="drawer-toggle-group">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: 700 }}>
                      {theme === 'light' ? <Moon size={18} color="var(--primary)" /> : <Sun size={18} color="var(--primary)" />} 
                      {t('theme')}
                    </div>
                    <button 
                      className="btn-secondary" 
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                      onClick={toggleTheme}
                    >
                      {theme === 'light' ? t('dark') : t('light')}
                    </button>
                  </div>
                </div>
              </div>

              <div className="drawer-footer">
                <button 
                  onClick={() => { setDrawerOpen(false); logout(); }} 
                  className="drawer-item danger"
                >
                  <LogOut size={18} /> {t('signOut')}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

const PageWrapper = ({ children }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -20 }}
    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
  >
    {children}
  </motion.div>
);

const AnimatedRoutes = () => {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/login" element={<PageWrapper><Login /></PageWrapper>} />
        <Route path="/register" element={<PageWrapper><Register /></PageWrapper>} />
        <Route path="/forgot-password" element={<PageWrapper><ForgotPassword /></PageWrapper>} />
        <Route path="/profile" element={<PrivateRoute><PageWrapper><ProfileSettings /></PageWrapper></PrivateRoute>} />
        <Route path="/" element={<PrivateRoute><PageWrapper><AgentDashboard /></PageWrapper></PrivateRoute>} />
        <Route path="/agent/history" element={<PrivateRoute><PageWrapper><AgentResponseHistory /></PageWrapper></PrivateRoute>} />
        <Route path="/agent/precall" element={<PrivateRoute><PageWrapper><PreCallChecklist /></PageWrapper></PrivateRoute>} />
        <Route path="/take-survey/:id" element={<PrivateRoute><PageWrapper><TakeSurvey /></PageWrapper></PrivateRoute>} />
        <Route path="/sops" element={<PrivateRoute><PageWrapper><SopUpdates /></PageWrapper></PrivateRoute>} />
        
        {/* Support both Admin and Quality roles for common stats dashboard and Live Monitor */}
        <Route path="/admin" element={<PrivateRoute reqRole={['admin', 'quality']}><PageWrapper><AdminDashboard /></PageWrapper></PrivateRoute>} />
        <Route path="/admin/live" element={<Navigate to="/quality/monitor" replace />} />
        <Route path="/admin/analytics" element={<PrivateRoute reqRole={['admin', 'quality']}><PageWrapper><Analytics /></PageWrapper></PrivateRoute>} />
        <Route path="/admin/feedbacks" element={<PrivateRoute reqRole={['admin', 'quality', 'agent']}><PageWrapper><Feedbacks /></PageWrapper></PrivateRoute>} />
        <Route path="/admin/responses" element={<PrivateRoute reqRole={['admin', 'quality']}><PageWrapper><ResponseHistory /></PageWrapper></PrivateRoute>} />

        <Route path="/quality/monitor" element={<PrivateRoute reqRole={['admin', 'quality']}><PageWrapper><LiveMonitorAudit /></PageWrapper></PrivateRoute>} />
        <Route path="/quality/other-coding" element={<PrivateRoute reqRole={['admin', 'quality']}><PageWrapper><OtherAnswersCoding /></PageWrapper></PrivateRoute>} />
        <Route path="/quality/agent-stats" element={<PrivateRoute reqRole={['admin', 'quality']}><PageWrapper><QualityAgentStats /></PageWrapper></PrivateRoute>} />
        <Route path="/quality/drop-off" element={<PrivateRoute reqRole={['admin', 'quality']}><PageWrapper><QualityDropOff /></PageWrapper></PrivateRoute>} />
        <Route path="/quality/shadow-review" element={<Navigate to="/quality/monitor" replace />} />
        <Route path="/quality/audit-precall/:agentId" element={<PrivateRoute reqRole={['admin', 'quality']}><PageWrapper><AuditPreCallChecklist /></PageWrapper></PrivateRoute>} />
        <Route path="/quality/audit-survey/:surveyId/:agentId/:serialNumber" element={<PrivateRoute reqRole={['admin', 'quality']}><PageWrapper><AuditTakeSurvey /></PageWrapper></PrivateRoute>} />
        
        {/* Strictly Admin routes */}
        <Route path="/admin/requests" element={<PrivateRoute reqRole="admin"><PageWrapper><ProfileRequests /></PageWrapper></PrivateRoute>} />
        <Route path="/admin/builder/:id?" element={<PrivateRoute reqRole={['admin', 'quality']}><PageWrapper><SurveyBuilder /></PageWrapper></PrivateRoute>} />
        <Route path="/admin/compare" element={<PrivateRoute reqRole={['admin', 'quality']}><PageWrapper><CampaignComparison /></PageWrapper></PrivateRoute>} />
        <Route path="/admin/register" element={<PrivateRoute reqRole="admin"><PageWrapper><Register /></PageWrapper></PrivateRoute>} />
        <Route path="/admin/users" element={<PrivateRoute reqRole="admin"><PageWrapper><UserManagement /></PageWrapper></PrivateRoute>} />
      </Routes>
    </AnimatePresence>
  );
}

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <UIProvider>
        <AuthProvider>
          <div className="app-bg">
            <div className="mesh-blob blob-1"></div>
            <div className="mesh-blob blob-2"></div>
          </div>
          <ToastContainer position="top-right" autoClose={3000} theme="colored" hideProgressBar={false} closeOnClick pauseOnHover />
          <NavBar />
          <main className="container">
            <StatusGuard>
              <AnimatedRoutes />
            </StatusGuard>
          </main>
        </AuthProvider>
      </UIProvider>
    </BrowserRouter>
  );
}

export default App;