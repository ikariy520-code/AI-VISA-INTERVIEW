// ========================================
// PM2 ecosystem config for AI Visa Interview
// ========================================

module.exports = {
  apps: [
    {
      name: 'visa-interview',
      script: 'server/index.mjs',
      cwd: '/home/ubuntu/visa-interview',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      max_memory_restart: '512M',
      kill_timeout: 10_000,
      listen_timeout: 5_000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/home/ubuntu/visa-interview/logs/error.log',
      out_file: '/home/ubuntu/visa-interview/logs/out.log',
      merge_logs: true,
      autorestart: true,
      watch: false,
    },
  ],
}
