/**
 * DynamicSectionResolver — sin tests hasta ahora (gap encontrado al
 * implementar DEC-04, auditoría 2026-08-26). Cubre el comportamiento
 * existente de 'catalog_items' (regresión) y el nuevo 'service_directory'.
 */
import pino from 'pino';
import { DynamicSectionResolver } from '@/domain/services/DynamicSectionResolver';
import type { ListSection } from '@/domain/entities/flow';
import type { TenantConfig, CatalogItem, ServiceDirectoryEntry } from '@/domain/entities';
import { BotTone } from '@/domain/entities';

const logger = pino({ level: 'silent' });

function makeCatalogItem(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: 'c1',
    name: 'Producto',
    description: '',
    price: 10,
    category: 'general',
    available: true,
    ...overrides,
  };
}

function makeServiceEntry(overrides: Partial<ServiceDirectoryEntry> = {}): ServiceDirectoryEntry {
  return {
    id: 's1',
    tenantId: 't1',
    nombre: 'Engargolado',
    keywords: ['engargolado'],
    respuesta: 'Engargolado hasta 100 hojas $35, de 100-200 $50',
    precio: undefined,
    activo: true,
    orden: 0,
    ...overrides,
  };
}

function makeTenantConfig(overrides: Partial<TenantConfig> = {}): TenantConfig {
  return {
    tenantId: 't1',
    botName: 'TestBot',
    nombreNegocio: 'Test',
    tone: BotTone.AMIGABLE,
    welcomeMessage: '',
    menuMessage: '',
    outOfHoursMessage: '',
    notUnderstoodMessage: '',
    orderConfirmationMessage: '',
    catalog: [],
    serviceDirectory: [],
    horarioSemana: null,
    horarioSabado: null,
    abreDomingo: false,
    catalogSynonyms: {},
    ...overrides,
  };
}

describe('DynamicSectionResolver — catalog_items (regresión)', () => {
  const resolver = new DynamicSectionResolver(logger);

  it('filtra por available, trunca title/description, tope de 10', () => {
    const sections: ListSection[] = [
      { type: 'dynamic', title: 'Catálogo', items_source: 'catalog_items' },
    ];
    const config = makeTenantConfig({
      catalog: [
        makeCatalogItem({ id: 'c1', name: 'Disponible', price: 5, available: true }),
        makeCatalogItem({ id: 'c2', name: 'No disponible', price: 7, available: false }),
      ],
    });

    const [result] = resolver.resolve(sections, config);
    expect(result.title).toBe('Catálogo');
    expect(result.items).toEqual([{ id: 'c1', title: 'Disponible', description: '$5.00' }]);
  });
});

describe('DynamicSectionResolver — service_directory (DEC-04, auditoría 2026-08-26)', () => {
  const resolver = new DynamicSectionResolver(logger);

  it('filtra por activo=true y ordena por orden ascendente', () => {
    const sections: ListSection[] = [
      { type: 'dynamic', title: 'Servicios', items_source: 'service_directory' },
    ];
    const config = makeTenantConfig({
      serviceDirectory: [
        makeServiceEntry({ id: 's2', nombre: 'Segundo', orden: 2 }),
        makeServiceEntry({ id: 's1', nombre: 'Primero', orden: 1 }),
        makeServiceEntry({ id: 's3', nombre: 'Inactivo', orden: 0, activo: false }),
      ],
    });

    const [result] = resolver.resolve(sections, config);
    expect(result.items.map((i) => i.id)).toEqual(['s1', 's2']);
  });

  it('usa precio como description si existe, respuesta truncada si no', () => {
    const sections: ListSection[] = [
      { type: 'dynamic', title: 'Servicios', items_source: 'service_directory' },
    ];
    const config = makeTenantConfig({
      serviceDirectory: [
        makeServiceEntry({ id: 's1', nombre: 'Con precio', precio: 25 }),
        makeServiceEntry({
          id: 's2',
          nombre: 'Sin precio',
          precio: undefined,
          respuesta: 'X'.repeat(100), // > 72 chars, debe truncarse
        }),
      ],
    });

    const [result] = resolver.resolve(sections, config);
    expect(result.items[0].description).toBe('$25.00');
    expect(result.items[1].description).toHaveLength(72);
    expect(result.items[1].description).toMatch(/…$/);
  });

  it('directorio vacío o sin entradas activas → 0 items, no truena', () => {
    const sections: ListSection[] = [
      { type: 'dynamic', title: 'Servicios', items_source: 'service_directory' },
    ];
    const config = makeTenantConfig({ serviceDirectory: [] });

    const [result] = resolver.resolve(sections, config);
    expect(result.items).toEqual([]);
  });

  it('tope de 10 items aunque el directorio tenga más', () => {
    const sections: ListSection[] = [
      { type: 'dynamic', title: 'Servicios', items_source: 'service_directory' },
    ];
    const config = makeTenantConfig({
      serviceDirectory: Array.from({ length: 15 }, (_, i) =>
        makeServiceEntry({ id: `s${i}`, nombre: `Servicio ${i}`, orden: i }),
      ),
    });

    const [result] = resolver.resolve(sections, config);
    expect(result.items).toHaveLength(10);
    expect(result.items[0].id).toBe('s0');
    expect(result.items[9].id).toBe('s9');
  });

  it('title del item se trunca a 24 chars (regla Meta)', () => {
    const sections: ListSection[] = [
      { type: 'dynamic', title: 'Servicios', items_source: 'service_directory' },
    ];
    const config = makeTenantConfig({
      serviceDirectory: [makeServiceEntry({ nombre: 'Un nombre de servicio muy largo que excede el límite' })],
    });

    const [result] = resolver.resolve(sections, config);
    expect(result.items[0].title).toHaveLength(24);
  });
});

describe('DynamicSectionResolver — secciones static pasan sin tocar', () => {
  const resolver = new DynamicSectionResolver(logger);

  it('sección static se devuelve tal cual, sin resolver nada', () => {
    const sections: ListSection[] = [
      { type: 'static', title: 'Fijo', items: [{ id: 'a', title: 'A' }] },
    ];
    const [result] = resolver.resolve(sections, makeTenantConfig());
    expect(result).toEqual({ title: 'Fijo', items: [{ id: 'a', title: 'A' }] });
  });
});
