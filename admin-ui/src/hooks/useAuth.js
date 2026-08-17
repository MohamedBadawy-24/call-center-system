import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api, setApiAuthToken, SOCKET_BASE } from '../api/client';
import { io } from 'socket.io-client';

/**
 * useAuth — Encapsulates all authentication business logic:
 * session bootstrap, login, logout, status updates, 401 interceptor, and socket status sync.
 *
 * @param {Function} t - Translation function from UIContext
 * @returns {{ user, setUser, loading, login, logout, updateStatus }}
 */
export function useAuth(t) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const socketRef = useRef(null);

  const clearClientSession = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.clear();
    
    // Nuclear Wipe: explicitly destroy any lingering dirty state drafts
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('precallDraft')) {
        localStorage.removeItem(key);
      }
    }
    
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

  const logout = useCallback(async () => {
    if ((user?.role === 'agent' || user?.role === 'quality') && user?.currentStatus && user.currentStatus !== 'off-duty') {
      const ok = window.confirm(t('confirmForceSignOut'));
      if (!ok) return;
    }

    try {
      await api.post('/auth/logout');
    } catch (e) {
      console.warn("Logout API call failed, proceeding with local wipe");
    }

    clearClientSession();
    navigate('/login', { replace: true });
  }, [clearClientSession, navigate, t, user?.currentStatus, user?.role]);

  // 401 interceptor
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

  // Bootstrap session from localStorage token
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

  return { user, setUser, loading, login, logout, updateStatus };
}
