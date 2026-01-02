/**
 * PM2 Ecosystem Configuration - PianoLink
 * 
 * Uso:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 reload ecosystem.config.js --env production
 */

module.exports = {
  apps: [{
    name: 'pianolink',
    script: 'server.js',
    instances: 'max',        // Usar todos los CPUs disponibles
    exec_mode: 'cluster',    // Modo cluster para alta disponibilidad
    
    // Variables de entorno por defecto
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    
    // Variables de entorno para producción
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    
    // Configuración de reinicio
    watch: false,                    // No reiniciar al cambiar archivos
    max_memory_restart: '500M',      // Reiniciar si usa >500MB RAM
    restart_delay: 1000,             // Esperar 1s entre reinicios
    max_restarts: 10,                // Máximo 10 reinicios antes de parar
    min_uptime: '10s',               // Mínimo 10s de uptime para ser "estable"
    
    // Graceful shutdown
    kill_timeout: 10000,             // 10s para cerrar limpiamente
    wait_ready: true,                // Esperar señal 'ready' de la app
    listen_timeout: 10000,           // Timeout para considerar que inició
    
    // Logs
    log_file: './logs/combined.log',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,                // Combinar logs de todos los clusters
    
    // Métricas y monitoreo
    instance_var: 'INSTANCE_ID',     // Variable para identificar instancia
    
    // Exponential backoff para reinicios
    exp_backoff_restart_delay: 100
  }]
};
