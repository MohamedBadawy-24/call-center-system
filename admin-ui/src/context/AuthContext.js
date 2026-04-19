import React, { createContext, useState, useEffect, useCallback, useContext } from 'react';
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';

import { UIContext } from './UIContext';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useContext(UIContext);

  const clearClientSession = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    delete axios.defaults.headers.common['Authorization'];
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
    if (user?.role === 'agent' && user?.currentStatus && user.currentStatus !== 'off-duty') {
      const ok = window.confirm(t('confirmForceSignOut'));
      if (!ok) return;
    }

    clearClientSession();
    navigate('/login', { replace: true });
  }, [clearClientSession, navigate, t, user?.currentStatus, user?.role]);

  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      res => res,
      err => {
        if (err.response?.status === 401) {
          invalidateSession();
        }
        return Promise.reject(err);
      }
    );

    return () => axios.interceptors.response.eject(interceptor);
  }, [invalidateSession]);

  useEffect(() => {
    const bootstrap = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      try {
        const res = await axios.get('http://localhost:3000/auth/me');
        const nextUser = res.data.user;
        setUser(nextUser);
        localStorage.setItem('user', JSON.stringify(nextUser));
      } catch {
        invalidateSession();
      } finally {
        setLoading(false);
      }
    };

    bootstrap();
  }, [invalidateSession]);

  const login = async (email, password) => {
    const res = await axios.post('http://localhost:3000/auth/login', { email, password });
    localStorage.setItem('token', res.data.token);
    localStorage.setItem('user', JSON.stringify(res.data.user));
    axios.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
    setUser(res.data.user);
    if (res.data.user.role === 'admin') navigate('/admin');
    else navigate('/');
  };

  const updateStatus = async (status) => {
    try {
      const res = await axios.post('http://localhost:3000/auth/status', { status });
      const updatedUser = { ...user, currentStatus: res.data.status, statusStartedAt: res.data.statusStartedAt };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
    } catch (err) {
      console.error("Status update failed:", err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, logout, updateStatus }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
