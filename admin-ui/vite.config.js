import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const BACKEND = 'http://localhost:3000';

export default defineConfig({
  plugins: [
    react()
  ],
  server: {
    port: 5000,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/auth':      { target: BACKEND, changeOrigin: true },
      '/admin':     { target: BACKEND, changeOrigin: true },
      '/agent':     { target: BACKEND, changeOrigin: true },
      '/survey':    { target: BACKEND, changeOrigin: true },
      '/surveys':   { target: BACKEND, changeOrigin: true },
      '/response':  { target: BACKEND, changeOrigin: true },
      '/responses': { target: BACKEND, changeOrigin: true },
      '/reviews':   { target: BACKEND, changeOrigin: true },
      '/sops':      { target: BACKEND, changeOrigin: true },
      '/settings':  { target: BACKEND, changeOrigin: true },
      '/stats':     { target: BACKEND, changeOrigin: true },
      '/quality':   { target: BACKEND, changeOrigin: true },
      '/users':     { target: BACKEND, changeOrigin: true },
      '/socket.io': { target: BACKEND, changeOrigin: true, ws: true },
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.js'],
    globals: true,
    pool: 'forks',
    fileParallelism: false,
  }
});
