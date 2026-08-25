import { normalizeText, fuzzyIncludes } from '@/domain/services/textMatch';

describe('textMatch', () => {
  describe('normalizeText', () => {
    it('quita acentos y normaliza a minúsculas', () => {
      expect(normalizeText('Información')).toBe('informacion');
      expect(normalizeText('  Cuánto Cuesta  ')).toBe('cuanto cuesta');
    });
  });

  describe('fuzzyIncludes', () => {
    it('matchea por acento (información vs informacion)', () => {
      expect(fuzzyIncludes('quiero información por favor', 'informacion')).toBe(true);
      expect(fuzzyIncludes('quiero informacion por favor', 'información')).toBe(true);
    });

    it('matchea con typo + acento (impresiónes vs impresiones)', () => {
      expect(fuzzyIncludes('hacen impresiónes aquí', 'impresiones')).toBe(true);
    });

    it('NO matchea palabras cortas distintas ("si" vs "no")', () => {
      expect(fuzzyIncludes('no quiero', 'si')).toBe(false);
      expect(fuzzyIncludes('si quiero', 'no')).toBe(false);
    });

    it('matchea palabra corta exacta ("si" vs "si")', () => {
      expect(fuzzyIncludes('si claro', 'si')).toBe(true);
    });

    it('matchea frase multi-palabra con acento (cuánto cuesta vs cuanto cuesta)', () => {
      expect(fuzzyIncludes('oye cuánto cuesta el servicio', 'cuanto cuesta')).toBe(true);
      expect(fuzzyIncludes('oye cuanto cuesta el servicio', 'cuánto cuesta')).toBe(true);
    });

    it('no matchea texto sin relación', () => {
      expect(fuzzyIncludes('quiero comprar una llave', 'impresion')).toBe(false);
    });

    it('keyword vacía nunca matchea', () => {
      expect(fuzzyIncludes('cualquier texto', '')).toBe(false);
    });
  });
});
