import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { devHttps } from './dev-https.mjs'

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    https: await devHttps(),
    proxy: {
      '/api': 'http://localhost:5090',
      '/uploads': 'http://localhost:5090',
    },
  },
}))
