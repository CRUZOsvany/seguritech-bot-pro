/**
 * Barra de secciones de la ficha del cliente, en su orden. Dos secciones se
 * pintan dentro de la ficha; las otras tres son rutas completas a las que se
 * navega (no se embeben: tienen su propia lógica).
 *
 * Lo que NO está, a propósito — un solo camino por destino:
 *   - WhatsApp y POS: se llega por el "Configurar" de su tarjeta en Servicios.
 *   - Designer: se llega desde el Studio ("Modo avanzado").
 *   - Studio: tiene su propio botón junto al nombre del cliente.
 */
type RouteSectionPath =
  | '/tenants/$id/guion'
  | '/tenants/$id/service-directory'
  | '/tenants/$id/messages';

export type TenantSection =
  | { key: 'services' | 'business'; label: string; kind: 'inline' }
  | { key: 'guion' | 'service-directory' | 'messages'; label: string; kind: 'route'; to: RouteSectionPath };

export type InlineSection = Extract<TenantSection, { kind: 'inline' }>['key'];

export const TENANT_SECTIONS: readonly TenantSection[] = [
  { key: 'services', label: 'Servicios', kind: 'inline' },
  { key: 'guion', label: 'Guion', kind: 'route', to: '/tenants/$id/guion' },
  { key: 'service-directory', label: 'Directorio de servicios', kind: 'route', to: '/tenants/$id/service-directory' },
  { key: 'messages', label: 'Mensajes', kind: 'route', to: '/tenants/$id/messages' },
  { key: 'business', label: 'Datos del negocio', kind: 'inline' },
];

/** La que se ve al entrar a la ficha. */
export const DEFAULT_SECTION: InlineSection = 'services';
