/**
 * Detección de entorno de ejecución del panel, basada en el modo de Vite.
 *
 * Vite expone import.meta.env.DEV/PROD/MODE de forma nativa:
 *   - npm run dev          → DEV = true,  MODE = 'development'
 *   - npm run build:panel  → PROD = true, MODE = 'production'
 *
 * Un tercer entorno explícito (sandbox/staging) requeriría definir la variable
 * VITE_APP_ENV en el build — no existe hoy (ver deuda en el reporte).
 */

export type AppEnv = 'development' | 'production';

export function getAppEnv(): AppEnv {
  return import.meta.env.DEV ? 'development' : 'production';
}

export interface EnvBadgeStyle {
  label: string;
  /** Clases Tailwind para el contenedor del badge. */
  className: string;
}

/** Estilo del badge de entorno para el header. */
export function envBadge(): EnvBadgeStyle {
  const env = getAppEnv();
  if (env === 'development') {
    return {
      label: 'LOCAL',
      className: 'border-amber-300 bg-amber-50 text-amber-700',
    };
  }
  return {
    label: 'PROD',
    className: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  };
}
