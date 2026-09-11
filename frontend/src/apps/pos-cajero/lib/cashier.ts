/**
 * Cajero con sesión en esta laptop. La cookie de sesión es HttpOnly (el JS no
 * la ve), así que aquí se guarda solo lo que la caja necesita mostrar y para
 * etiquetar la cola: id, nombre y rol. Nada secreto.
 *
 * Guardarlo permite que la caja reabra sin internet con el mismo cajero. Si la
 * cookie venció, la cola se detiene con 401 y se le pide volver a entrar sin
 * perder nada.
 */
import type { CashierUser } from './api';

const key = (tenantId: string) => `caja:cashier:${tenantId}`;

export function loadCashier(tenantId: string): CashierUser | null {
  try {
    const raw = localStorage.getItem(key(tenantId));
    if (!raw) return null;
    const user = JSON.parse(raw) as CashierUser;
    return user.tenantId === tenantId && typeof user.id === 'string' ? user : null;
  } catch {
    return null;
  }
}

export function saveCashier(user: CashierUser): void {
  try {
    localStorage.setItem(key(user.tenantId), JSON.stringify(user));
  } catch {
    /* sin almacenamiento: tocará volver a entrar al recargar */
  }
}

export function clearCashier(tenantId: string): void {
  try {
    localStorage.removeItem(key(tenantId));
  } catch {
    /* nada que limpiar */
  }
}
