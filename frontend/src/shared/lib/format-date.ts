import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Formatea una fecha (string ISO o Date) como tiempo relativo en español.
 * Ej: "hace 3 horas", "hace 2 días", "en 5 minutos".
 *
 * Devuelve cadena vacía si el input es null/undefined/vacío o no parseable,
 * para que el caller pueda renderizar condicionalmente sin reventar.
 */
export function formatRelativeTime(input: string | Date | null | undefined): string {
  if (!input) return '';
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return '';
  return formatDistanceToNow(date, { addSuffix: true, locale: es });
}

/**
 * Formatea una fecha como absoluta legible en español, para tooltips.
 * Ej: "6 de junio de 2026, 14:32".
 */
export function formatAbsoluteTime(input: string | Date | null | undefined): string {
  if (!input) return '';
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
