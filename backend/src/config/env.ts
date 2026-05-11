import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

/**
 * Schema de validación para variables de entorno con Zod.
 * Toda la persistencia vive en Supabase — no hay base de datos local.
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

  // Supabase (única persistencia)
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // CORS
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
});

type EnvType = z.infer<typeof envSchema>;

/**
 * Parsear y validar variables de entorno.
 * Compose pasa ${VAR} vacío como '', no como ausente. Tratamos '' como undefined
 * para que las vars .optional() del schema funcionen correctamente.
 */
function parseEnv(): EnvType {
  const cleaned = Object.fromEntries(
    Object.entries(process.env).map(([k, v]) => [k, v === '' ? undefined : v]),
  );
  const result = envSchema.safeParse(cleaned);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const errorMessages = Object.entries(errors)
      .map(([key, msgs]) => `${key}: ${msgs?.join(', ')}`)
      .join('\n');

    if (process.env.NODE_ENV === 'production') {
      console.error(`❌ Configuración incompleta:\n${errorMessages}`);
      throw new Error(`Configuración incompleta: ${Object.keys(errors).join(', ')}`);
    } else {
      console.warn(`⚠️ Variables de entorno no validadas:\n${errorMessages}`);
      console.warn('⚠️ Continuando en modo desarrollo con valores por defecto');
    }
  }

  return result.data ?? envSchema.parse({});
}

const envVars = parseEnv();

/**
 * Configuración centralizada de la aplicación.
 * NOTA: No hay sección `database` — toda persistencia es Supabase.
 */
export const config = {
  environment: envVars.NODE_ENV,
  isDevelopment: envVars.NODE_ENV === 'development',
  isProduction: envVars.NODE_ENV === 'production',

  log: {
    level: envVars.LOG_LEVEL,
  },

  webhook: {
    port: envVars.WEBHOOK_PORT,
  },

  meta: {
    apiUrl: envVars.META_API_URL,
    phoneNumberId: envVars.META_PHONE_NUMBER_ID || '',
    accessToken: envVars.META_ACCESS_TOKEN || '',
    verifyToken: envVars.META_VERIFY_TOKEN || '',
    appSecret: envVars.META_APP_SECRET || '',
  },

  bot: {
    name: envVars.BOT_NAME,
  },

  supabase: {
    url: envVars.SUPABASE_URL || '',
    serviceRoleKey: envVars.SUPABASE_SERVICE_ROLE_KEY || '',
  },

  cors: {
    allowedOrigins: envVars.ALLOWED_ORIGINS,
  },
};

/**
 * Validar configuración crítica al iniciar la aplicación.
 * Meta credentials son opcionales en dev: Bootstrap degrada a ConsoleNotificationAdapter
 * si faltan. En producción, sí son críticas.
 */
export function validateConfig(): void {
  if (config.isProduction) {
    const missing: string[] = [];
    if (!config.supabase.url) missing.push('SUPABASE_URL');
    if (!config.supabase.serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    if (!config.meta.phoneNumberId) missing.push('META_PHONE_NUMBER_ID');
    if (!config.meta.accessToken) missing.push('META_ACCESS_TOKEN');
    if (!config.meta.appSecret) missing.push('META_APP_SECRET');
    if (!config.meta.verifyToken) missing.push('META_VERIFY_TOKEN');

    if (missing.length > 0) {
      throw new Error(
        `❌ Configuración incompleta en PRODUCCIÓN. Variables faltantes: ${missing.join(', ')}`,
      );
    }
    console.log('✅ Configuración de producción validada correctamente');
  }
}