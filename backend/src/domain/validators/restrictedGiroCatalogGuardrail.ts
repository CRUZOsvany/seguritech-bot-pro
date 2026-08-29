import type { BotFlow } from '@/domain/entities/flow';
import { normalizeText } from '@/domain/services/textMatch';

/**
 * DEC-12 (auditoría 2026-08-26, hallazgo C-2.4): médico y farmacia son
 * "rubros restringidos" para el comercio de WhatsApp Business — Meta puede
 * marcar/banear un número que venda medicamento con receta o dé lenguaje de
 * diagnóstico. El owner decidió OFRECER el servicio a esos giros ahora
 * (no pausarlos), con este guardrail técnico como condición.
 *
 * Alcance real de este guardrail (el "ticket mínimo" de la auditoría, no
 * más): bloquea publicar un flow para un tenant de giro medico/farmacia SI
 * el flow expone `catalog_items` (send_list con items_source:
 * 'catalog_items') Y la categoría de al menos un producto del catálogo del
 * tenant matchea el blocklist de abajo. No intenta detectar "lenguaje de
 * diagnóstico" en texto libre — un filtro de palabras sobre prosa humana da
 * falsos positivos/negativos constantes y generaría falsa confianza sobre
 * un riesgo regulatorio real. Ese control queda como revisión humana
 * obligatoria del molde antes de publicar (documentado, no automatizado).
 *
 * El blocklist es un punto de partida razonable (categorías estándar de
 * regulación farmacéutica en México, tipo COFEPRIS), NO una lista exhaustiva
 * validada por un experto en cumplimiento — revisar con criterio legal antes
 * de dar de alta el primer tenant real de estos dos giros.
 */

export const RESTRICTED_GIROS = ['medico', 'farmacia'] as const;
export type RestrictedGiro = (typeof RESTRICTED_GIROS)[number];

export function isRestrictedGiro(giro: string | null | undefined): giro is RestrictedGiro {
  return (RESTRICTED_GIROS as readonly string[]).includes(giro ?? '');
}

/** Substrings normalizados (sin acento, minúsculas) — match por "incluye", no exacto. */
const RESTRICTED_CATEGORY_KEYWORDS = [
  'receta',
  'controlado',
  'antibiotico',
  'psicotropico',
  'estupefaciente',
  'narcotico',
  'antidepresivo',
  'ansiolitico',
  'benzodiacepina',
  'opioide',
  'quimioterapia',
  'anticonceptivo inyectable',
] as const;

export class RestrictedGiroGuardrailError extends Error {
  constructor(
    message: string,
    public readonly offendingCategories: string[],
  ) {
    super(message);
    this.name = 'RestrictedGiroGuardrailError';
  }
}

/** true si el flow tiene al menos un nodo send_list con una sección dinámica de catalog_items. */
export function flowExposesCatalogItems(flow: BotFlow): boolean {
  return flow.nodes.some(
    (node) =>
      node.type === 'send_list' &&
      node.content.sections.some(
        (section) => section.type === 'dynamic' && section.items_source === 'catalog_items',
      ),
  );
}

/**
 * Lanza RestrictedGiroGuardrailError si el flow no debe publicarse tal cual
 * para este giro/catálogo. No hace nada (no-op) para giros no restringidos,
 * o si el flow no expone catalog_items, o si ninguna categoría matchea.
 */
export function assertRestrictedGiroCatalogGuardrail(
  flow: BotFlow,
  giro: string | null | undefined,
  catalogCategories: string[],
): void {
  if (!isRestrictedGiro(giro)) return;
  if (!flowExposesCatalogItems(flow)) return;

  const offending = catalogCategories.filter((category) => {
    const normalized = normalizeText(category);
    return RESTRICTED_CATEGORY_KEYWORDS.some((kw) => normalized.includes(kw));
  });

  if (offending.length > 0) {
    throw new RestrictedGiroGuardrailError(
      `No se puede publicar: el catálogo de este tenant (giro "${giro}") tiene ` +
        `categorías restringidas (${offending.join(', ')}) y el flow las expone vía ` +
        'send_list. Meta prohíbe cotizar/vender medicamento controlado o con receta ' +
        'por WhatsApp Business. Quita esos productos del catálogo o el nodo que los ' +
        'expone antes de publicar.',
      offending,
    );
  }
}
