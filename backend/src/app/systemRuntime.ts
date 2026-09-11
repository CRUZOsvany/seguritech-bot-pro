import { randomUUID } from 'crypto';
import type { ClockPort, IdGenerator } from '@/domain/ports';

/** Hora real del sistema. El único lugar del camino del bot que la lee. */
export const systemClock: ClockPort = {
  now: () => new Date(),
};

/**
 * Ids reales. `orderId` conserva el formato de siempre (base 36 de la hora +
 * 4 caracteres aleatorios), así que los folios que ve el cliente no cambian.
 */
export function createSystemIdGenerator(clock: ClockPort = systemClock): IdGenerator {
  return {
    uuid: () => randomUUID(),
    orderId: () => {
      const ts = clock.now().getTime().toString(36).toUpperCase();
      const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
      return `${ts}-${rnd}`;
    },
  };
}
