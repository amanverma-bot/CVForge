import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

const hosts = ['.trycloudflare.com', 'localhost', '127.0.0.1']

// Dev proxy: the SPA calls relative /api/* paths. In dev, Vite forwards them to the
// Express server (default :5001) — same-origin from the browser's perspective, so
// there is no CORS preflight and no VITE_API_URL juggling. In production the same
// relative paths are served by Express itself (single-origin deploy).
const API_TARGET = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:5001'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    allowedHosts: hosts,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  preview: {
    port: 5173,
    host: '0.0.0.0',
    allowedHosts: hosts,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'http://localhost:5173/' } }, // real origin → localStorage available
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    css: false,
  },
})
