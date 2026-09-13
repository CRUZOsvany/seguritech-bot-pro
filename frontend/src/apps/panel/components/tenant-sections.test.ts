import { describe, expect, it } from 'vitest';
import { DEFAULT_SECTION, TENANT_SECTIONS } from './tenant-sections';

describe('TENANT_SECTIONS', () => {
  it('cinco pestañas, en el orden acordado', () => {
    expect(TENANT_SECTIONS.map((s) => s.label)).toEqual([
      'Servicios',
      'Guion',
      'Directorio de servicios',
      'Mensajes',
      'Datos del negocio',
    ]);
  });

  it('Servicios es la activa al entrar', () => {
    expect(DEFAULT_SECTION).toBe('services');
  });

  it('Servicios y Datos del negocio se pintan en la ficha; las otras tres navegan', () => {
    expect(TENANT_SECTIONS.filter((s) => s.kind === 'inline').map((s) => s.key)).toEqual(['services', 'business']);
    expect(TENANT_SECTIONS.flatMap((s) => (s.kind === 'route' ? [s.to] : []))).toEqual([
      '/tenants/$id/guion',
      '/tenants/$id/service-directory',
      '/tenants/$id/messages',
    ]);
  });

  it('no duplica caminos: WhatsApp, POS, Designer y Studio no son pestañas', () => {
    const routes = TENANT_SECTIONS.flatMap((s) => (s.kind === 'route' ? [s.to] : []));
    expect(routes.filter((r) => /whatsapp|pos|designer|studio/.test(r))).toEqual([]);
  });
});
