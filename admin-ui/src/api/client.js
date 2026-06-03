import axios from 'axios';

function trimTrailingSlashes(s) {
  return String(s || '').replace(/\/+$/, '');
}

/** HTTP API base (no trailing slash). Override with `VITE_API_URL`.
 *  Defaults to '' (relative) so Vite's dev-server proxy routes requests to
 *  the backend without hitting localhost directly from the browser. */
export const API_BASE =
  trimTrailingSlashes(import.meta.env.VITE_API_URL) || '';

/** WebSocket server URL (defaults to same host as API). Override with `VITE_SOCKET_URL`. */
export const SOCKET_BASE =
  trimTrailingSlashes(import.meta.env.VITE_SOCKET_URL) || API_BASE;

export const api = axios.create({
  baseURL: API_BASE,
});

export function setApiAuthToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}
