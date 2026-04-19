import React, { useContext, useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon, Globe, LogOut, LayoutDashboard, User as UserIcon, Settings, X, ChevronDown, CheckCircle, PauseCircle, CircleOff, Monitor, AlertCircle, Loader } from 'lucide-react';

import AgentDashboard from './pages/AgentDashboard';
import TakeSurvey from './pages/TakeSurvey';
import AdminDashboard from './pages/AdminDashboard';
import SurveyBuilder from './pages/SurveyBuilder';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ProfileSettings from './pages/ProfileSettings';
import ProfileRequests from './pages/ProfileRequests';
import LiveMonitoring from './pages/LiveMonitoring';
import UserManagement from './pages/UserManagement';
import PrivateRoute from './components/PrivateRoute';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { UIProvider, UIContext } from './context/UIContext';

const StatusSelector = ({ user, updateStatus, t, timer }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

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
                onClick={() => {
                  updateStatus(s.id);
                  setIsOpen(false);
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
  const { user } = useContext(AuthContext);
  const { t } = useContext(UIContext);
  const location = useLocation();

  const isStaffRole = user?.role === 'agent' || user?.role === 'quality';
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
            
            <motion.div 
              style={{ marginTop: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-md)', background: 'hsla(var(--p-h), var(--p-s), var(--p-l), 0.1)', color: 'var(--primary)', fontWeight: 800 }}
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              <ChevronDown size={20} style={{ transform: 'rotate(-90deg)' }} />
              Use Status Bar in Navbar to Change Status
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
            <div style={{ 
              width: '32px', 
              height: '32px', 
              borderRadius: '10px', 
              background: 'linear-gradient(135deg, var(--primary), var(--accent))',
              boxShadow: '0 4px 12px hsla(var(--p-h), var(--p-s), var(--p-l), 0.3)'
            }}></div>
            {t('baseera')}
          </Link>
          
          {user && (
            <div className="nav-links">
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
                <span className="drawer-section-label">{t('accountSettings')}</span>
                <Link to="/profile" className="drawer-item" onClick={() => setDrawerOpen(false)}>
                  <UserIcon size={18} /> {t('myProfile')}
                </Link>

                {isStaff && (
                  <Link to="/admin/live" className="drawer-item" onClick={() => setDrawerOpen(false)}>
                    <Monitor size={18} /> {t('liveMonitor')}
                  </Link>
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
        <Route path="/forgot-password" element={<PageWrapper><ForgotPassword /></PageWrapper>} />
        <Route path="/profile" element={<PrivateRoute><PageWrapper><ProfileSettings /></PageWrapper></PrivateRoute>} />
        <Route path="/" element={<PrivateRoute><PageWrapper><AgentDashboard /></PageWrapper></PrivateRoute>} />
        <Route path="/take-survey/:id" element={<PrivateRoute><PageWrapper><TakeSurvey /></PageWrapper></PrivateRoute>} />
        
        {/* Support both Admin and Quality roles for common stats dashboard and Live Monitor */}
        <Route path="/admin" element={<PrivateRoute reqRole={['admin', 'quality']}><PageWrapper><AdminDashboard /></PageWrapper></PrivateRoute>} />
        <Route path="/admin/live" element={<PrivateRoute reqRole={['admin', 'quality']}><PageWrapper><LiveMonitoring /></PageWrapper></PrivateRoute>} />
        
        {/* Strictly Admin routes */}
        <Route path="/admin/requests" element={<PrivateRoute reqRole="admin"><PageWrapper><ProfileRequests /></PageWrapper></PrivateRoute>} />
        <Route path="/admin/builder/:id?" element={<PrivateRoute reqRole="admin"><PageWrapper><SurveyBuilder /></PageWrapper></PrivateRoute>} />
        <Route path="/admin/register" element={<PrivateRoute reqRole="admin"><PageWrapper><Register /></PageWrapper></PrivateRoute>} />
        <Route path="/admin/users" element={<PrivateRoute reqRole="admin"><PageWrapper><UserManagement /></PageWrapper></PrivateRoute>} />
      </Routes>
    </AnimatePresence>
  );
}

function App() {
  return (
    <BrowserRouter>
      <UIProvider>
        <AuthProvider>
          <div className="app-bg">
            <div className="mesh-blob blob-1"></div>
            <div className="mesh-blob blob-2"></div>
          </div>
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