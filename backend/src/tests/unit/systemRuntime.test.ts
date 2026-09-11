/**
 * Reloj e ids reales del camino de producción. El folio que ve el cliente
 * en {{order_id}} conserva el formato de antes de la Fase 1.
 */
import { createSystemIdGenerator, systemClock } from '@/app/systemRuntime';

describe('systemRuntime', () => {
  it('el folio es la hora en base 36 más 4 caracteres, en mayúsculas', () => {
    const at = new Date('2026-09-10T12:00:00Z');
    const ids = createSystemIdGenerator({ now: () => at });

    const folio = ids.orderId();

    expect(folio).toMatch(/^[0-9A-Z]+-[0-9A-Z]{1,4}$/);
    expect(folio.split('-')[0]).toBe(at.getTime().toString(36).toUpperCase());
  });

  it('los uuid son uuid v4 distintos', () => {
    const ids = createSystemIdGenerator();
    const a = ids.uuid();

    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(ids.uuid()).not.toBe(a);
  });

  it('el reloj del sistema es la hora real', () => {
    const before = Date.now();
    const now = systemClock.now().getTime();

    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});
