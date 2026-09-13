import type { TenantStatus } from '@/shared/api/tenants';

/**
 * Status desde los que se puede eliminar un cliente para siempre. Espejo de
 * HARD_DELETABLE_STATUSES en backend/src/domain/use-cases/HardDeleteTenantUseCase.ts:
 * el backend es el que manda, esto solo evita ofrecer un botón que va a fallar.
 * La otra guarda del backend (sin admin_operator asignado) no se ve desde la
 * lista: si aplica, llega como error del backend.
 */
export const HARD_DELETABLE_STATUSES: readonly TenantStatus[] = ['draft', 'sandbox', 'archived'];

export function canHardDelete(status: TenantStatus): boolean {
  return HARD_DELETABLE_STATUSES.includes(status);
}

/**
 * "Eliminar para siempre" se habilita con el nombre del negocio. Los espacios
 * de las orillas no cuentan (hay nombres guardados con uno al final, invisible
 * en el panel); mayúsculas, acentos y ñ sí. El backend compara igual.
 */
export function confirmNameMatches(typed: string, nombreNegocio: string): boolean {
  const escrito = typed.trim();
  return escrito.length > 0 && escrito === nombreNegocio.trim();
}
