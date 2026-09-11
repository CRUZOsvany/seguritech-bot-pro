/**
 * C-04: qué acepta cada tipo de captura y cómo lo guarda.
 */
import {
  checkCapture,
  defaultCaptureError,
  describeCapture,
  sampleCapture,
  type AnyCaptureValidation,
} from '@/domain/conversation/captureValidation';

const accepts = (v: AnyCaptureValidation, input: string) => checkCapture(v, input);

describe('checkCapture', () => {
  it.each([
    ['747 123 4567', '7471234567'],
    ['(747) 123-45-67', '7471234567'],
    ['+52 747 123 4567', '7471234567'],
    ['+52 1 747 123 4567', '7471234567'],
    ['527471234567', '7471234567'],
  ])('teléfono MX: "%s" → %s', (input, value) => {
    expect(accepts({ type: 'phone_mx' }, input)).toEqual({ valid: true, value });
  });

  it.each(['12345', 'mi cel 7471234567', '747-123-456', ''])('teléfono MX: rechaza "%s"', (input) => {
    expect(accepts({ type: 'phone_mx' }, input).valid).toBe(false);
  });

  it('correo: lo guarda en minúsculas; sin dominio no pasa', () => {
    expect(accepts({ type: 'email' }, ' Ana@Correo.MX ')).toEqual({ valid: true, value: 'ana@correo.mx' });
    expect(accepts({ type: 'email' }, 'ana@correo').valid).toBe(false);
    expect(accepts({ type: 'email' }, 'ana correo@x.mx').valid).toBe(false);
  });

  it('número: coma decimal, rango y enteros', () => {
    expect(accepts({ type: 'number', min: 1, max: 10 }, '3,5')).toEqual({ valid: true, value: '3.5' });
    expect(accepts({ type: 'number', min: 1, max: 10 }, '11').valid).toBe(false);
    expect(accepts({ type: 'number', min: 0 }, '-1').valid).toBe(false);
    expect(accepts({ type: 'number', integer: true }, '2.5').valid).toBe(false);
    expect(accepts({ type: 'number', integer: true }, '12')).toEqual({ valid: true, value: '12' });
    expect(accepts({ type: 'number' }, 'tres').valid).toBe(false);
  });

  it.each([
    ['15/03/2026', '15/03/2026'],
    ['5-3-26', '05/03/2026'],
    ['15 de Marzo', '15/03'],
    ['1 de septiembre de 2026', '01/09/2026'],
    ['29/02', '29/02'],
  ])('fecha: "%s" → %s', (input, value) => {
    expect(accepts({ type: 'date' }, input)).toEqual({ valid: true, value });
  });

  it.each(['31/02/2026', '29/02/2026', '15/13/2026', 'mañana', '15 de marzzo'])('fecha: rechaza "%s"', (input) => {
    expect(accepts({ type: 'date' }, input).valid).toBe(false);
  });

  it.each([
    ['5 pm', '17:00'],
    ['5:30 p.m.', '17:30'],
    ['17:30 hrs', '17:30'],
    ['12 am', '00:00'],
    ['9:05', '09:05'],
  ])('hora: "%s" → %s', (input, value) => {
    expect(accepts({ type: 'time' }, input)).toEqual({ valid: true, value });
  });

  it.each(['25:00', '5', '13 pm', 'en la tarde'])('hora: rechaza "%s"', (input) => {
    expect(accepts({ type: 'time' }, input).valid).toBe(false);
  });

  it('texto: largo contado por caracteres, sin espacios de las orillas', () => {
    const v: AnyCaptureValidation = { type: 'text', min_length: 5, max_length: 10 };
    expect(accepts(v, 'hola').valid).toBe(false);
    expect(accepts(v, '  hola mundo  ')).toEqual({ valid: true, value: 'hola mundo' });
    expect(accepts(v, 'hola mundo!').valid).toBe(false);
  });

  it('"numeric" (la de antes de C-04) se porta igual y no normaliza', () => {
    expect(accepts('numeric', ' 3,5 ')).toEqual({ valid: true });
    expect(accepts('numeric', '-3').valid).toBe(false);
  });
});

describe('ejemplos, mensajes y descripciones', () => {
  const all: AnyCaptureValidation[] = [
    'numeric',
    { type: 'phone_mx' },
    { type: 'email' },
    { type: 'number', min: 10, max: 20, integer: true },
    { type: 'number', max: 2 },
    { type: 'date' },
    { type: 'time' },
    { type: 'text', min_length: 40 },
    { type: 'text', max_length: 5 },
  ];

  it.each(all.map((v) => [JSON.stringify(v), v] as const))('el ejemplo del explorador pasa la validación: %s', (_name, v) => {
    expect(checkCapture(v, sampleCapture(v)).valid).toBe(true);
  });

  it('el mensaje por defecto dice el rango y da un ejemplo válido', () => {
    expect(defaultCaptureError({ type: 'number', min: 1, max: 5 })).toBe('Escribe solo el número entre 1 y 5, por ejemplo: *3*');
    expect(describeCapture({ type: 'number', integer: true, min: 1 })).toBe('un número entero de 1 o más');
  });
});
