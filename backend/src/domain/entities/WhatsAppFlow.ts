/**
 * Entidad de dominio: WhatsApp Flow (formulario multipantalla de Meta).
 *
 * Un WhatsApp Flow es un formulario interactivo publicado en Meta Business
 * Manager. Se referencia desde nodos `send_whatsapp_flow` en el bot, que
 * usan `whatsapp_flow_id` (UUID interno de esta tabla) para identificarlo.
 *
 * El `flow_id_meta` es el ID externo de Meta — se obtiene manualmente desde
 * el panel de Meta Business Manager y se registra aquí.
 */

export type WhatsAppFlowStatus = 'draft' | 'active' | 'archived';

export interface WhatsAppFlow {
  id: string;                          // UUID interno (PK de la tabla)
  tenantId: string;
  name: string;                        // Nombre descriptivo para el panel (max 120 chars)
  flowIdMeta: string | null;           // ID externo de Meta Business Manager
  flowJson: Record<string, unknown> | null;  // JSON del formulario (nullable en V1)
  status: WhatsAppFlowStatus;
  createdBy: string | null;            // UUID del admin_user que lo creó
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input para crear un WhatsApp Flow desde el panel admin.
 * flowIdMeta y flowJson son opcionales: se pueden añadir después de crear el registro.
 */
export interface CreateWhatsAppFlowInput {
  tenantId: string;
  name: string;
  flowIdMeta?: string;
  flowJson?: Record<string, unknown>;
  createdBy?: string | null;
}

/**
 * Input para actualizar un WhatsApp Flow existente.
 * Todos los campos son opcionales — PATCH semántico.
 */
export interface UpdateWhatsAppFlowInput {
  name?: string;
  flowIdMeta?: string | null;
  flowJson?: Record<string, unknown> | null;
  status?: WhatsAppFlowStatus;
}

/**
 * Resumen para listados (panel admin). Sin flowJson para no inflar la respuesta.
 */
export interface WhatsAppFlowSummary {
  id: string;
  tenantId: string;
  name: string;
  flowIdMeta: string | null;
  status: WhatsAppFlowStatus;
  createdAt: Date;
  updatedAt: Date;
}
