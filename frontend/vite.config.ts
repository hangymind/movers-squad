import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { execFileSync } from 'node:child_process'

function buildVersion() {
  const date = process.env.BUILD_DATE ?? new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()).replaceAll('-', '')
  const hash = process.env.BUILD_HASH ?? execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8' }).trim()
  if (!/^\d{8}$/.test(date) || !/^[0-9a-f]{7}$/i.test(hash)) {
    throw new Error('BUILD_DATE must be YYYYMMDD and BUILD_HASH must be a 7-character Git hash.')
  }
  return `Build:Ver${date}-${hash.toLowerCase()}`
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: { __BUILD_VERSION__: JSON.stringify(buildVersion()) },
  build: {
    sourcemap: false,
    minify: 'oxc',
    cssMinify: true,
  },
  server: {
    port: 9191,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
      '/sanctum': { target: 'http://localhost:8000', changeOrigin: true },
      '/broadcasting': { target: 'http://localhost:8000', changeOrigin: true },
      '/app': { target: 'ws://localhost:8081', ws: true, changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
