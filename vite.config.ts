import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { apiProxyPlugin } from './vite-api-proxy'

export default defineConfig({
  plugins: [react(), apiProxyPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
})
