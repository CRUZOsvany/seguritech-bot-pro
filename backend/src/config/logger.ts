import pino from 'pino';
import { config } from './env';

/**
 * Crea y configura el logger de la aplicación
 * Usa Pino para logs de alto rendimiento
 *
 * En desarrollo:
 * - Pretty print legible
 * - Log level: debug
 *
 * En producción:
 * - JSON comprimido
 * - Log level: info
 * - Sin colores
 */
export function createLogger(): pino.Logger {
  const options: pino.LoggerOptions = {
    level: config.log.level,
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (config.isDevelopment) {
    return pino(
      {
        ...options,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
            singleLine: false,
          },
        },
      },
      pino.destination(1),
    );
  }

  return pino(options);
}

// Exportar instancia por defecto
const logger = createLogger();
export default logger;

