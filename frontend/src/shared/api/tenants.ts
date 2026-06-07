import { z } from 'zod';
import { apiFetch } from './client';

// ============================================================
// Catálogos compartidos
// ============================================================

export const GIRO_VALUES = [
  'ferreteria',
  'papeleria',
  'cerrajeria',
  'pizzeria',
  'salon',
  'medico',
  'refaccionaria',
  'farmacia',
  'otro',
] as const;

export const TONO_VALUES = ['formal', 'amigable', 'directo'] as const;

// ============================================================
// Lista de tenants (GET /api/admin/tenants)
// ============================================================

/**
 * Match exacto del shape que devuelve GET /api/admin/tenants en el backend.
 * Ver: backend/src/domain/ports/TenantRepository.ts → TenantSummary
 */
export interface TenantSummary {
  id: string;
  nombre_negocio: string;
  giro: string;
  status: TenantStatus;
  webhook_verified: boolean;
  has_active_flow: boolean;
  /**
   * Status operativo del servicio whatsapp_bot (lo que decide si el bot
   * responde, DEC-B). Distinto de `status` (FSM comercial del tenant).
   * null si el servicio no está habilitado.
   */
  whatsapp_status: ServiceStatus | null;
}

export type TenantStatus =
  | 'draft'
  | 'sandbox'
  | 'live'
  | 'paused'
  | 'archived';

interface ListTenantsResponse {
  tenants: TenantSummary[];
}

export async function listTenants(): Promise<TenantSummary[]> {
  const res = await apiFetch<ListTenantsResponse>('GET', '/api/admin/tenants');
  return res.tenants;
}

// ============================================================
// Crear tenant (POST /api/admin/tenants)
// ============================================================

/**
 * Sincronizado con CreateTenantSchema del backend
 * (backend/src/domain/use-cases/CreateTenantUseCase.ts).
 *
 * bot_configuration es .optional() desde FASE 2A: el tenant nace "pelado" y
 * el operador configura el bot cuando habilita el servicio whatsapp_bot.
 */
export const CreateTenantSchema = z.object({
  nombre_negocio: z.string().min(2, 'Mínimo 2 caracteres').max(120),
  giro: z.enum(GIRO_VALUES),
  direccion: z.string().max(300).optional(),
  horario_semana: z.string().max(120).optional(),
  horario_sabado: z.string().max(120).optional(),
  abre_domingo: z.boolean().optional(),
  bot_configuration: z
    .object({
      numero_whatsapp_asignado: z.string().min(8).max(20),
      nombre_bot: z.string().max(60).optional(),
      tono_bot: z.enum(TONO_VALUES).optional(),
      mensaje_bienvenida: z.string().max(1024).optional(),
    })
    .optional(),
  template_slug: z.string().max(80).optional(),
});

export type CreateTenantInput = z.infer<typeof CreateTenantSchema>;

interface CreateTenantResponse {
  id: string;
}

export async function createTenant(
  input: CreateTenantInput,
): Promise<CreateTenantResponse> {
  return apiFetch<CreateTenantResponse>('POST', '/api/admin/tenants', input);
}

// ============================================================
// Detalle de un tenant (GET /api/admin/tenants/:id/detail)
//
// El backend ya tenía `/tenants/:id/detail` que devuelve la forma completa via
// findFullDetail(). Apuntamos aquí en lugar de `/tenants/:id` (que devuelve
// TenantSummary sin direccion/horarios/timestamps) para no replicar lógica de
// proyección en el repo.
// ============================================================

export type TonoBot = 'formal' | 'amigable' | 'directo';

export interface BotConfiguration {
  numero_whatsapp_asignado: string;
  nombre_bot: string | null;
  tono_bot: TonoBot | null;
  mensaje_bienvenida: string | null;
  mensaje_menu_principal: string | null;
  mensaje_fuera_horario: string | null;
  mensaje_no_entendio: string | null;
  mensaje_confirmacion_pedido: string | null;
}

export interface MetaCredentialsInfo {
  phone_number_id: string;
  waba_id: string;
  display_phone_number: string;
  is_active: boolean;
  rotated_at: string | null;
}

export interface ActiveFlowInfo {
  id: string;
  nombre: string;
  source_template_id: string | null;
  updated_at: string;
}

export interface TenantDetail {
  id: string;
  nombre_negocio: string;
  giro: string;
  direccion: string | null;
  horario_semana: string | null;
  horario_sabado: string | null;
  abre_domingo: boolean;
  status: TenantStatus;
  webhook_verified: boolean;
  has_active_flow: boolean;
  bot_configuration: BotConfiguration | null;
  meta_credentials: MetaCredentialsInfo | null;
  active_flow: ActiveFlowInfo | null;
  created_at: string;
  updated_at: string;
}

interface GetTenantResponse {
  tenant: TenantDetail;
}

export async function getTenant(id: string): Promise<TenantDetail> {
  const res = await apiFetch<GetTenantResponse>(
    'GET',
    `/api/admin/tenants/${id}/detail`,
  );
  return res.tenant;
}

// ============================================================
// Servicios del tenant (espejo de TenantServiceRepository backend, FASE 1)
// ============================================================

export type ServiceType = 'whatsapp_bot' | 'messenger_bot' | 'pos';

export type ServiceStatus =
  | 'draft'
  | 'configuring'
  | 'active'
  | 'paused'
  | 'archived';

