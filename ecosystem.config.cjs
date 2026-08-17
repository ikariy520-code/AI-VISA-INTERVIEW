const path = require('node:path')

const projectRoot = __dirname

module.exports = {
  apps: [
    {
      name: 'visa-interview',
      script: 'server/index.mjs',
      cwd: projectRoot,
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
      error_file: path.join(projectRoot, 'logs', 'error.log'),
      out_file: path.join(projectRoot, 'logs', 'out.log'),
      merge_logs: true,
      autorestart: true,
      watch: false,
    },
  ],
}
