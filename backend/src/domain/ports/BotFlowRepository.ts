import type { BotFlow } from '@/domain/entities/flow';

/**
 * Puerto para persistencia de flows configurables por tenant.
 *
 * Implementación de runtime: SupabaseBotFlowRepository.
 * Implementación de tests: in-memory fake a definir en Sprint 4
 * cuando FlowInterpreter sea cableado al BotController.
 */
export interface BotFlowRepository {
  /**
   * Devuelve el flow activo del tenant, o null si no hay ninguno.
   * El caller debe decidir auto-clonar desde un template si es null.
   */
  findActiveByTenant(tenantId: string): Promise<BotFlow | null>;

  /**
   * Clona un template (por slug) hacia un nuevo bot_flow del tenant.
   * Marca el nuevo flow como is_active = true.
   * Si ya existe un flow activo, lanza error (el caller debe decidir desactivarlo primero).
   */
  cloneFromTemplate(tenantId: string, templateSlug: string): Promise<BotFlow>;

  /**
   * Persiste un flow nuevo o lo actualiza si ya existe (por id).
   * Valida con Zod antes de tocar la BD. Lanza FlowValidationError si falla.
   */
  upsert(params: {
    id?: string;
    tenantId: string;
    nombre: string;
    flow: BotFlow;
    sourceTemplateId?: string | null;
  }): Promise<{ id: string }>;

  /**
   * Desactiva todos los bot_flows activos de un tenant (is_active = false).
   * Llamar ANTES de cloneFromTemplate() para evitar el error de flow duplicado.
   */
  deactivateForTenant(tenantId: string): Promise<void>;

  /**
   * Lista todos los flow_templates disponibles para asignar a tenants.
   * Ordenados por giro para facilitar el selector en el panel.
   */
  listTemplates(): Promise<Array<{
    slug: string;
    giro: string;
    nombre: string;
    descripcion: string | null;
  }>>;

  // ==========================================================================
  // Bloque A1 — draft / publish / rollback (versionado activo)
  // ==========================================================================

  /**
   * Lista los flows del tenant para que el panel resuelva flowId.
   * `hasDraft` = el flow tiene un draft_json no nulo pendiente de publicar.
   */
  listFlowsByTenant(tenantId: string): Promise<Array<{
    id: string;
    channel: BotFlowChannel;
    nombre: string;
    isActive: boolean;
    hasDraft: boolean;
    updatedAt: string;
  }>>;

  /**
   * Devuelve el draft_json crudo de un flow (puede estar incompleto/ inválido),
   * o null si no hay draft. NO valida contra FlowSchema.
   */
  getDraft(flowId: string, tenantId: string): Promise<unknown | null>;

  /**
   * Solo el timestamp de `draft_updated_at`, sin el contenido (P7). Separado
   * de `getDraft()` a propósito: `getDraft()` lo usa también
   * `SimulateMessageUseCase` (source='draft'), que espera el flow crudo, no
   * un wrapper — no se le puede cambiar el shape sin romper ese caller.
   * `null` si el flow no existe; `{ draftUpdatedAt: null }` si existe pero
   * nunca tuvo un draft guardado.
   */
  getDraftMeta(
    flowId: string,
    tenantId: string,
  ): Promise<{ draftUpdatedAt: string | null } | null>;

  /**
   * Guarda (pisa) el draft del flow. NO valida: el borrador puede ser parcial
   * mientras el operador edita en el Designer.
   *
   * Concurrencia optimista (P7): si `expectedDraftUpdatedAt` viene definido
   * (incluyendo `null`, que significa "esperaba que todavía no hubiera
   * draft"), el UPDATE solo aplica si el `draft_updated_at` actual coincide
   * exactamente — si no, no escribe nada y devuelve `conflict: true`. Si el
   * parámetro se omite (el Designer no lo manda), el comportamiento es el de
   * siempre: sobrescribe sin condición.
   */
  saveDraft(params: {
    flowId: string;
    tenantId: string;
    flow: unknown;
    expectedDraftUpdatedAt?: string | null;
  }): Promise<{ conflict: true } | { conflict: false; draftUpdatedAt: string }>;

  /**
   * Publica el draft: valida con FlowSchema (lanza FlowValidationError si falla),
   * inserta una fila en bot_flow_versions (version_number = max+1), copia el flow
   * a json_definition, marca is_active=true (desactivando otros flows del mismo
   * channel) y limpia el draft. Devuelve el version_number creado.
   */
  publishDraft(params: {
    flowId: string;
    tenantId: string;
    createdBy: string | null;
    note?: string;
  }): Promise<{ versionNumber: number }>;

  /**
   * Historial de versiones publicadas de un flow, más nueva primero.
   */
  listVersions(flowId: string, tenantId: string): Promise<Array<{
    id: string;
    versionNumber: number;
    createdAt: string;
    createdBy: string | null;
    note: string | null;
  }>>;

  /**
   * Devuelve el flow_json de una versión publicada por su id (uuid), o null si
   * no existe o no pertenece al tenant.
   */
  getVersionFlow(versionId: string, tenantId: string): Promise<BotFlow | null>;

  /**
   * Rollback inmutable: toma el flow_json de una versión histórica y lo publica
   * como una versión NUEVA (version_number = max+1), activándola. No muta el
   * historial. Devuelve el version_number nuevo.
   */
  rollback(params: {
    flowId: string;
    tenantId: string;
    versionNumber: number;
    createdBy: string | null;
  }): Promise<{ versionNumber: number }>;
}

/** Canal de un flow (espejo de bot_flows.channel, mig 013). */
export type BotFlowChannel = 'whatsapp' | 'messenger';