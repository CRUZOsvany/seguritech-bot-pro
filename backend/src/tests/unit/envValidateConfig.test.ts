/**
 * Regresión — F8 (auditoría 2026-08-20): ALLOWED_ORIGINS se quedaba en su
 * default de loopback (http://127.0.0.1:3001) en producción sin que
 * validateConfig() lo detectara, lo que apunta a un despliegue mal
 * configurado (CORS bloquearía al panel real). Ahora es requerido.
 *
 * También cubre F5: BACKEND_API_KEY ahora exige mínimo 32 chars (antes 16)
 * dado el nivel de privilegio que otorga (super_admin global).
 *
 * Cada test recarga el módulo con jest.resetModules() + require dinámico
 * porque `config`/`envSchema` se calculan una sola vez al importar.
 */

const REQUIRED_PROD_ENV = {
  NODE_ENV: 'production',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'x'.repeat(40),
  META_APP_SECRET: 'a'.repeat(32),
  META_VERIFY_TOKEN: 'b'.repeat(32),
  META_TOKEN_ENCRYPTION_KEY: 'c'.repeat(64),
  ADMIN_JWT_SECRET: 'd'.repeat(64),
};

describe('validateConfig() — variables requeridas en producción', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
  });

  function setEnv(overrides: Record<string, string | undefined>) {
    process.env = { ...ORIGINAL_ENV, ...REQUIRED_PROD_ENV, ...overrides };
    jest.resetModules();
    return require('@/config/env') as typeof import('@/config/env');
  }

  it('lanza si ALLOWED_ORIGINS se queda en el default de loopback', () => {
    const { validateConfig } = setEnv({ ALLOWED_ORIGINS: undefined });
    expect(() => validateConfig()).toThrow(/ALLOWED_ORIGINS/);
  });

  it('NO lanza por ALLOWED_ORIGINS si se configuró explícitamente', () => {
    const { validateConfig } = setEnv({ ALLOWED_ORIGINS: 'https://panel.seguritech.example' });
    expect(() => validateConfig()).not.toThrow();
  });

  it('BACKEND_API_KEY de 16 chars (mínimo previo) ya no pasa el schema de Zod', () => {
    // En dev/test, un campo inválido hace que parseEnv() caiga a defaults
    // (no truena, a diferencia de producción) — el valor inválido nunca
    // llega a config.admin.apiKey.
    const { config } = setEnv({ NODE_ENV: 'test', BACKEND_API_KEY: 'a'.repeat(16) });
    expect(config.admin.apiKey).toBe('');
  });

  it('BACKEND_API_KEY de 32 chars sí es válido', () => {
    const { config } = setEnv({ NODE_ENV: 'test', BACKEND_API_KEY: 'a'.repeat(32) });
    expect(config.admin.apiKey).toBe('a'.repeat(32));
  });
});
