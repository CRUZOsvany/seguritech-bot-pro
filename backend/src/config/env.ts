import dotenv from 'dotenv';
import { z } from 'zod';
import logger from './logger';

dotenv.config();

/**
 * Schema de validación para variables de entorno con Zod
 */
const envSchema = z.object({
  // Entorno
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.string().default('info'),

  // Webhook
  WEBHOOK_PORT: z.string().default('3001'),

  // Meta Cloud API (WhatsApp oficial)
  META_API_URL: z.string().url().default('https://graph.facebook.com/v21.0'),
  META_PHONE_NUMBER_ID: z.string().optional(),
  META_ACCESS_TOKEN: z.string().optional(),
  META_VERIFY_TOKEN: z.string().min(32).optional(),
  META_APP_SECRET: z.string().min(32).optional(),

  // Bot
  BOT_NAME: z.string().default('SegurITech Bot'),

  // Database
  DATABASE_URL: z.string().default('./database.sqlite'),

  // Supabase
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // CORS
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
});

type EnvType = z.infer<typeof envSchema>;

/**
 * Parsear y validar variables de entorno
 */
function parseEnv(): EnvType {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const errorMessages = Object.entries(errors)
      .map(([key, msgs]) => `${key}: ${msgs?.join(', ')}`)
      .join('\n');

    if (process.env.NODE_ENV === 'production') {
      // No podemos usar logger aquí porque causaría dependencia cíclica
      console.error(`❌ Configuración incompleta:\n${errorMessages}`);
      throw new Error(`Configuración incompleta: ${Object.keys(errors).join(', ')}`);
    } else {
      // En desarrollo, permitir pero advertir
      console.warn(`⚠️ Variables de entorno no validadas:\n${errorMessages}`);
      console.warn('⚠️ Continuando en modo desarrollo con valores por defecto');
    }
  }

  // Devolver datos parseados O valores por defecto del schema
  return result.data ?? envSchema.parse({});
}

const envVars = parseEnv();

/**
 * Configuración centralizada de la aplicación
 */
export const config = {
  // Entorno
  environment: envVars.NODE_ENV,
  isDevelopment: envVars.NODE_ENV === 'development',
  isProduction: envVars.NODE_ENV === 'production',

  // Logger
  log: {
    level: envVars.LOG_LEVEL,
  },

  // Webhook
  webhook: {
    port: envVars.WEBHOOK_PORT,
  },

  // Meta Cloud API (WhatsApp oficial)
  meta: {
    apiUrl: envVars.META_API_URL,
    phoneNumberId: envVars.META_PHONE_NUMBER_ID || '',
    accessToken: envVars.META_ACCESS_TOKEN || '',
    verifyToken: envVars.META_VERIFY_TOKEN || '',
    appSecret: envVars.META_APP_SECRET || '',
  },

  // Bot
  bot: {
    name: envVars.BOT_NAME,
  },

  // Database
  database: {
    url: envVars.DATABASE_URL,
  },

  // Supabase
  supabase: {
    url: envVars.SUPABASE_URL || '',
    serviceRoleKey: envVars.SUPABASE_SERVICE_ROLE_KEY || '',
  },

  // CORS
  cors: {
    allowedOrigins: envVars.ALLOWED_ORIGINS,
  },
};

/**
 * Validar configuración crítica
 * Se ejecuta al iniciar la aplicación
 */
export function validateConfig(): void {
  const criticalVars = ['META_PHONE_NUMBER_ID', 'META_ACCESS_TOKEN', 'META_VERIFY_TOKEN', 'META_APP_SECRET'];

  if (config.isProduction) {
    const missing = criticalVars.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(
        `❌ Configuración incompleta en PRODUCCIÓN. Variables faltantes: ${missing.join(', ')}`
      );
    }
    logger.info('✅ Configuración de producción validada correctamente');
  }
}


