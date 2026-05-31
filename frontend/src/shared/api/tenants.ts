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
