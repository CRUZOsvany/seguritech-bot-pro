import type { TenantStatus } from '@/shared/api/tenants';

/**
 * Status desde los que se puede eliminar un cliente para siempre. Espejo de
 * HARD_DELETABLE_STATUSES en backend/src/domain/use-cases/HardDeleteTenantUseCase.ts:
 * el backend es el que manda, esto solo evita ofrecer un botón que va a fallar.
 */
export const HARD_DELETABLE_STATUSES: readonly TenantStatus[] = ['draft', 'sandbox', 'archived'];

export function canHardDelete(status: TenantStatus): boolean {
  return HARD_DELETABLE_STATUSES.includes(status);
}

/**
 * "Eliminar para siempre" se habilita solo con el nombre idéntico: sin trim,
 * sin ignorar mayúsculas ni acentos. El backend compara igual.
 */
export function confirmNameMatches(typed: string, nombreNegocio: string): boolean {
  return typed === nombreNegocio;
}
