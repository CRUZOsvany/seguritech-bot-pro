/**
 * selected_product_name/price con fallback a pos_products (§2.1 del plan V1).
 *
 * search_catalog matchea sobre pos_products, no sobre catalog_items — así
 * que selected_product_id puede apuntar a un id que NO está en
 * tenantConfig.catalog. VariableResolver debe resolverlo igual, vía lookup
 * lazy a PosProductRepository.findById.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import pino from 'pino';
import { VariableResolver } from '@/domain/services/VariableResolver';
import type { TenantConfig, User, Message } from '@/domain/entities';
import { BotTone, UserState } from '@/domain/entities';
import type { PosProductRepository } from '@/domain/ports/pos/PosProductRepository';
import type { PosProduct } from '@/domain/entities/pos/Product';

const silentLogger = pino({ level: 'silent' });
const unusedSupabase = {} as unknown as SupabaseClient;

function makeTenantConfig(overrides: Partial<TenantConfig> = {}): TenantConfig {
  return {
    tenantId: 't1',
    botName: 'Bot',
    nombreNegocio: 'Ferretería Prueba',
    tone: BotTone.AMIGABLE,
    welcomeMessage: 'Hola',
    menuMessage: 'Menú',
    outOfHoursMessage: 'Fuera de horario',
    notUnderstoodMessage: 'No entendí',
    orderConfirmationMessage: 'Pedido confirmado',
    catalog: [],
    serviceDirectory: [],
    horarioSemana: null,
    horarioSabado: null,
    abreDomingo: false,
    ...overrides,
  };
}

function makeUser(context: Record<string, unknown> = {}): User {
  return {
    id: 'u1',
    tenantId: 't1',
    phoneNumber: '521234567890',
    currentState: UserState.INITIAL,
    context,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeMessage(): Message {
  return { id: 'm1', tenantId: 't1', from: '521234567890', content: 'hola', timestamp: new Date() };
}

function makePosProduct(overrides: Partial<PosProduct> = {}): PosProduct {
  return {
    id: 'pos-1',
    tenantId: 't1',
    sku: 'SKU-1',
    barcode: null,
    name: 'Tornillo Estrella 2 pulgadas',
    description: null,
    categoryId: null,
    unitType: 'piece',
    unitPrice: 3.5,
    costPrice: null,
    taxRate: 0,
    stockQty: 100,
    stockMin: 10,
    trackStock: true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('VariableResolver — selected_product_* con fallback a pos_products', () => {
  it('selected_product_name resuelve desde tenantConfig.catalog si el id está ahí (no consulta pos_products)', async () => {
    const findById = jest.fn();
    const posProductRepository = { findById } as unknown as PosProductRepository;
    const resolver = new VariableResolver(unusedSupabase, posProductRepository, silentLogger);

    const result = await resolver.resolve('{{selected_product_name}}', {
      tenantId: 't1',
      tenantConfig: makeTenantConfig({
        catalog: [{ id: 'c1', name: 'Producto chico', description: '', price: 10, category: 'x', available: true }],
      }),
      user: makeUser({ selected_product_id: 'c1' }),
      message: makeMessage(),
    });

    expect(result).toBe('Producto chico');
    expect(findById).not.toHaveBeenCalled();
  });

  it('selected_product_name cae a pos_products cuando el id no está en catalog_items', async () => {
    const findById = jest.fn().mockResolvedValue(makePosProduct());
    const posProductRepository = { findById } as unknown as PosProductRepository;
    const resolver = new VariableResolver(unusedSupabase, posProductRepository, silentLogger);

    const result = await resolver.resolve('{{selected_product_name}}', {
      tenantId: 't1',
      tenantConfig: makeTenantConfig(),
      user: makeUser({ selected_product_id: 'pos-1' }),
      message: makeMessage(),
    });

    expect(result).toBe('Tornillo Estrella 2 pulgadas');
    expect(findById).toHaveBeenCalledWith('t1', 'pos-1');
  });

  it('selected_product_price cae a pos_products y formatea unitPrice a 2 decimales', async () => {
    const findById = jest.fn().mockResolvedValue(makePosProduct({ unitPrice: 12.5 }));
    const posProductRepository = { findById } as unknown as PosProductRepository;
    const resolver = new VariableResolver(unusedSupabase, posProductRepository, silentLogger);

    const result = await resolver.resolve('{{selected_product_price}}', {
      tenantId: 't1',
      tenantConfig: makeTenantConfig(),
      user: makeUser({ selected_product_id: 'pos-1' }),
      message: makeMessage(),
    });

    expect(result).toBe('12.50');
  });

  it('vacío si el id no existe en catalog_items ni en pos_products', async () => {
    const findById = jest.fn().mockResolvedValue(null);
    const posProductRepository = { findById } as unknown as PosProductRepository;
    const resolver = new VariableResolver(unusedSupabase, posProductRepository, silentLogger);

    const result = await resolver.resolve('{{selected_product_name}}', {
      tenantId: 't1',
      tenantConfig: makeTenantConfig(),
      user: makeUser({ selected_product_id: 'no-existe' }),
      message: makeMessage(),
    });

    expect(result).toBe('');
    expect(findById).toHaveBeenCalledWith('t1', 'no-existe');
  });

  it('vacío sin consultar nada si no hay selected_product_id en el contexto', async () => {
    const findById = jest.fn();
    const posProductRepository = { findById } as unknown as PosProductRepository;
    const resolver = new VariableResolver(unusedSupabase, posProductRepository, silentLogger);

    const result = await resolver.resolve('{{selected_product_price}}', {
      tenantId: 't1',
      tenantConfig: makeTenantConfig(),
      user: makeUser(),
      message: makeMessage(),
    });

    expect(result).toBe('');
    expect(findById).not.toHaveBeenCalled();
  });
});
