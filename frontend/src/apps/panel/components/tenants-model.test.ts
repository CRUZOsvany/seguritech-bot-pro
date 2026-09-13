import { describe, expect, it } from 'vitest';
import { canHardDelete, confirmNameMatches } from './tenants-model';

describe('canHardDelete', () => {
  it('permite draft, sandbox y archived', () => {
    expect(canHardDelete('draft')).toBe(true);
    expect(canHardDelete('sandbox')).toBe(true);
    expect(canHardDelete('archived')).toBe(true);
  });

  it('bloquea live y paused', () => {
    expect(canHardDelete('live')).toBe(false);
    expect(canHardDelete('paused')).toBe(false);
  });
});

describe('confirmNameMatches', () => {
  it('solo con el nombre idéntico', () => {
    expect(confirmNameMatches('Papelería DEMO', 'Papelería DEMO')).toBe(true);
  });

  it('no perdona mayúsculas, acentos, espacios ni el campo vacío', () => {
    expect(confirmNameMatches('papelería demo', 'Papelería DEMO')).toBe(false);
    expect(confirmNameMatches('Papeleria DEMO', 'Papelería DEMO')).toBe(false);
    expect(confirmNameMatches('Papelería DEMO ', 'Papelería DEMO')).toBe(false);
    expect(confirmNameMatches('', 'Papelería DEMO')).toBe(false);
  });
});
