import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const proxyTarget = env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:5000';
  const apiBase = env.VITE_BACKEND_URL?.trim() ? `${env.VITE_BACKEND_URL.trim().replace(/\/+$/, '')}/api` : (env.VITE_API_BASE_URL || '/api');

  // A local proxy works only for relative API paths, not for remote absolute URLs.
  const isRelativeApi = apiBase.startsWith('/');
  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: isRelativeApi ? {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      } : undefined,
    },
    preview: {
      port: 4173,
      strictPort: true,
    },
  };
});
