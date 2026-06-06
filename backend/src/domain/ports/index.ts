import { User, TenantConfig } from '../entities';

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