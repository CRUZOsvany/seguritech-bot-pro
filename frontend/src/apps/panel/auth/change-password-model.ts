/**
 * Reglas del cambio de contraseña: las mismas que aplica el backend
 * (`ChangePasswordSchema` y el chequeo de "distinta" en AuthRouter.ts). El
 * backend sigue decidiendo; esto evita el viaje para errores obvios y dice
 * en español qué falta, en vez del mensaje de zod.
 */
export interface ChangePasswordForm {
  email: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export const NEW_PASSWORD_MIN_LENGTH = 12;
const NEW_PASSWORD_MAX_LENGTH = 200;

/** El primer problema del formulario, o `null` si se puede mandar. */
export function changePasswordError(form: ChangePasswordForm): string | null {
  const { email, currentPassword, newPassword, confirmPassword } = form;
  if (!email.trim() || !currentPassword || !newPassword || !confirmPassword) {
    return 'Completa todos los campos';
  }
  if (newPassword !== confirmPassword) {
    return 'Las contraseñas nuevas no coinciden';
  }
  if (newPassword.length < NEW_PASSWORD_MIN_LENGTH) {
    return `La contraseña nueva necesita al menos ${NEW_PASSWORD_MIN_LENGTH} caracteres`;
  }
  if (newPassword.length > NEW_PASSWORD_MAX_LENGTH) {
    return `La contraseña nueva puede tener hasta ${NEW_PASSWORD_MAX_LENGTH} caracteres`;
  }
  const missing = [
    /[A-Z]/.test(newPassword) ? null : 'una mayúscula',
    /[a-z]/.test(newPassword) ? null : 'una minúscula',
    /[0-9]/.test(newPassword) ? null : 'un número',
  ].filter((m): m is string => m !== null);
  if (missing.length > 0) {
    return `A la contraseña nueva le falta ${joinSpanish(missing)}`;
  }
  if (newPassword === currentPassword) {
    return 'La contraseña nueva tiene que ser distinta de la actual';
  }
  return null;
}

function joinSpanish(items: string[]): string {
  return items.length === 1 ? items[0] : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}
