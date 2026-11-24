import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, '')
  // Same-origin /api in dev and preview, so the browser never makes a cross-origin call.
  const proxy = { '/api': env.API_PROXY_TARGET || 'http://127.0.0.1:8000' }

  return {
    plugins: [react()],
    server: { proxy },
    preview: { proxy },
    build: { chunkSizeWarningLimit: 1200 },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      restoreMocks: true,
      unstubGlobals: true,
    },
  }
})
