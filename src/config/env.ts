import dotenv from 'dotenv';

dotenv.config();

/**
 * Configuración centralizada de la aplicación
 * Todos los valores de ambiente se cargan aquí y se validan
 *
 * Beneficios:
 * - Single source of truth para configuración
 * - Validación de variables requeridas
 * - Tipado seguro
 * - Fácil de testear
 */
export const config = {
  // Entorno
  environment: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',

  // Logger
  log: {
    level: process.env.LOG_LEVEL || 'info',
  },

  // WhatsApp
  whatsapp: {
    phoneNumber: process.env.WHATSAPP_PHONE_NUMBER || '',
    sessionName: process.env.WHATSAPP_SESSION_NAME || 'seguritech-session',
    qrTimeout: parseInt(process.env.WHATSAPP_QR_TIMEOUT || '30000', 10),
    webhookPort: process.env.WEBHOOK_PORT || '3000',
    webhookToken: process.env.WEBHOOK_TOKEN || 'tu_token_secreto',
  },

  // Bot
  bot: {
    name: process.env.BOT_NAME || 'SegurITech Bot',
    prefix: process.env.BOT_PREFIX || '',
    autoReplyEnabled: process.env.BOT_AUTO_REPLY_ENABLED === 'true',
  },

  // Database
  database: {
    url: process.env.DATABASE_URL || '',
  },

  // API
  api: {
    key: process.env.API_KEY || '',
    url: process.env.API_URL || '',
  },

  // PM2
  pm2: {
    instanceName: process.env.PM2_INSTANCE_NAME || 'seguritech-bot-pro',
  },
};

/**
 * Validar configuración crítica
 * Se ejecuta al iniciar la aplicación
 */
export function validateConfig(): void {
  const required = ['WHATSAPP_PHONE_NUMBER'];

  if (config.isProduction) {
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(
        `Configuración incompleta. Variables faltantes: ${missing.join(', ')}`,
      );
    }
  }
}
