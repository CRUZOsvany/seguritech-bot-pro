import { describe, expect, it } from 'vitest';
import type { TenantSummary } from '@/shared/api/tenants';
import { filterTenants } from './tenant-search';

const tenant = (nombre_negocio: string, giro: string, status: TenantSummary['status']): TenantSummary => ({
  id: nombre_negocio,
  nombre_negocio,
  giro,
  status,
  webhook_verified: false,
  has_active_flow: false,
  whatsapp_status: null,
});

const tenants = [
  tenant('Cerrajeria Tony', 'cerrajeria', 'draft'),
  tenant('Papelería DEMO', 'papeleria', 'draft'),
  tenant('CerraCruz', 'cerrajeria', 'live'),
];

const names = (list: TenantSummary[]) => list.map((t) => t.nombre_negocio);

describe('filterTenants', () => {
  it('sin texto (o solo espacios) devuelve la lista completa', () => {
    expect(filterTenants(tenants, '')).toBe(tenants);
    expect(filterTenants(tenants, '   ')).toBe(tenants);
  });

  it('coincidencia parcial por nombre, sin distinguir mayúsculas', () => {
    expect(names(filterTenants(tenants, 'tony'))).toEqual(['Cerrajeria Tony']);
    expect(names(filterTenants(tenants, 'CERRA'))).toEqual(['Cerrajeria Tony', 'CerraCruz']);
  });

  it('ignora acentos en los dos sentidos', () => {
    expect(names(filterTenants(tenants, 'papeleria'))).toEqual(['Papelería DEMO']);
    expect(names(filterTenants(tenants, 'cerrajería'))).toEqual(['Cerrajeria Tony', 'CerraCruz']);
  });

  it('busca también por giro y por status', () => {
    expect(names(filterTenants(tenants, 'live'))).toEqual(['CerraCruz']);
    expect(names(filterTenants(tenants, 'Draft'))).toEqual(['Cerrajeria Tony', 'Papelería DEMO']);
  });

  it('sin coincidencias devuelve vacío', () => {
    expect(filterTenants(tenants, 'pizzería')).toEqual([]);
  });
});
