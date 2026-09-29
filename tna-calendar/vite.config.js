import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // `vite build --mode php` → relative asset paths so the app works from any folder (e.g. /tna/)
  base: mode === 'php' ? './' : '/',
  build: { outDir: mode === 'php' ? 'dist-php' : 'dist' },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' },
  },
}));
