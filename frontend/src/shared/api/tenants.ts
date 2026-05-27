import { z } from 'zod';
import { apiFetch } from './client';

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

/**
 * Schema Zod del formulario crear tenant.
 *
 * IMPORTANTE: Este schema es ESPEJO del backend.
 * Fuente de verdad: backend/src/domain/use-cases/CreateTenantUseCase.ts
 *   → CreateTenantSchema
 *
 * Si el backend cambia, ACTUALIZAR este schema también. El backend siempre
 * revalida (no confiamos solo en el cliente), pero mantener sincronía
 * mejora UX (errores tempranos antes del round-trip).
 */
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

export const CreateTenantSchema = z.object({
  nombre_negocio: z
    .string()
    .min(2, 'Mínimo 2 caracteres')
    .max(120, 'Máximo 120 caracteres'),
  giro: z.enum(GIRO_VALUES),
  direccion: z.string().max(300).optional(),
  horario_semana: z.string().max(120).optional(),
  horario_sabado: z.string().max(120).optional(),
  abre_domingo: z.boolean().optional(),
  bot_configuration: z.object({
    numero_whatsapp_asignado: z
      .string()
      .min(8, 'Mínimo 8 caracteres')
      .max(20, 'Máximo 20 caracteres'),
    nombre_bot: z.string().max(60).optional(),
    tono_bot: z.enum(TONO_VALUES).optional(),
    mensaje_bienvenida: z.string().max(1024).optional(),
  }),
  template_slug: z.string().max(80).optional(),
});

export type CreateTenantInput = z.infer<typeof CreateTenantSchema>;

interface CreateTenantResponse {
  id: string;
}

/**
 * Crea un tenant atómicamente. Solo super_admin.
 * Limpia campos string vacíos antes de mandar (los convierte a undefined)
 * para que el backend no aplique max() a strings vacíos.
 */
export async function createTenant(
  input: CreateTenantInput,
): Promise<CreateTenantResponse> {
  // Defensive cleanup: el form puede mandar "" en campos opcionales.
  // El backend acepta undefined pero "" puede fallar validaciones max.
  const cleaned: CreateTenantInput = {
    ...input,
    direccion: input.direccion?.trim() || undefined,
    horario_semana: input.horario_semana?.trim() || undefined,
    horario_sabado: input.horario_sabado?.trim() || undefined,
    bot_configuration: {
      ...input.bot_configuration,
      numero_whatsapp_asignado: input.bot_configuration.numero_whatsapp_asignado.trim(),
      nombre_bot: input.bot_configuration.nombre_bot?.trim() || undefined,
      mensaje_bienvenida:
        input.bot_configuration.mensaje_bienvenida?.trim() || undefined,
    },
    template_slug: input.template_slug?.trim() || undefined,
  };
  return apiFetch<CreateTenantResponse>('POST', '/api/admin/tenants', cleaned);
}
