import { defineConfig, transformWithOxc } from 'vite';
import react from '@vitejs/plugin-react';

const jsxInJs = () => ({
  name: 'jsx-in-js',
  enforce: 'pre',
  async transform(code, id) {
    if (!/src[\/\\].*\.js$/.test(id)) return null;
    return await transformWithOxc(code, id, { lang: 'jsx' });
  }
});

export default defineConfig({
  plugins: [
    jsxInJs(),
    react()
  ],
  server: {
    port: 3001
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.js'],
    globals: true
  }
});

