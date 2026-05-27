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
  META_VERIFY_TOKEN: z.string().min(32).optional(),
  META_APP_SECRET: z.string().min(32).optional(),

  // Clave para cifrar tokens de Meta en tenant_meta_credentials.
  // Generar con: openssl rand -hex 32
  META_TOKEN_ENCRYPTION_KEY: z.string().length(64).optional(),

  // Bot
  BOT_NAME: z.string().default('SegurITech Bot'),

  // Supabase (única persistencia)
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // CORS — el panel HTML se sirve desde el mismo origen del backend, así que
  // same-origin no necesita CORS. Esta lista solo importa para clientes
  // externos (ej. otra herramienta interna que pegue al backend desde otro host).
  ALLOWED_ORIGINS: z.string().default('http://127.0.0.1:3001'),

  // Admin API
  BACKEND_API_KEY: z.string().min(16).optional(),

  // Cloudflare Access: dominio de email whitelist para el panel en producción.
  // Cloudflare inyecta el header Cf-Access-Authenticated-User-Email tras OAuth.
  // En dev local no se usa.
  CLOUDFLARE_ALLOWED_DOMAIN: z.string().min(3).optional(),

  // Sesiones admin (Operación Búnker v2 — Sprint F)
  // Secreto para firmar JWTs. Generar con: openssl rand -hex 64
  ADMIN_JWT_SECRET: z.string().min(64).optional(),
  // Tiempo de vida del JWT en segundos (8h por defecto)
  ADMIN_JWT_TTL_SECONDS: z.coerce.number().int().positive().default(28800),
  // Cookie name. En prod usar prefijo __Host- para impone Secure+Path=/+sin Domain.
  ADMIN_COOKIE_NAME: z.string().default('seguritech_session'),
  // Cookie del POS — separada para que cajero y admin puedan coexistir en
  // el mismo navegador sin pisarse (Sprint 5.1a).
  ADMIN_POS_COOKIE_NAME: z.string().default('seguritech_pos_session'),
  // Lockout por intentos fallidos
  ADMIN_LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  ADMIN_LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),
  // Bcrypt cost (12 es el sweet spot 2026)
  ADMIN_BCRYPT_COST: z.coerce.number().int().min(10).max(14).default(12),
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
    verifyToken: envVars.META_VERIFY_TOKEN || '',
    appSecret: envVars.META_APP_SECRET || '',
    tokenEncryptionKey: envVars.META_TOKEN_ENCRYPTION_KEY || '',
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

  admin: {
    apiKey: envVars.BACKEND_API_KEY || '',
    cloudflareAllowedDomain: envVars.CLOUDFLARE_ALLOWED_DOMAIN || '',
    jwtSecret: envVars.ADMIN_JWT_SECRET || '',
    jwtTtlSeconds: envVars.ADMIN_JWT_TTL_SECONDS,
    cookieName: envVars.ADMIN_COOKIE_NAME,
    posCookieName: envVars.ADMIN_POS_COOKIE_NAME,
    loginMaxAttempts: envVars.ADMIN_LOGIN_MAX_ATTEMPTS,
    loginLockoutMinutes: envVars.ADMIN_LOGIN_LOCKOUT_MINUTES,
    bcryptCost: envVars.ADMIN_BCRYPT_COST,
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
    if (!config.meta.appSecret) missing.push('META_APP_SECRET');
    if (!config.meta.verifyToken) missing.push('META_VERIFY_TOKEN');
    if (!config.meta.tokenEncryptionKey) missing.push('META_TOKEN_ENCRYPTION_KEY');
    if (!config.admin.jwtSecret) missing.push('ADMIN_JWT_SECRET');

    if (missing.length > 0) {
      throw new Error(
        `❌ Configuración incompleta en PRODUCCIÓN. Variables faltantes: ${missing.join(', ')}`,
      );
    }
    console.log('✅ Configuración de producción validada correctamente');
  }
}