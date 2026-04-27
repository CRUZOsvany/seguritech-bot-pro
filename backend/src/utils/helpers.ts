/**
 * Utilidades y helpers globales
 */

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public isOperational: boolean = true,
  ) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Formatea un JID de WhatsApp para mostrar
 */
export function formatJid(jid: string): string {
  return jid.replace(/@s\.whatsapp\.net|@g\.us/g, '');
}

/**
 * Espera un número de milisegundos
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Valida si una cadena es un JID válido de WhatsApp
 */
export function isValidJid(jid: string): boolean {
  return /^\d+@s\.whatsapp\.net$/.test(jid);
}

/**
 * Convierte número de teléfono a JID
 */
export function phoneToJid(phone: string): string {
  // Remover caracteres especiales
  const cleaned = phone.replace(/\D/g, '');
  return `${cleaned}@s.whatsapp.net`;
}

/**
 * Obtiene el timestamp actual en formato ISO
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

