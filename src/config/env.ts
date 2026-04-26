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
    webhookPort: process.env.WEBHOOK_PORT || '3001',
    webhookToken: process.env.WEBHOOK_TOKEN || 'tu_token_secreto',
  },

  // Meta Cloud API (WhatsApp oficial)
  meta: {
    verifyToken: process.env.META_VERIFY_TOKEN || 'tu_token_secreto',
    phoneNumberId: process.env.META_PHONE_NUMBER_ID || '',
    accessToken: process.env.META_ACCESS_TOKEN || '',
    apiUrl: process.env.META_API_URL || 'https://graph.instagram.com/v19.0',
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
  const requiredDev = ['WHATSAPP_PHONE_NUMBER'];
  const requiredMeta = ['META_PHONE_NUMBER_ID', 'META_ACCESS_TOKEN', 'META_VERIFY_TOKEN'];

  if (config.isProduction) {
    const missingDev = requiredDev.filter((key) => !process.env[key]);
    const missingMeta = requiredMeta.filter((key) => !process.env[key]);

    const allMissing = [...missingDev, ...missingMeta];
    if (allMissing.length > 0) {
      throw new Error(
        `Configuración incompleta. Variables faltantes: ${allMissing.join(', ')}`,
      );
    }
  }
}
