import { describe, expect, it } from 'vitest';
import { ApiError, apiErrorMessage } from './client';

describe('apiErrorMessage', () => {
  it('muestra el { error } del backend tal cual', () => {
    expect(apiErrorMessage(new ApiError(400, 'El nombre no coincide'))).toBe('El nombre no coincide');
  });

  it('también la red caída, que apiFetch envuelve como ApiError', () => {
    expect(apiErrorMessage(new ApiError(0, 'Red caída: Failed to fetch'))).toBe('Red caída: Failed to fetch');
  });

  it('cualquier otro error no se enseña crudo', () => {
    expect(apiErrorMessage(new TypeError('x is undefined'))).toBe('Error inesperado');
    expect(apiErrorMessage('boom')).toBe('Error inesperado');
    expect(apiErrorMessage(undefined)).toBe('Error inesperado');
  });
});