export interface TenantServiceItem {
  id: string;
  tenantId: string;
  serviceType: ServiceType;
  status: ServiceStatus;
  enabledAt: string | null;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface ListServicesResponse {
  services: TenantServiceItem[];
}

export async function listTenantServices(
  tenantId: string,
): Promise<TenantServiceItem[]> {
  const res = await apiFetch<ListServicesResponse>(
    'GET',
    `/api/admin/tenants/${tenantId}/services`,
  );
  return res.services;
}

interface EnableServiceResponse {
  service: TenantServiceItem;
}

export async function enableService(
  tenantId: string,
  serviceType: ServiceType,
): Promise<TenantServiceItem> {
  const res = await apiFetch<EnableServiceResponse>(
    'POST',
    `/api/admin/tenants/${tenantId}/services`,
    { serviceType },
  );
  return res.service;
}

export async function setServiceStatus(
  tenantId: string,
  serviceType: ServiceType,
  status: ServiceStatus,
): Promise<void> {
  await apiFetch<{ ok: boolean }>(
    'PATCH',
    `/api/admin/tenants/${tenantId}/services/${serviceType}`,
    { status },
  );
}

// ============================================================
// Config WhatsApp (Fase 2C)
// ============================================================

export interface BotConfigPatch {
  numero_whatsapp_asignado?: string;
  nombre_bot?: string;
  tono_bot?: TonoBot;
  mensaje_bienvenida?: string;
  mensaje_menu_principal?: string;
  mensaje_fuera_horario?: string;
  mensaje_no_entendio?: string;
  mensaje_confirmacion_pedido?: string;
}

export async function updateBotConfiguration(
  tenantId: string,
  bot_configuration: BotConfigPatch,
): Promise<void> {
  await apiFetch<{ ok: boolean }>('PATCH', `/api/admin/tenants/${tenantId}`, {
    bot_configuration,
  });
}

export interface Template {
  slug: string;
  giro: string;
  nombre: string;
  descripcion: string;
}

export async function listTemplates(): Promise<Template[]> {
  const res = await apiFetch<{ templates: Template[] }>(
    'GET',
    '/api/admin/templates',
  );
  return res.templates;
}

export async function assignMolde(
  tenantId: string,
  templateSlug: string,
): Promise<void> {
  await apiFetch('POST', `/api/admin/tenants/${tenantId}/molde`, {
    templateSlug,
  });
}

export async function removeMolde(tenantId: string): Promise<void> {
  await apiFetch('DELETE', `/api/admin/tenants/${tenantId}/molde`);
}

export interface MetaCredentialsInput {
  phoneNumberId: string;
  wabaId: string;
  displayPhoneNumber: string;
  accessToken: string;
}

export async function upsertMetaCredentials(
  tenantId: string,
  input: MetaCredentialsInput,
): Promise<{ rotatedAt: string }> {
  const res = await apiFetch<{ ok: boolean; rotatedAt: string }>(
    'POST',
    `/api/admin/tenants/${tenantId}/meta-credentials`,
    input,
  );
  return { rotatedAt: res.rotatedAt };
}

export async function revokeMetaCredentials(tenantId: string): Promise<void> {
  await apiFetch('DELETE', `/api/admin/tenants/${tenantId}/meta-credentials`);
}

// --- Simulador ---
// Espejo EXACTO de InterpreterOutput del backend
// (backend/src/domain/services/FlowInterpreter.ts) — 13 kinds.
export type InterpreterOutput =
  | { kind: 'text'; text: string }
  | { kind: 'buttons'; text: string; buttons: { id: string; title: string }[] }
  | {
      kind: 'list';
      text: string;
      buttonLabel: string;
      sections: Array<{
        title: string;
        items: { id: string; title: string; description?: string }[];
      }>;
    }
  | { kind: 'image'; url: string; caption?: string }
  | { kind: 'location'; latitude: number; longitude: number; name?: string; address?: string }
  | { kind: 'document'; url: string; filename: string; caption?: string }
  | { kind: 'escape_to_human'; userResponse: string; ownerAlert: string }
  // ── v23.0 ──
  | {
      kind: 'cta_url';
      body: string;
      button: { display_text: string; url: string };
      header?: { type: 'text'; text: string } | { type: 'image' | 'video' | 'document'; link: string };
      footer?: string;
    }
  | { kind: 'location_request'; body: string }
  | {
      kind: 'media_carousel';
      body: string;
      cards: Array<{
        header: { type: 'image' | 'video'; link: string };
        body: string;
        buttons: Array<
          | { type: 'quick_reply'; id: string; title: string }
          | { type: 'cta_url'; display_text: string; url: string }
        >;
      }>;
    }
  | { kind: 'reaction'; emoji: string; target: 'last_user_message' }
  | { kind: 'call_permission_request'; body: string; footer?: string }
  | {
      kind: 'whatsapp_flow';
      body: string;
      flow_id_meta: string;
      flow_cta: string;
      header?: string;
      footer?: string;
      mode: 'draft' | 'published';
      flow_action?: 'navigate' | 'data_exchange';
      flow_action_payload?: { screen?: string; data?: Record<string, unknown> };
    };

export interface SimulateResult {
  outputs: InterpreterOutput[];
  nextNodeId: string;
  context: Record<string, unknown>;
  flowEnded: boolean;
}

export async function simulate(
  tenantId: string,
  phoneNumber: string,
  content: string,
): Promise<SimulateResult> {
  return apiFetch<SimulateResult>('POST', '/api/admin/simulate', {
    tenantId,
    phoneNumber,
    content,
    persist: false,
  });
}

export async function simulateReset(
  tenantId: string,
  phoneNumber: string,
): Promise<void> {
  await apiFetch('POST', '/api/admin/simulate/reset', { tenantId, phoneNumber });
}
