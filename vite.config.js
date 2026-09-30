import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/excessgolf/' : '/',
  server: {
    proxy: {
      '/api': 'http://localhost:4242',
    },
  },
}));
