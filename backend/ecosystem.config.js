/** @type {import('pm2').StartOptions} */
module.exports = {
  apps: [
    {
      name: 'seguritech-bot',
      script: 'dist/index.js',
      node_args: '-r tsconfig-paths/register',

      // Reinicio automático si la memoria supera 512 MB
      max_memory_restart: '512M',

      // Reiniciar ante caídas inesperadas, pero no si el proceso salió limpio (exit 0)
      autorestart: true,
      watch: false,

      // Variables de entorno base; los secretos vienen del .env en el VPS
      env: {
        NODE_ENV: 'production',
      },

      // Log rotation — PM2 logrotate debe estar instalado: pm2 install pm2-logrotate
      error_file: 'logs/err.log',
      out_file: 'logs/out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
