import axios from 'axios';

function trimTrailingSlashes(s) {
  return String(s || '').replace(/\/+$/, '');
}

/** HTTP API base (no trailing slash). Override with `VITE_API_URL`. */
export const API_BASE =
  trimTrailingSlashes(import.meta.env.VITE_API_URL) || '/api';

/** WebSocket server URL (defaults to same host as API). Override with `VITE_SOCKET_URL`. */
export const SOCKET_BASE =
  trimTrailingSlashes(import.meta.env.VITE_SOCKET_URL) || '';

export const api = axios.create({
  baseURL: API_BASE,
});

api.interceptors.request.use((config) => {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function setApiAuthToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

