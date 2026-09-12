import { describe, expect, it } from 'vitest';
import { changePasswordError, type ChangePasswordForm } from './change-password-model';

const valid: ChangePasswordForm = {
  email: 'ovy@seguritech.mx',
  currentPassword: 'Temporal-2026',
  newPassword: 'NuevaSegura2026',
  confirmPassword: 'NuevaSegura2026',
};

const withNew = (newPassword: string): ChangePasswordForm => ({ ...valid, newPassword, confirmPassword: newPassword });

describe('changePasswordError', () => {
  it('deja pasar lo que el backend acepta', () => {
    expect(changePasswordError(valid)).toBeNull();
  });

  it('pide todos los campos (un correo de puros espacios cuenta como vacío)', () => {
    expect(changePasswordError({ ...valid, email: '   ' })).toBe('Completa todos los campos');
    expect(changePasswordError({ ...valid, currentPassword: '' })).toBe('Completa todos los campos');
    expect(changePasswordError({ ...valid, confirmPassword: '' })).toBe('Completa todos los campos');
  });

  it('las dos contraseñas nuevas tienen que coincidir', () => {
    expect(changePasswordError({ ...valid, confirmPassword: 'NuevaSegura2027' })).toBe('Las contraseñas nuevas no coinciden');
  });

  it('mínimo 12 y máximo 200 caracteres, como ChangePasswordSchema', () => {
    expect(changePasswordError(withNew('Corta12345a'))).toMatch(/al menos 12/);
    expect(changePasswordError(withNew('Larga1234abc'))).toBeNull();
    expect(changePasswordError(withNew(`Aa1${'x'.repeat(198)}`))).toMatch(/hasta 200/);
  });

  it('dice qué le falta: mayúscula, minúscula, número', () => {
    expect(changePasswordError(withNew('nuevasegura2026'))).toBe('A la contraseña nueva le falta una mayúscula');
    expect(changePasswordError(withNew('NUEVASEGURA2026'))).toBe('A la contraseña nueva le falta una minúscula');
    expect(changePasswordError(withNew('nuevaseguraaa'))).toBe('A la contraseña nueva le falta una mayúscula y un número');
  });

  it('la nueva tiene que ser distinta de la actual', () => {
    expect(changePasswordError({ ...withNew('Temporal-2026'), currentPassword: 'Temporal-2026' })).toBe(
      'La contraseña nueva tiene que ser distinta de la actual',
    );
  });
});
