/**
 * Contrato de domain/whatsapp/limits.ts: cada grupo cita su página oficial,
 * lo no confirmado por Meta está marcado y apunta a claves reales, y nadie
 * puede mutar los números en runtime.
 */
import {
  WHATSAPP_LIMITS,
  WHATSAPP_LIMITS_VERIFIED_AT,
} from '@/domain/whatsapp/limits';

const DOCS_PREFIX =
  'https://developers.facebook.com/documentation/business-messaging/whatsapp/';

const groups = Object.entries(WHATSAPP_LIMITS) as Array<[string, Record<string, unknown>]>;

describe('WHATSAPP_LIMITS', () => {
  it('trae una fecha de verificación ISO', () => {
    expect(WHATSAPP_LIMITS_VERIFIED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it.each(groups)('%s cita una página oficial de Meta', (_name, group) => {
    expect(typeof group.doc).toBe('string');
    expect(group.doc as string).toMatch(new RegExp(`^${DOCS_PREFIX.replace(/[.]/g, '\\.')}`));
  });

  it.each(groups)('%s solo marca como no confirmadas claves que existen', (_name, group) => {
    const unconfirmed = (group.unconfirmed ?? []) as string[];
    for (const key of unconfirmed) {
      expect(Object.keys(group)).toContain(key);
    }
  });

  it.each(groups)('%s: todo número es un entero positivo', (_name, group) => {
    for (const [key, value] of Object.entries(group)) {
      if (typeof value !== 'number') continue;
      expect({ key, ok: Number.isInteger(value) && value > 0 }).toEqual({ key, ok: true });
    }
  });

  it.each(groups)('%s: cada xMin es menor o igual que su xMax', (_name, group) => {
    for (const [key, min] of Object.entries(group)) {
      if (!key.endsWith('Min') || typeof min !== 'number') continue;
      const max = group[`${key.slice(0, -3)}Max`];
      expect(typeof max).toBe('number');
      expect(min).toBeLessThanOrEqual(max as number);
    }
  });

  it('está congelado en profundidad', () => {
    expect(() => {
      (WHATSAPP_LIMITS.replyButtons as { buttonsMax: number }).buttonsMax = 5;
    }).toThrow(TypeError);
    expect(() => {
      (WHATSAPP_LIMITS.list.headerTypes as unknown as string[]).push('image');
    }).toThrow(TypeError);
    expect(WHATSAPP_LIMITS.replyButtons.buttonsMax).toBe(3);
  });

  it('no ofrece address messages en México', () => {
    expect(WHATSAPP_LIMITS.addressMessages.availableCountries).not.toContain('MX');
  });
});
