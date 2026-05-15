import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const API_PORT = process.env.VITE_API_PORT ?? '3000';
const CLIENT_PORT = parseInt(process.env.VITE_PORT ?? '8000', 10);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@forbidden-island/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  server: {
    port: CLIENT_PORT,
    strictPort: true,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: `http://localhost:${API_PORT}`,
        changeOrigin: true,
      },
      '/game-ws': {
        target: `http://localhost:${API_PORT}`,
        ws: true,
        rewrite: (path: string) => path.replace(/^\/game-ws/, '/ws'),
      },
    },
  },
});
