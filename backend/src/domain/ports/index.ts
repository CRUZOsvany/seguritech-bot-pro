import { User, TenantConfig, Message, ServiceDirectoryEntry } from '../entities';

/**
 * Puerto para persistencia de usuario.
 * IMPORTANTE: Todos los métodos aceptan tenantId para garantizar aislamiento.
 */
export interface UserRepository {
  save(user: User): Promise<void>;
  findById(tenantId: string, id: string): Promise<User | null>;
  findByPhoneNumber(tenantId: string, phoneNumber: string): Promise<User | null>;
  update(user: User): Promise<void>;
  resetUserState(tenantId: string, phoneNumber: string): Promise<void>;
  /** Establece o limpia el handoff humano. pausedUntil=null reactiva el bot. */
  setHumanHandoff(tenantId: string, phoneNumber: string, pausedUntil: Date | null): Promise<void>;
  /**
   * Usuarios actualmente en pausa por handoff humano (human_paused_until en
   * el futuro), del más próximo a expirar al más lejano. P4 la usa para
   * resolver a quién reanuda `#listo` del dueño; P8 (bandeja de escalaciones)
   * la reutiliza tal cual.
   */
  listPaused(tenantId: string): Promise<User[]>;
  /**
   * Registra el timestamp del último mensaje entrante del cliente (Bloque
   * 2.1, ventana de servicio 24h de Meta). Se llama en CADA mensaje que
   * llega, sea o no de opt-out — es la única fuente de verdad para decidir
   * si un envío futuro está dentro de la ventana de texto libre.
   */
  touchLastInbound(tenantId: string, phoneNumber: string, at: Date): Promise<void>;
  /**
   * Establece o limpia el opt-out real (Bloque 2.2). optedOutAt=null
   * reactiva al usuario (opt-in implícito al volver a escribir).
   */
  setOptOut(tenantId: string, phoneNumber: string, optedOutAt: Date | null): Promise<void>;
}

/**
 * Puerto mínimo de auditoría para acciones que se disparan SIN sesión admin
 * (p.ej. el dueño reanudando un handoff por WhatsApp, P4). Evita que
 * BotController (app/) dependa directo de AuditLogService (infrastructure/):
 * Bootstrap.ts es quien adapta AuditLogService a este puerto al armar el
 * ApplicationContainer.
 */
export interface AuditPort {
  log(event: {
    /** Quién disparó la acción, para dejar rastro aunque no sea un admin. */
    actorLabel: string;
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  }): void;
}

/**
 * Clasifica si un mensaje debe resolverse por flow determinista, por el
 * orquestador IA, o por escalamiento directo a humano (plan Secretaria
 * Digital, Fase 1.2 — ver .claude/SEGURITECH_AI_SECRETARIA_PLAN.md §3.2).
 *
 * Debe responder rápido (objetivo <300ms) y barato — usar un modelo pequeño
 * (Haiku), nunca el mismo modelo que usa el orquestador para razonar.
 *
 * Guardrail (plan §4): timeout corto obligatorio (2-3s). Si el modelo falla
 * o expira, la implementación debe devolver 'flow' — nunca dejar al bot sin
 * responder. `classify` en sí NUNCA lanza por un fallo del modelo.
 */
export interface IntentRouterPort {
  classify(input: {
    message: Message;
    user: User;
    tenantConfig: TenantConfig;
  }): Promise<'flow' | 'agent' | 'human'>;
}

/**
 * Puerto para persistencia de productos
 */
export interface ProductRepository {
  findAll(tenantId: string): Promise<any[]>;
  findById(tenantId: string, id: string): Promise<any | null>;
}

/**
 * Puerto para persistencia de pedidos
 */
export interface OrderRepository {
  save(order: any): Promise<void>;
  findByUserId(tenantId: string, userId: string): Promise<any[]>;
}

/**
 * Puerto para envío de mensajes al usuario final.
 *
 * BREAKING CHANGE (Sprint C): todas las firmas reciben tenantId como primer
 * argumento. El adapter resuelve credenciales internamente.
 *
 * Sprint D: agregados sendList, sendLocation, sendDocument para paridad
 * total con Meta Cloud API v21.0.
 */
export interface NotificationPort {
  sendMessage(
    tenantId: string,
    phoneNumber: string,
    message: string,
  ): Promise<void>;

  sendButtons(
    tenantId: string,
    phoneNumber: string,
    message: string,
    buttons: string[],
  ): Promise<void>;

  sendImage(
    tenantId: string,
    phoneNumber: string,
    imageUrl: string,
    caption?: string,
  ): Promise<void>;

  /**
   * Envía un mensaje interactivo tipo lista (modal de opciones).
   * Cada sección debe tener al menos 1 item; total <= 10 rows; <= 10 sections.
   */
  sendList(
    tenantId: string,
    phoneNumber: string,
    bodyText: string,
    buttonLabel: string,
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>,
  ): Promise<void>;

  /**
   * Envía un pin de ubicación geográfica.
   */
  sendLocation(
    tenantId: string,
    phoneNumber: string,
    latitude: number,
    longitude: number,
    name?: string,
    address?: string,
  ): Promise<void>;

  /**
   * Envía un documento (PDF, etc.) por URL.
   */
  sendDocument(
    tenantId: string,
    phoneNumber: string,
    documentUrl: string,
    filename: string,
    caption?: string,
  ): Promise<void>;

  /**
   * Envía un botón CTA (Call-to-Action) que abre una URL externa.
   * Canal: WhatsApp. Mapea a interactive type "cta_url" (Meta v23.0).
   *
   * header es opcional. Si se omite, Meta no incluye header en el mensaje.
   */
  sendCtaUrl(
    tenantId: string,
    phoneNumber: string,
    body: string,
    button: { display_text: string; url: string },
    opts?: {
      header?: { type: 'text'; text: string } | { type: 'image' | 'video' | 'document'; link: string };
      footer?: string;
    },
  ): Promise<void>;

