import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'

export default defineConfig(({ command, mode }) => ({
  // 普通 `npm run dev` 只启动前端，避免本机 Worker 运行时差异影响界面开发。
  // 生产构建和 `dev:cloudflare` 使用完整 Worker 环境。
  plugins: [react(), ...(command === 'build' || mode === 'cloudflare' ? [cloudflare()] : [])],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
}))
