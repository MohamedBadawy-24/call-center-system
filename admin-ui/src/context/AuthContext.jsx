import React, { createContext, useState, useEffect, useCallback, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import { api, setApiAuthToken, SOCKET_BASE } from '../api/client';
import { io } from 'socket.io-client';
import { UIContext } from './UIContext';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useContext(UIContext);
  const socketRef = React.useRef(null);

  const clearClientSession = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setApiAuthToken(null);
    setUser(null);
  }, []);

  const invalidateSession = useCallback(() => {
    clearClientSession();
    const p = location.pathname;
    if (p !== '/login' && p !== '/forgot-password') {
      navigate('/login', { replace: true });
    }
  }, [clearClientSession, location.pathname, navigate]);

  const logout = useCallback(() => {
    if ((user?.role === 'agent' || user?.role === 'quality') && user?.currentStatus && user.currentStatus !== 'off-duty') {
      const ok = window.confirm(t('confirmForceSignOut'));
      if (!ok) return;
    }

    clearClientSession();
    navigate('/login', { replace: true });
  }, [clearClientSession, navigate, t, user?.currentStatus, user?.role]);

  useEffect(() => {
    const interceptor = api.interceptors.response.use(
      (res) => res,
      (err) => {
        if (err.response?.status === 401) {
          invalidateSession();
        }
        return Promise.reject(err);
      }
    );

    return () => api.interceptors.response.eject(interceptor);
  }, [invalidateSession]);

  useEffect(() => {
    const bootstrap = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      setApiAuthToken(token);

      try {
        const res = await api.get('/auth/me');
        const nextUser = res.data.user;
        setUser(nextUser);
        localStorage.setItem('user', JSON.stringify(nextUser));

        // Connect socket for status sync
        if (!socketRef.current) {
          const token = localStorage.getItem('token');
          socketRef.current = io(SOCKET_BASE, {
            auth: { token },
          });
          socketRef.current.emit('join-monitoring', { id: nextUser.id, role: nextUser.role });
          
          socketRef.current.on('status-pushed', (data) => {
            setUser(prev => {
              if (!prev) return null;
              if (prev.currentStatus === data.status && prev.statusStartedAt === data.statusStartedAt) {
                return prev;
              }
              const updated = { ...prev, currentStatus: data.status, statusStartedAt: data.statusStartedAt };
              localStorage.setItem('user', JSON.stringify(updated));
              return updated;
            });
          });
        }
      } catch {
        invalidateSession();
      } finally {
        setLoading(false);
      }
    };

    bootstrap();
    
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [invalidateSession]);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', res.data.token);
    setApiAuthToken(res.data.token);
    const me = await api.get('/auth/me');
    const fullUser = me.data.user;
    localStorage.setItem('user', JSON.stringify(fullUser));
    setUser(fullUser);
    if (fullUser.role === 'admin' || fullUser.role === 'quality') navigate('/admin');
    else navigate('/');
  };

  const updateStatus = async (status, breakReason = null) => {
    const res = await api.post('/auth/status', { status, breakReason });
    const updatedUser = {
      ...user,
      currentStatus: res.data.status,
      currentBreakReason: status === 'break' ? breakReason : null,
      statusStartedAt: res.data.statusStartedAt,
      ...(res.data.precallCompletedForActiveSession !== undefined
        ? { precallCompletedForActiveSession: res.data.precallCompletedForActiveSession }
        : {}),
    };
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
    return res;
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, logout, updateStatus }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
