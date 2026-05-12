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
}