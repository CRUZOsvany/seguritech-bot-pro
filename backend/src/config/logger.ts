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
    // PII/secretos: se auditan a 2026-08-20. `from`/`phoneNumber`/`to` son el
    // número de WhatsApp del cliente final (múltiples sitios en BotController
    // y MetaWhatsAppAdapter lo pasan como clave top-level del objeto de log,
    // así que un path sin prefijo ya cubre TODOS esos call sites). El resto
    // son defensa en profundidad contra loguear secretos por accidente — no
    // se detectó ninguno en claro hoy, pero un `logger.info(err)` futuro con
    // un objeto que traiga uno de estos campos queda cubierto igual.
    redact: {
      paths: [
        'phoneNumber',
        'from',
        'to',
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-api-key"]',
        '*.accessToken',
        '*.access_token',
        '*.password',
        '*.password_hash',
        '*.pinHash',
        '*.pin_hash',
        '*.token',
      ],
      censor: '[REDACTED]',
    },
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

