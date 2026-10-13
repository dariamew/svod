import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { settings } from './shared/config.mjs'
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { host: settings.host, port: settings.clientPort, strictPort: true, proxy: { '/api': `http://${settings.host}:${settings.port}` } },
  build: { rollupOptions: { output: { manualChunks: { charts: ['recharts'], primitives: ['radix-ui'] } } } },
})
