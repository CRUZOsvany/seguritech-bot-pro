/**
 * Una URL por negocio: la caja siempre corre en /caja/<tenantId>/. El
 * tenantId sale de la ruta — no hay pantalla de configuración ni se escribe
 * a mano. El operador instala la PWA desde el enlace que muestra el panel.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LAST_TENANT_KEY = 'caja:lastTenant';

export function tenantIdFromPath(pathname: string): string | null {
  const match = /^\/caja\/([^/]+)\/?/.exec(pathname);
  if (!match || !UUID_RE.test(match[1])) return null;
  return match[1].toLowerCase();
}

/** Recuerda el último negocio abierto para que /caja/ a secas lo retome. */
export function rememberTenant(tenantId: string): void {
  try {
    localStorage.setItem(LAST_TENANT_KEY, tenantId);
  } catch {
    /* almacenamiento bloqueado: /caja/ simplemente pedirá el enlace */
  }
}

export function lastTenant(): string | null {
  try {
    const value = localStorage.getItem(LAST_TENANT_KEY);
    return value && UUID_RE.test(value) ? value : null;
  } catch {
    return null;
  }
}
