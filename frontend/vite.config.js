import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Read VITE_API_BASE_URL for the proxy target, but keep browser requests
  // same-origin during development so CORS cannot block catalog/API calls.
  const env = loadEnv(mode, process.cwd(), '')
  const backendTarget = (env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '')

  return {
    plugins: [react()],
    test: { setupFiles: ['./src/testSetup.js'] },
    server: {
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
