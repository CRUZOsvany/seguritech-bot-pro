/**
 * Inactividad (Fase 5): la decisión pura de qué le toca a una conversación.
 */
import type { FlowInactivity } from '@/domain/entities/flow';
import { inactivityCheckpoints, inactivityDue } from '@/domain/conversation/inactivity';

const INACTIVITY: FlowInactivity = {
  reminder: { after_minutes: 15, text: '¿Sigues ahí?' },
  close: { after_minutes: 60, text: 'Cerramos por ahora.' },
};
const LAST = new Date('2026-09-10T17:00:00.000Z');
const after = (minutes: number) => new Date(LAST.getTime() + minutes * 60_000);

const waiting = (extra: Record<string, unknown> = {}) => ({
  currentNodeId: 'menu',
  lastInboundAt: LAST,
  inactivityRemindedAt: null,
  optedOutAt: null,
  humanPausedUntil: null,
  ...extra,
});

const due = (minutes: number, user = waiting(), inactivity: FlowInactivity | undefined = INACTIVITY, sessionExpired = false) =>
  inactivityDue({ inactivity, user, now: after(minutes), sessionExpired });

describe('inactivityDue', () => {
  it('antes del recordatorio, nada; a su hora, el recordatorio; a la hora del cierre, el cierre', () => {
    expect(due(14)).toBeNull();
    expect(due(15)).toBe('reminder');
    expect(due(59)).toBe('reminder');
    expect(due(60)).toBe('close');
  });

  it('un recordatorio por silencio: si ya salió después del último mensaje, no otro', () => {
    expect(due(20, waiting({ inactivityRemindedAt: after(15) }))).toBeNull();
  });

  it('un recordatorio de un silencio anterior no cuenta', () => {
    expect(due(20, waiting({ inactivityRemindedAt: new Date(LAST.getTime() - 60_000) }))).toBe('reminder');
  });

  it('sin recordatorio configurado, solo el cierre', () => {
    const onlyClose: FlowInactivity = { close: { after_minutes: 30 } };
    expect(due(20, waiting(), onlyClose)).toBeNull();
    expect(due(30, waiting(), onlyClose)).toBe('close');
  });

  it.each([
    ['sin inactividad en el flow', () => inactivityDue({ inactivity: undefined, user: waiting(), now: after(60), sessionExpired: false })],
    ['conversación que ya terminó', () => due(60, waiting({ currentNodeId: 'end' }))],
    ['contacto sin paso guardado', () => due(60, waiting({ currentNodeId: undefined }))],
    ['con la baja activa', () => due(60, waiting({ optedOutAt: LAST }))],
    ['con una persona atendiendo', () => due(60, waiting({ humanPausedUntil: after(48 * 60) }))],
    ['con la sesión vencida (TTL o el negocio cerró en medio)', () => due(60, waiting(), INACTIVITY, true)],
    ['sin mensaje del cliente registrado', () => due(60, waiting({ lastInboundAt: null }))],
  ])('%s: nada', (_caso, run) => {
    expect(run()).toBeNull();
  });

  it('una pausa por persona que ya venció no detiene el cierre', () => {
    expect(due(60, waiting({ humanPausedUntil: after(30) }))).toBe('close');
  });

  it('nunca con la ventana de 24 h cerrada, aunque el contrato lo pidiera (V-CUMP-03)', () => {
    const late: FlowInactivity = { close: { after_minutes: 25 * 60 } };
    expect(due(25 * 60, waiting(), late)).toBeNull();
  });
});

describe('inactivityCheckpoints', () => {
  it('el recordatorio y el cierre, en orden', () => {
    expect(inactivityCheckpoints(INACTIVITY, waiting())).toEqual([after(15), after(60)]);
  });

  it('si el recordatorio ya salió en este silencio, solo el cierre', () => {
    expect(inactivityCheckpoints(INACTIVITY, waiting({ inactivityRemindedAt: after(15) }))).toEqual([after(60)]);
  });

  it('nada fuera de una conversación', () => {
    expect(inactivityCheckpoints(INACTIVITY, waiting({ currentNodeId: 'end' }))).toEqual([]);
    expect(inactivityCheckpoints(undefined, waiting())).toEqual([]);
  });
});
