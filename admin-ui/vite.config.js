import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react()
  ],
  server: {
    port: 5000,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/auth': 'http://localhost:3000',
      '/admin': 'http://localhost:3000',
      '/agent': 'http://localhost:3000',
      '/survey': 'http://localhost:3000',
      '/surveys': 'http://localhost:3000',
      '/response': 'http://localhost:3000',
      '/responses': 'http://localhost:3000',
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
