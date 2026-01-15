import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Browser-side base path is `VITE_API_BASE_URL` (default: `/api`).
  // Dev proxy needs a backend *origin*.
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:7071';

  return {
    plugins: [react()],
    build: {
      outDir: 'dist',
      sourcemap: true
    },
    server: {
      open: true,
      port: 3000,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true
        }
      }
    }
  };
});
