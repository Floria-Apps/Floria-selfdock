import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.FLORIA_DEV_API_TARGET ?? 'http://127.0.0.1:3000',
        ws: true,
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/@m3e/web/dist/theme.js')) return 'm3e-theme';
          if (id.includes('/node_modules/@material/material-color-utilities/')) return 'm3e-theme';
          if (id.includes('/node_modules/@m3e/web/dist/core.js')) return 'm3e-core';
          if (id.includes('/node_modules/@m3e/')) return 'm3e';
        },
      },
    },
  },
});
