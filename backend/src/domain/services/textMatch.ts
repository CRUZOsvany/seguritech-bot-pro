/**
 * Utilidades de comparación de texto tolerante a acentos y errores de dedo.
 * Sin dependencias externas — Levenshtein clásico. Usado por FlowInterpreter
 * (condición 'keyword', Fase 2) y ServiceDirectoryMatcher (Fase 5).
 *
 * NOTA: el rango de diacríticos combinantes (U+0300-U+036F) se construye vía
 * `String.fromCharCode` en vez de un literal `\uXXXX` en el regex — evita
 * que un editor/herramienta que no preserve bytes exactos corrompa el
 * carácter combinante embebido directamente en el código fuente.
 */

const COMBINING_MARKS_RE = new RegExp(
  `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
  'g',
);

export function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(COMBINING_MARKS_RE, '')
    .toLowerCase()
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

/**
 * ¿`text` contiene `keyword` tolerando hasta `maxDistance` errores de dedo,
 * ignorando acentos? Keywords ≤3 chars se comparan por igualdad exacta de
 * palabra completa (evita que "si"≈"no" o similares con distance=1).
 */
export function fuzzyIncludes(text: string, keyword: string, maxDistance = 1): boolean {
  const normText = normalizeText(text);
  const normKw = normalizeText(keyword);
  if (normKw.length === 0) return false;

  if (normText.includes(normKw)) return true;
  if (normKw.length <= 3) return false;

  const words = normText.split(/\s+/);
  const kwWords = normKw.split(/\s+/);

  if (kwWords.length > 1) {
    for (let i = 0; i <= words.length - kwWords.length; i++) {
      const window = words.slice(i, i + kwWords.length).join(' ');
      if (levenshtein(window, normKw) <= maxDistance) return true;
    }
    return false;
  }

  return words.some((w) => levenshtein(w, normKw) <= maxDistance);
}
