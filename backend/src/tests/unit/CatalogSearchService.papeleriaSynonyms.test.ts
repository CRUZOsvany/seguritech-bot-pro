/**
 * Cierra el gap real encontrado en la auditoría de 2026-08-24 (Fase 5 de
 * `.claude/PROMPT_DEMO_PAPELERIA_STRESS_TEST.md`): `FlowInterpreter` nunca le
 * pasaba `synonyms` a `CatalogSearchService.search()`, así que un cliente
 * escribiendo "libreta" nunca encontraba un producto llamado "Cuaderno...".
 * Este test usa el diccionario REAL de `domain/moulds/papeleria.synonyms.ts`
 * (no uno inventado en el test) contra un producto con el nombre real que
 * usa `papeleria_demo_inventario_completo.csv` — falla sin el wiring de la
 * Fase 5, pasa con él.
 */
import type { PosProductRepository } from '@/domain/ports/pos/PosProductRepository';
import type { PosProduct } from '@/domain/entities/pos/Product';
import { CatalogSearchService } from '@/domain/services/CatalogSearchService';
import { PAPELERIA_SYNONYMS } from '@/domain/moulds/papeleria.synonyms';

const TENANT_ID = 't1';

function makeProduct(overrides: Partial<PosProduct> = {}): PosProduct {
  return {
    id: 'pap-0001',
    tenantId: TENANT_ID,
    sku: 'PAP-0001',
    barcode: null,
    name: 'Cuaderno Profesional Cuadro Chico 100 hojas',
    description: null,
    categoryId: null,
    unitType: 'piece',
    unitPrice: 28.5,
    costPrice: null,
    taxRate: 0,
    stockQty: 120,
    stockMin: 10,
    trackStock: true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRepo(resultsByTerm: Record<string, PosProduct[]>): PosProductRepository {
  return {
    search: async (_tenantId: string, query: string) => resultsByTerm[query] ?? [],
  } as unknown as PosProductRepository;
}

describe('CatalogSearchService + PAPELERIA_SYNONYMS (§2.1, gap cerrado 2026-08-24)', () => {
  it('"libreta" con PAPELERIA_SYNONYMS encuentra un producto llamado "Cuaderno..."', async () => {
    const product = makeProduct();
    // El repo fake solo responde al término canónico "cuaderno" — igual que
    // pos_products, donde el `name` real dice "Cuaderno...", nunca "libreta".
    const repo = makeRepo({ cuaderno: [product] });
    const service = new CatalogSearchService(repo);

    const result = await service.search(TENANT_ID, 'libreta profesional', PAPELERIA_SYNONYMS);

    expect(result?.sku).toBe('PAP-0001');
  });

  it('sin el diccionario (synonyms={}, comportamiento previo al fix) "libreta" NO encuentra el cuaderno', async () => {
    const product = makeProduct();
    const repo = makeRepo({ cuaderno: [product] });
    const service = new CatalogSearchService(repo);

    const result = await service.search(TENANT_ID, 'libreta profesional', {});

    expect(result).toBeNull();
  });

  it('otros sinónimos reales del diccionario también resuelven al término canónico', async () => {
    const pluma = makeProduct({ id: 'pap-0103', sku: 'PAP-0103', name: 'Pluma Tinta Azul Punto Mediano' });
    const repo = makeRepo({ pluma: [pluma] });
    const service = new CatalogSearchService(repo);

    const result = await service.search(TENANT_ID, 'boligrafo azul', PAPELERIA_SYNONYMS);

    expect(result?.sku).toBe('PAP-0103');
  });
});
