/**
 * Tipos compartidos para el panel de control y comunicación con el backend
 */

// ===== ROL Y AUTENTICACIÓN =====
export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  ADMIN_OPERATOR = 'admin_operator',
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId?: string; // Para admin_operator
  createdAt: Date;
}

export interface Session {
  user: AuthUser;
  expires: string;
}

// ===== TENANT Y CLIENTE =====
export interface Tenant {
  id: string; // UUID generado automáticamente
  nombre_negocio: string;
  giro: BusinessType;
  direccion: string;
  horario_semana: string;
  horario_sabado: string;
  abre_domingo: boolean;
  createdAt: Date;
  updatedAt: Date;
  status: TenantStatus;
}

export enum TenantStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  UNCONFIGURED = 'unconfigured',
}

export enum BusinessType {
  FERRETERIA = 'ferreteria',
  PAPELERIA = 'papeleria',
  CERRAJERIA = 'cerrajeria',
  PIZZERIA = 'pizzeria',
  SALON = 'salon',
  MEDICO = 'medico',
  REFACCIONARIA = 'refaccionaria',
  FARMACIA = 'farmacia',
  OTRO = 'otro',
}

// ===== DATOS DEL DUEÑO =====
export interface OwnerData {
  id: string;
  tenantId: string;
  nombre_dueno: string;
  whatsapp_dueno: string;
  monto_mensual: number;
  fecha_proximo_pago: Date;
  notas_internas: string;
  createdAt: Date;
  updatedAt: Date;
}

// ===== CONFIGURACIÓN DEL BOT =====
export interface BotConfiguration {
  id: string;
  tenantId: string;
  numero_whatsapp_asignado: string;
  nombre_bot: string;
  tono_bot: BotTone;
  mensaje_bienvenida: string;
  mensaje_menu_principal: string;
  mensaje_fuera_horario: string;
  mensaje_no_entendio: string;
  mensaje_confirmacion_pedido: string;
  createdAt: Date;
  updatedAt: Date;
}

export enum BotTone {
  FORMAL = 'formal',
  AMIGABLE = 'amigable',
  DIRECTO = 'directo',
}

// ===== CATÁLOGO DE PRODUCTOS =====
export interface CatalogItem {
  id: string;
  tenantId: string;
  nombre_producto: string;
  descripcion: string;
  precio: number;
  categoria: string;
  disponible: boolean;
  imagen_url?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CatalogUpload {
  id: string;
  tenantId: string;
  arquivo_url: string;
  tipo_upload: 'pdf' | 'manual';
  items_procesados: number;
  createdAt: Date;
}

// ===== ALERTAS DE SERVICIO URGENTE =====
export interface UrgentServiceConfig {
  id: string;
  tenantId: string;
  tiene_servicio_urgente: boolean;
  whatsapp_alertas_urgentes: string;
  mensaje_alerta_admin: string;
  tiempo_respuesta_prometido: string;
  createdAt: Date;
  updatedAt: Date;
}

// ===== MENSAJES Y ESTADÍSTICAS =====
export interface MessageRecord {
  id: string;
  tenantId: string;
  from: string;
  content: string;
  timestamp: Date;
  processed: boolean;
}

export interface BotMetrics {
  tenantId: string;
  messages_this_month: number;
  messages_all_time: number;
  active_users: number;
  conversion_rate: number;
  last_updated: Date;
}

// ===== FORMAS/PAYLOADS DE API =====
export interface CreateClientPayload {
  // Sección 1: Datos negocio
  nombre_negocio: string;
  giro: BusinessType;
  direccion: string;
  horario_semana: string;
  horario_sabado: string;
  abre_domingo: boolean;

  // Sección 2: Datos dueño (solo admin ve)
  nombre_dueno: string;
  whatsapp_dueno: string;
  monto_mensual: number;
  fecha_proximo_pago: Date;
  notas_internas: string;

  // Sección 3: Config bot
  numero_whatsapp_asignado: string;
  nombre_bot: string;
  tono_bot: BotTone;
  mensaje_bienvenida: string;
  mensaje_menu_principal: string;
  mensaje_fuera_horario: string;
  mensaje_no_entendio: string;
  mensaje_confirmacion_pedido: string;

  // Sección 5: Alertas urgentes
  tiene_servicio_urgente: boolean;
  whatsapp_alertas_urgentes?: string;
  mensaje_alerta_admin?: string;
  tiempo_respuesta_prometido?: string;
}

export interface UpdateClientPayload extends Partial<CreateClientPayload> {
  tenantId: string;
}

// ===== RESPUESTAS DE API =====
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
  status: 'success' | 'error';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

