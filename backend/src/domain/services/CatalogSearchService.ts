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
export class CatalogSearchService {
  constructor(private readonly posProducts: PosProductRepository) {}

  async search(
    tenantId: string,
    rawMessage: string,
    synonyms: CatalogSynonyms = {},
  ): Promise<PosProduct | null> {
    for (const term of this.extractSearchTerms(rawMessage, synonyms)) {
      const results = await this.posProducts.search(tenantId, term, 1);
      if (results.length > 0) return results[0];
    }
    return null;
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
