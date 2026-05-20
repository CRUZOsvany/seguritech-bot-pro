/**
 * Resumen de un tenant para el panel de administración.
 * Incluye has_active_flow (calculado desde bot_flows) para mostrar estado de molde.
 */
export interface TenantSummary {
  id: string;
  nombre_negocio: string;
  giro: string;
  status: string;
  webhook_verified: boolean;
  has_active_flow: boolean;
}

/**
 * Detalle completo de un tenant para la vista de edición del panel admin.
 * Incluye bot_configuration, meta_credentials (sin token descifrado) y flow activo.
 */
export interface TenantDetail extends TenantSummary {
  direccion: string | null;
  horario_semana: string | null;
  horario_sabado: string | null;
  abre_domingo: boolean;
  bot_configuration: {
    numero_whatsapp_asignado: string;
    nombre_bot: string;
    tono_bot: string;
    mensaje_bienvenida: string | null;
    mensaje_menu_principal: string | null;
    mensaje_fuera_horario: string | null;
    mensaje_no_entendio: string | null;
    mensaje_confirmacion_pedido: string | null;
  } | null;
  meta_credentials: {
    phone_number_id: string;
    waba_id: string;
    display_phone_number: string;
    is_active: boolean;
    rotated_at: string | null;
  } | null;
  active_flow: {
    id: string;
    nombre: string;
    source_template_id: string | null;
    updated_at: string;
  } | null;
  created_at: string;
  updated_at: string;
}

export type TenantGiro =
  | 'ferreteria'
  | 'papeleria'
  | 'cerrajeria'
  | 'pizzeria'
  | 'salon'
  | 'medico'
  | 'refaccionaria'
  | 'farmacia'
  | 'otro';

/**
 * Input para crear un tenant en una sola llamada atómica.
 * bot_configuration se crea SIEMPRE; el flow se asigna si template_slug viene.
 */
export interface CreateTenantInput {
  nombre_negocio: string;
  giro: TenantGiro;
  direccion?: string;
  horario_semana?: string;
  horario_sabado?: string;
  abre_domingo?: boolean;
  bot_configuration: {
    numero_whatsapp_asignado: string;
    nombre_bot?: string;
    tono_bot?: 'formal' | 'amigable' | 'directo';
    mensaje_bienvenida?: string;
    mensaje_menu_principal?: string;
    mensaje_fuera_horario?: string;
    mensaje_no_entendio?: string;
    mensaje_confirmacion_pedido?: string;
  };
  /** Si viene, clona ese template como flow inicial activo. Si no, no se asigna molde. */
  template_slug?: string;
}

/**
 * Update parcial. Campos `nullable` permiten "borrar" un valor explícitamente
 * pasando null; undefined deja el valor sin cambios.
 */
export interface UpdateTenantInput {
  nombre_negocio?: string;
  giro?: TenantGiro;
  direccion?: string | null;
  horario_semana?: string | null;
  horario_sabado?: string | null;
  abre_domingo?: boolean;
  bot_configuration?: Partial<CreateTenantInput['bot_configuration']>;
}

/**
 * Puerto para operaciones de administración de tenants.
 * Solo usado por el panel interno de SegurITech — no expuesto al cliente final.
 *
 * Todas las queries de lectura filtran por deleted_at IS NULL.
 */
export interface TenantRepository {
  findAll(): Promise<TenantSummary[]>;
  findById(id: string): Promise<TenantSummary | null>;
  findFullDetail(id: string): Promise<TenantDetail | null>;
  setStatus(id: string, status: 'active' | 'paused'): Promise<void>;

  /**
   * Crea atómicamente tenant + bot_configuration + (opcional) bot_flow desde template.
   * Rollback manual vía cascade: si falla cualquier paso posterior al insert del tenant,
   * borra el tenant (FKs ON DELETE CASCADE limpian bot_configurations y bot_flows).
   */
  createAtomic(input: CreateTenantInput): Promise<string>;

  /**
   * Update parcial. Si bot_configuration está presente, hace update en esa tabla.
   * No invalida caché del TenantConfigPort; el TTL lo refresca.
   */
  update(id: string, input: UpdateTenantInput): Promise<void>;

  /**
   * Soft-delete: setea deleted_at = now() y status = 'paused'.
   * NO toca bot_flows ni messages (histórico recuperable).
   */
  softDelete(id: string): Promise<void>;

  /**
   * Verifica si un módulo está habilitado en el tenant (Sprint 5.1a).
   * Lee `tenants.enabled_modules TEXT[]` (migración 011). Soft-deleted = false.
   *
   * Usado por:
   *   - moduleGuard middleware (POS routes)
   *   - PosAuthService (pre-flight antes de login)
   */
  isModuleEnabled(id: string, module: 'pos' | 'bot'): Promise<boolean>;
}