  /**
   * Envía un mensaje con botón "Enviar ubicación".
   * El cliente responde con un mensaje location que llega al webhook.
   * Canal: WhatsApp. Mapea a interactive type "location_request_message".
   */
  sendLocationRequest(
    tenantId: string,
    phoneNumber: string,
    body: string,
  ): Promise<void>;

  /**
   * Envía un carrusel horizontal de 1-10 cards.
   * Cada card tiene header media (image|video) + body + 1-2 botones.
   * Todas las cards DEBEN usar el mismo tipo de botón (validado en flowSchema).
   * Canal: WhatsApp. Mapea a interactive type "media_carousel".
   */
  sendMediaCarousel(
    tenantId: string,
    phoneNumber: string,
    body: string,
    cards: Array<{
      header: { type: 'image' | 'video'; link: string };
      body: string;
      buttons: Array<
        | { type: 'quick_reply'; id: string; title: string }
        | { type: 'cta_url'; display_text: string; url: string }
      >;
    }>,
  ): Promise<void>;

  /**
   * Envía una reacción emoji al último mensaje del cliente.
   * emoji="" deshace la reacción anterior.
   * Canal: WhatsApp. Mapea a message type "reaction".
   */
  sendReaction(
    tenantId: string,
    phoneNumber: string,
    messageId: string,
    emoji: string,
  ): Promise<void>;

  /**
   * Solicita permiso al cliente para iniciar una llamada de WhatsApp.
   * Canal: WhatsApp. Mapea a interactive type "call_permission_request".
   */
  sendCallPermissionRequest(
    tenantId: string,
    phoneNumber: string,
    body: string,
    footer?: string,
  ): Promise<void>;

  /**
   * Lanza un WhatsApp Flow (formulario multipantalla) publicado en Meta.
   * flow_id_meta es el ID interno de Meta (obtenido de Meta Business Manager).
   * Canal: WhatsApp. Mapea a interactive type "flow".
   */
  sendWhatsappFlow(
    tenantId: string,
    phoneNumber: string,
    body: string,
    flow_id_meta: string,
    flow_cta: string,
    opts?: {
      header?: string;
      footer?: string;
      mode?: 'draft' | 'published';
      flow_action?: 'navigate' | 'data_exchange';
      flow_action_payload?: { screen?: string; data?: Record<string, unknown> };
    },
  ): Promise<void>;
}

/**
 * Puerto para cargar configuración por tenant.
 * El adapter de infraestructura (SupabaseTenantConfigService) implementa caché.
 */
export interface TenantConfigPort {
  getConfig(tenantId: string): Promise<TenantConfig | null>;
  invalidate(tenantId: string): void;
}

/**
 * Puerto: CRUD del directorio de servicios de un tenant (Capa 2). `tenantId`
 * siempre primero, sin excepción — mismo patrón que el resto de los
 * repositorios. Mapeo BD: tenant_service_directory (migración 020).
 */
export interface ServiceDirectoryRepository {
  listByTenant(
    tenantId: string,
    opts?: { onlyActive?: boolean },
  ): Promise<ServiceDirectoryEntry[]>;
  create(
    tenantId: string,
    entry: Omit<ServiceDirectoryEntry, 'id' | 'tenantId'>,
  ): Promise<ServiceDirectoryEntry>;
  update(
    tenantId: string,
    id: string,
    patch: Partial<Omit<ServiceDirectoryEntry, 'id' | 'tenantId'>>,
  ): Promise<ServiceDirectoryEntry>;
  delete(tenantId: string, id: string): Promise<void>;
}

/**
 * Puerto para carga y persistencia de flujos conversacionales por tenant.
 * Re-exportado desde BotFlowRepository.ts para mantener un solo punto de entrada.
 */
export { BotFlowRepository } from './BotFlowRepository';

/**
 * Puerto para operaciones CRUD de tenants (administración interna).
 */
export {
  TenantRepository,
  TenantSummary,
  TenantDetail,
  CreateTenantInput,
  UpdateTenantInput,
  TenantGiro,
  TenantStatus,
} from './TenantRepository';

/**
 * Puerto para la capa modular de servicios (whatsapp_bot, messenger_bot, pos).
 */
export {
  TenantServiceRepository,
  TenantService,
  ServiceType,
  ServiceStatus,
} from './TenantServiceRepository';

export {
  MetaCredentialsRepository,
  MetaCredentials,
  UpsertMetaCredentialsInput,
} from './MetaCredentialsRepository';

/**
 * Puerto de solo-lectura para tail de mensajes desde el panel admin.
 */
export { MessagesRepository, MessageRow } from './MessagesRepository';

/**
 * Puertos de autenticación admin (Operación Búnker v2 — Sprint F).
 */
export { AdminUsersRepository, AdminUser, AdminRole } from './AdminUsersRepository';
export { AdminSessionsRepository } from './AdminSessionsRepository';
export { LoginAttemptsRepository } from './LoginAttemptsRepository';

/**
 * Puertos del módulo POS (Sprint 5.1a).
 * Re-exportados desde pos/ subbarrel para mantener separación visual.
 */
export type {
  PosProductRepository,
  PosProductListOptions,
  PosCategoryRepository,
  PosTenantConfigRepository,
  PosUserRepository,
  InvoicingPort,
  InvoicingRequest,
  InvoicingResult,
} from './pos';

/**
 * Puerto de persistencia para WhatsApp Flows (formularios multipantalla de Meta).
 */
export type {
  WhatsAppFlowRepository,
} from './WhatsAppFlowRepository';