import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api/client';
import type { SimTurn } from '@/shared/api/studio';
import type { SimConversation } from '@/shared/simulator/studioView';
import { buildExpectation, busyTurns, describeExpectation, linesOf, publishFailure, suggestTestName, testFromConversation } from './testing-model';

function turn(node: string | null, customerMessages = 1): SimTurn {
  return {
    at: '2026-01-05T17:00:00.000Z',
    outbound: [
      ...Array.from({ length: customerMessages }, () => ({ to: '5210000000000', audience: 'customer' as const, payload: { type: 'text', to: '5210000000000' } })),
      { to: '527470000000', audience: 'owner' as const, payload: { type: 'text', to: '527470000000' } },
    ],
    trace: [],
    why: [],
    session: node === null ? null : { currentNodeId: node, context: {}, lastInboundAt: null, humanPausedUntil: null, optedOut: false },
    billing: { serviceMessages: customerMessages, templates: 0 },
  };
}

const conversation = (turns: SimTurn[]): SimConversation => ({
  events: [
    { type: 'text', text: 'hola' },
    { type: 'button_reply', id: 'btn_0', title: '🚨 Emergencia' },
    { type: 'advance_time', minutes: 30 },
  ],
  turns,
  startAt: '2026-01-05T11:00:00-06:00',
  from: '5210000000000',
});

describe('testFromConversation', () => {
  it('repite la conversación con el mismo reloj y teléfono, y espera el paso donde quedó', () => {
    const t = testFromConversation(conversation([turn('menu'), turn('emergencia__servicio'), turn('emergencia__servicio', 0)]));

    expect(t).toEqual({
      name: 'hola → 🚨 Emergencia',
      events: conversation([]).events,
      expect: { node: 'emergencia__servicio' },
      options: { startAt: '2026-01-05T11:00:00-06:00', from: '5210000000000' },
    });
  });

  it('sin paso final, espera el mismo número de mensajes al cliente (no cuenta los del dueño)', () => {
    const t = testFromConversation(conversation([turn('menu', 2), turn(null, 1)]));

    expect(t.expect).toEqual({ maxMessages: 3 });
  });
});

describe('suggestTestName', () => {
  it('recorta nombres largos al máximo del backend', () => {
    const long = { ...conversation([]), events: [{ type: 'text' as const, text: 'x'.repeat(300) }] };

    expect(suggestTestName(long)).toHaveLength(120);
  });

  it('sin mensajes del cliente se llama «Prueba»', () => {
    expect(suggestTestName({ ...conversation([]), events: [{ type: 'advance_time', minutes: 5 }] })).toBe('Prueba');
  });
});

describe('expectativas', () => {
  it('describe cada expectativa en español', () => {
    expect(describeExpectation({ node: 'fin', vars: { direccion: 'Morelos 12' }, contains: ['Gracias'], notContains: ['error'], maxMessages: 4 })).toEqual([
      'Termina en «fin»',
      'Guarda {{direccion}} = «Morelos 12»',
      'Dice «Gracias»',
      'No dice «error»',
      'Manda como máximo 4 mensaje(s)',
    ]);
  });

  it('el formulario vacío no arma una expectativa', () => {
    expect(buildExpectation({ node: ' ', contains: '\n', notContains: '' })).toBeNull();
    expect(buildExpectation({ node: 'fin', contains: 'a\n\n b ', notContains: '' })).toEqual({ node: 'fin', contains: ['a', 'b'] });
    expect(linesOf(' uno \n\ndos')).toEqual(['uno', 'dos']);
  });
});

describe('busyTurns', () => {
  it('solo los turnos con más de un mensaje, del más cargado al menos', () => {
    expect(
      busyTurns([
        { entry: 'a', messages: 1, path: ['a'] },
        { entry: 'b', messages: 2, path: ['b', 'c'] },
        { entry: 'd', messages: 4, path: ['d', 'e', 'f', 'g'] },
      ]).map((t) => t.entry),
    ).toEqual(['d', 'b']);
    expect(busyTurns(undefined)).toEqual([]);
  });
});

describe('publishFailure', () => {
  it('pruebas fallidas: nombre y por qué', () => {
    const err = new ApiError(400, 'No se puede publicar: fallan 1 prueba(s).', undefined, {
      error: 'x',
      issues: [{ path: 'Emergencia', message: 'Terminó en «a» y se esperaba «b».' }],
      testReport: {
        total: 2,
        passed: 1,
        failed: 1,
        results: [
          { id: 't1', name: 'Emergencia', passed: false, failures: ['Terminó en «a» y se esperaba «b».'] },
          { id: 't2', name: 'Horario', passed: true, failures: [] },
        ],
      },
    });

    expect(publishFailure(err)).toEqual({
      message: 'No se puede publicar: fallan 1 prueba(s).',
      issues: [],
      tests: [{ name: 'Emergencia', failures: ['Terminó en «a» y se esperaba «b».'] }],
    });
  });

  it('errores del validador: la lista de issues', () => {
    const err = new ApiError(400, 'No se puede publicar: el flujo tiene 1 error(es).', undefined, {
      error: 'x',
      issues: [{ path: 'menu', message: 'V-FLOW-01: …' }],
    });

    expect(publishFailure(err)).toMatchObject({ issues: [{ path: 'menu', message: 'V-FLOW-01: …' }], tests: [] });
  });

  it('un error cualquiera: solo el mensaje', () => {
    expect(publishFailure(new Error('Red caída'))).toEqual({ message: 'Red caída', issues: [], tests: [] });
  });
});
