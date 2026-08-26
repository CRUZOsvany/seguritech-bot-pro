import type { PosProductRepository } from '@/domain/ports/pos/PosProductRepository';
import type { PosProduct } from '@/domain/entities/pos/Product';
import { normalizeText } from '@/domain/services/textMatch';

/**
 * Palabras que no aportan nada a una búsqueda de producto — se descartan al
 * tokenizar la pregunta del cliente. Lista deliberadamente corta y orientada
 * a preguntas típicas ("¿tienen tornillos de 2 pulgadas?", "cuánto cuesta un
 * cuaderno") — un falso negativo aquí solo hace que la búsqueda pruebe con
 * la frase completa igual, nunca rompe el flow.
 */
const STOPWORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'de', 'del', 'al', 'y', 'o', 'en', 'con', 'para', 'por',
  'que', 'qué', 'tienen', 'tiene', 'hay', 'hacen', 'hacer',
  'venden', 'vende', 'busco', 'necesito', 'quiero', 'quisiera',
  'me', 'se', 'es', 'son', 'a', 'su', 'sus', 'mi', 'mis',
  'este', 'esta', 'estos', 'estas', 'favor', 'porfa', 'porfavor',
  'cuanto', 'cuánto', 'cuesta', 'cuestan', 'precio', 'ustedes',
]);

/** Alias léxico → término canónico a buscar. Ver domain/moulds (§3 del plan V1, por giro). */
export type CatalogSynonyms = Record<string, string>;

/**
 * Busca un producto real del catálogo (`pos_products`) a partir de una
 * pregunta en texto libre (§2.1 del plan V1 — `.claude/PLAN_V1_BOT_FLOWS_SIN_IA.md`).
 *
 * Decisión de fuente (§2.0 del plan): consulta `pos_products` — el inventario
 * completo y real — no `catalog_items` (reservada a las listas fijas de
 * `send_list`). Reutiliza `PosProductRepository.search()` (ya hardeneado
 * contra inyección del filtro `.or()` de PostgREST, ver
 * SupabasePosProductRepository.search.test.ts) en vez de construir un acceso
 * a datos nuevo — mismo repositorio que usa `PosRouter.ts`, invocado desde un
 * contexto distinto (el flow del bot).
 *
 * Estrategia: tokeniza el mensaje, descarta palabras vacías/cortas, y prueba
 * primero la frase completa normalizada y luego cada palabra significativa
 * (con su sinónimo canónico si el giro define uno) hasta encontrar un match.
 * Nunca inventa: sin match devuelve `null` — el flow decide (transición
 * `catalog_not_found`, típicamente a `escape_to_human`).
 *
 * El diccionario de sinónimos por giro (ferretería "desarmador"~"destornillador",
 * cerrajería "copia de llave"~"duplicado", papelería "libreta"~"cuaderno") es
 * Molde, no Core — se pasa opcionalmente por el caller cuando se construyan
 * los flows concretos (§3 del plan). Vacío por defecto: la búsqueda sigue
 * funcionando igual de bien sobre el nombre real del producto.
 */
/**
 * Cuántos candidatos se piden al repo por término antes de rankear. El repo
 * (`SupabasePosProductRepository.search()`) no tiene `.order()` — Postgres
 * regresa el orden que le convenga, no por relevancia — así que `limit=1`
 * (como era antes) equivalía a apostarle al primer row al azar. 8 alcanza de
 * sobra para desambiguar variantes de un mismo producto (ej. "100 hojas" vs
 * "200 hojas" vs "(Proveedor B)") sin pedir el catálogo completo.
 */
const SEARCH_CANDIDATES_LIMIT = 8;

export class CatalogSearchService {
  constructor(private readonly posProducts: PosProductRepository) {}

  async search(
    tenantId: string,
    rawMessage: string,
    synonyms: CatalogSynonyms = {},
  ): Promise<PosProduct | null> {
    for (const term of this.extractSearchTerms(rawMessage, synonyms)) {
      const results = await this.posProducts.search(tenantId, term, SEARCH_CANDIDATES_LIMIT);
      if (results.length === 1) return results[0];
      if (results.length > 1) return this.rankResults(term, results);
    }
    return null;
  }

  /**
   * Bug real del stress test de "Papelería DEMO" (Fase 7, caso #9): sin esto,
   * el primer row que devolviera el repo "ganaba" sin importar qué tan buen
   * match fuera — buscar "cuaderno profesional 100 hojas" podía devolver el
   * SKU de 200 hojas. Scoring simple, en 3 niveles (cada nivel solo desempata
   * si el anterior queda tablas):
   *   1. Match exacto de la frase completa normalizada contra el nombre.
   *   2. Cuenta de tokens del término presentes en el nombre (más = mejor).
   *   3. Diferencia de longitud entre término y nombre normalizado (menor = mejor —
   *      evita que "cuaderno" solo prefiera el nombre más largo/decorado).
   * Empate total → se conserva el orden que ya traía la respuesta del repo
   * (no se inventa un desempate nuevo).
   */
  private rankResults(term: string, results: PosProduct[]): PosProduct {
    const normTerm = normalizeText(term);
    const termTokens = normTerm.split(/[^a-z0-9]+/).filter((t) => t.length > 0);

    const scoreOf = (product: PosProduct) => {
      const normName = normalizeText(product.name);
      const exact = normName === normTerm ? 1 : 0;
      const tokenCount = termTokens.filter((t) => normName.includes(t)).length;
      const lengthDiff = Math.abs(normName.length - normTerm.length);
      return { exact, tokenCount, lengthDiff };
    };

    let best = results[0];
    let bestScore = scoreOf(best);
    for (let i = 1; i < results.length; i++) {
      const candidate = results[i];
      const candidateScore = scoreOf(candidate);
      const better =
        candidateScore.exact > bestScore.exact ||
        (candidateScore.exact === bestScore.exact &&
          candidateScore.tokenCount > bestScore.tokenCount) ||
        (candidateScore.exact === bestScore.exact &&
          candidateScore.tokenCount === bestScore.tokenCount &&
          candidateScore.lengthDiff < bestScore.lengthDiff);
      if (better) {
        best = candidate;
        bestScore = candidateScore;
      }
    }
    return best;
  }

  private extractSearchTerms(rawMessage: string, synonyms: CatalogSynonyms): string[] {
    const normalized = normalizeText(rawMessage);
    const terms = new Set<string>();
    if (normalized.length >= 3) terms.add(normalized);

    const words = normalized
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w));

    for (const word of words) {
      terms.add(word);
      const canonical = synonyms[word];
      if (canonical) terms.add(normalizeText(canonical));
    }
    return [...terms];
  }
}
