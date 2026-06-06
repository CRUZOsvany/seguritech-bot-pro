import type {
  WhatsAppFlow,
  WhatsAppFlowSummary,
  CreateWhatsAppFlowInput,
  UpdateWhatsAppFlowInput,
} from '@/domain/entities/WhatsAppFlow';

/**
 * Puerto de persistencia para WhatsApp Flows.
 *
 * Todas las operaciones son scoped por tenant_id para garantizar aislamiento
 * multi-tenant. El backend usa service_role y filtra explícitamente por tenant_id
 * en cada query — RLS es defensa en profundidad, no la capa de control primaria.
 */
export interface WhatsAppFlowRepository {
  /**
   * Lista todos los flows de un tenant (resumen, sin flowJson).
   * Orden: updated_at DESC.
   */
  listByTenant(tenantId: string): Promise<WhatsAppFlowSummary[]>;

  /**
   * Carga un flow completo (con flowJson) por ID, verificando que pertenezca al tenant.
   * Devuelve null si no existe o si el tenant_id no coincide.
   */
  findById(id: string, tenantId: string): Promise<WhatsAppFlow | null>;

  /**
   * Crea un nuevo WhatsApp Flow para el tenant.
   * Devuelve el flow creado (con id y timestamps generados).
   */
  create(input: CreateWhatsAppFlowInput): Promise<WhatsAppFlow>;

  /**
   * Actualiza campos de un flow existente (PATCH semántico).
   * Solo los campos presentes en `input` se actualizan.
   * Devuelve el flow actualizado, o null si no existe / no pertenece al tenant.
   */
  update(id: string, tenantId: string, input: UpdateWhatsAppFlowInput): Promise<WhatsAppFlow | null>;

  /**
   * Elimina permanentemente un flow. Solo accesible por super_admin.
   * No hay soft-delete: el registro desaparece.
   * Devuelve true si se eliminó, false si no existía o no pertenecía al tenant.
   */
  delete(id: string, tenantId: string): Promise<boolean>;
}
