import type { CatalogSynonyms } from '@/domain/services/CatalogSearchService';

/**
 * Alias léxico → término canónico, papelería (§3.2 / §2.1 del plan V1 —
 * PLAN_V1_BOT_FLOWS_SIN_IA.md). Cierra el gap real encontrado en la auditoría
 * de 2026-08-24: `CatalogSearchService.search()` acepta `synonyms` desde que
 * se escribió (§2.1), pero `FlowInterpreter` nunca se lo pasaba — un cliente
 * escribiendo "libreta" nunca encontraba un producto llamado "Cuaderno...".
 * Ver `.claude/PROMPT_DEMO_PAPELERIA_STRESS_TEST.md` Fase 5.
 *
 * Solo mapea a un término que SÍ existe como palabra en algún `name` real
 * del catálogo (ver `papeleria_demo_inventario_completo.csv` en la raíz del
 * repo) — un sinónimo que apunta a nada no sirve de nada.
 */
export const PAPELERIA_SYNONYMS: CatalogSynonyms = {
  libreta: 'cuaderno',
  boligrafo: 'pluma',
  bolígrafo: 'pluma',
  marcador: 'plumon',
  plumon: 'plumón',
  borrador: 'goma',
  tajador: 'sacapuntas',
  afilador: 'sacapuntas',
  folder: 'folder',
  carpeta: 'carpeta',
  copias: 'fotocopia',
  impresiones: 'impresión',
  mochilas: 'mochila',
  calculadora: 'calculadora',
};
