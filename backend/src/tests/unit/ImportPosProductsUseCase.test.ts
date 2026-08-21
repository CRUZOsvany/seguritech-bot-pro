/**
 * Tests de ImportPosProductsUseCase (Bloque 5).
 *
 * Cubre: import válido, filas mezcladas (válidas + inválidas), re-import
 * idempotente (upsert), resolución/creación de categorías por nombre, y el
 * modo dryRun (preview sin escribir).
 */
import pino from 'pino';
import { ImportPosProductsUseCase } from '@/domain/use-cases/ImportPosProductsUseCase';
import type { PosProductRepository } from '@/domain/ports/pos/PosProductRepository';
import type { PosCategoryRepository } from '@/domain/ports/pos/PosCategoryRepository';
import type { PosProduct } from '@/domain/entities/pos/Product';
import type { PosCategory } from '@/domain/entities/pos/Category';

const logger = pino({ level: 'silent' });
const TENANT_ID = 'tenant-1';

function makeProduct(overrides: Partial<PosProduct> = {}): PosProduct {
  return {
    id: 'p1',
    tenantId: TENANT_ID,
    sku: 'X-1',
    barcode: null,
    name: 'Producto',
    description: null,
    categoryId: 'cat-1',
    unitType: 'piece',
    unitPrice: 10,
    costPrice: null,
    taxRate: 0,
    stockQty: 5,
    stockMin: 0,
    trackStock: true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCategory(overrides: Partial<PosCategory> = {}): PosCategory {
  return {
    id: 'cat-1',
    tenantId: TENANT_ID,
    name: 'Escritura',
    parentId: null,
    displayOrder: 0,
    isActive: true,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('ImportPosProductsUseCase', () => {
  let posProducts: jest.Mocked<PosProductRepository>;
  let posCategories: jest.Mocked<PosCategoryRepository>;
  let useCase: ImportPosProductsUseCase;

  beforeEach(() => {
    posProducts = {
      findById: jest.fn(),
      findByBarcode: jest.fn(),
      findBySku: jest.fn().mockResolvedValue(null),
      search: jest.fn(),
      list: jest.fn(),
      countActive: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsertBySku: jest.fn(),
    } as unknown as jest.Mocked<PosProductRepository>;

    posCategories = {
      findById: jest.fn(),
      findByName: jest.fn().mockResolvedValue(null),
      list: jest.fn(),
      create: jest.fn().mockResolvedValue(makeCategory()),
    } as unknown as jest.Mocked<PosCategoryRepository>;

    useCase = new ImportPosProductsUseCase(posProducts, posCategories, logger);
  });

  const csv = [
    'sku,name,category,unit_price,stock_qty',
    'LAP-001,Lápiz #2,Escritura,3.50,100',
    'CUAD-001,Cuaderno,Escritura,25,50',
  ].join('\n');

  it('import válido: crea productos nuevos y crea la categoría que no existía', async () => {
    posProducts.upsertBySku.mockImplementation(async (p) =>
      ({ product: makeProduct({ sku: p.sku }), created: true }),
    );

    const result = await useCase.execute({ tenantId: TENANT_ID, csvText: csv });

    expect(result.created).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.errors).toHaveLength(0);
    // Misma categoría ("Escritura") en ambas filas -> se crea UNA sola vez (cache).
    expect(posCategories.create).toHaveBeenCalledTimes(1);
    expect(posCategories.create).toHaveBeenCalledWith({ tenantId: TENANT_ID, name: 'Escritura' });
    expect(posProducts.upsertBySku).toHaveBeenCalledTimes(2);
    expect(posProducts.upsertBySku).toHaveBeenCalledWith(
      expect.objectContaining({ sku: 'LAP-001', categoryId: 'cat-1', unitPrice: 3.5, stockQty: 100 }),
    );
  });

  it('reutiliza la categoría si ya existe (no la vuelve a crear)', async () => {
    posCategories.findByName.mockResolvedValue(makeCategory({ id: 'cat-existente' }));
    posProducts.upsertBySku.mockResolvedValue({ product: makeProduct(), created: true });

    await useCase.execute({ tenantId: TENANT_ID, csvText: csv });

    expect(posCategories.create).not.toHaveBeenCalled();
    expect(posProducts.upsertBySku).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: 'cat-existente' }),
    );
  });

  it('filas mezcladas: las válidas se procesan, las inválidas se reportan, no se aborta el import', async () => {
    const mixedCsv = [
      'sku,name,category,unit_price,stock_qty',
      'OK-1,Producto bueno,Cat,10,5',
      'BAD-1,Malo,Cat,-5,10', // unit_price negativo
      'OK-2,Otro,Cat,20,3',
    ].join('\n');
    posProducts.upsertBySku.mockImplementation(async (p) =>
      ({ product: makeProduct({ sku: p.sku }), created: true }),
    );

    const result = await useCase.execute({ tenantId: TENANT_ID, csvText: mixedCsv });

    expect(result.created).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ sku: 'BAD-1' });
    expect(posProducts.upsertBySku).toHaveBeenCalledTimes(2);
  });

  it('re-importar el mismo CSV cae en "updated", no crea duplicados', async () => {
    posProducts.upsertBySku.mockImplementation(async (p) =>
      ({ product: makeProduct({ sku: p.sku }), created: false }),
    );

    const result = await useCase.execute({ tenantId: TENANT_ID, csvText: csv });

    expect(result.created).toBe(0);
    expect(result.updated).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it('un error del repositorio en una fila se reporta como error de esa fila, sin abortar las demás', async () => {
    posProducts.upsertBySku
      .mockRejectedValueOnce(new Error('duplicate key value violates unique constraint'))
      .mockResolvedValueOnce({ product: makeProduct({ sku: 'CUAD-001' }), created: true });

    const result = await useCase.execute({ tenantId: TENANT_ID, csvText: csv });

    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ sku: 'LAP-001' });
    expect(result.errors[0].message).toMatch(/duplicate key/);
  });

  describe('dryRun', () => {
    it('no escribe nada (ni productos ni categorías) pero calcula created/updated correctamente', async () => {
      posProducts.findBySku
        .mockResolvedValueOnce(null) // LAP-001 no existe -> created
        .mockResolvedValueOnce(makeProduct({ sku: 'CUAD-001' })); // CUAD-001 ya existe -> updated

      const result = await useCase.execute({ tenantId: TENANT_ID, csvText: csv, dryRun: true });

      expect(result.created).toBe(1);
      expect(result.updated).toBe(1);
      expect(posProducts.upsertBySku).not.toHaveBeenCalled();
      expect(posProducts.create).not.toHaveBeenCalled();
      expect(posCategories.create).not.toHaveBeenCalled();
    });

    it('sigue reportando errores de filas inválidas en dryRun', async () => {
      const mixedCsv = [
        'sku,name,category,unit_price,stock_qty',
        'BAD-1,,Cat,10,5',
      ].join('\n');

      const result = await useCase.execute({ tenantId: TENANT_ID, csvText: mixedCsv, dryRun: true });

      expect(result.errors).toHaveLength(1);
      expect(posProducts.findBySku).not.toHaveBeenCalled();
    });
  });
});
