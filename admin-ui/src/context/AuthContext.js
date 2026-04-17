import React, { createContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const logout = useCallback(() => {
    if (user?.role === 'agent' && user?.currentStatus !== 'off-duty') {
      alert("You cannot sign out unless Off-Duty. Please change your status first.");
      return;
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
    navigate('/login');
  }, [navigate, user]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');

    if (token && storedUser) {
      setUser(JSON.parse(storedUser));
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
    setLoading(false);

    // Setup interceptor for generic 401s
    const interceptor = axios.interceptors.response.use(
      res => res,
      err => {
        if (err.response?.status === 401) {
          logout();
        }
        return Promise.reject(err);
      }
    );
    return () => axios.interceptors.response.eject(interceptor);
  }, [logout]);

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
