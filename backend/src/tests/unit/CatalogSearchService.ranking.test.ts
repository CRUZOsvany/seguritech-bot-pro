/**
 * Cierra el bug real encontrado en el stress test de "Papelería DEMO"
 * (`.claude/PROMPT_DEMO_PAPELERIA_STRESS_TEST.md` Fase 7, caso #9): buscar
 * "cuaderno profesional 100 hojas" devolvía el SKU de 200 hojas en vez del
 * de 100 hojas, porque `CatalogSearchService.search()` llamaba al repo con
 * `limit=1` y tomaba `results[0]` sin ningún scoring — el repo no ordena
 * (`SupabasePosProductRepository.search()` no tiene `.order()`), así que el
 * primer row "ganaba" por azar de Postgres, no por relevancia.
 *
 * Los 3 productos de este test son los reales del CSV de stress test
 * (`papeleria_demo_inventario_completo.csv`), sembrados a propósito para
 * forzar este caso de desambiguación (`EDGE-SIMILARSKU-01`).
 */
import type { PosProductRepository } from '@/domain/ports/pos/PosProductRepository';
import type { PosProduct } from '@/domain/entities/pos/Product';
import { CatalogSearchService } from '@/domain/services/CatalogSearchService';

const TENANT_ID = 't1';

function makeProduct(overrides: Partial<PosProduct> = {}): PosProduct {
  return {
    id: 'p1',
    tenantId: TENANT_ID,
    sku: 'SKU-1',
    barcode: null,
    name: 'Producto genérico',
    description: null,
    categoryId: null,
    unitType: 'piece',
    unitPrice: 10,
    costPrice: null,
    taxRate: 0,
    stockQty: 10,
    stockMin: 1,
    trackStock: true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const PAP_0001 = makeProduct({
  id: 'pap-0001',
  sku: 'PAP-0001',
  name: 'Cuaderno Profesional Cuadro Chico 100 hojas',
  unitPrice: 28.5,
});

const PAP_0002 = makeProduct({
  id: 'pap-0002',
  sku: 'PAP-0002',
  name: 'Cuaderno Profesional Cuadro Chico 200 hojas',
  unitPrice: 45.0,
});

const EDGE_SIMILARSKU_01 = makeProduct({
  id: 'edge-similarsku-01',
  sku: 'EDGE-SIMILARSKU-01',
  name: 'Cuaderno Profesional Cuadro Chico 100 hojas (Proveedor B)',
  unitPrice: 29.0,
});

/** Repo fake: el `limit` que reciba no importa — devuelve todo lo mapeado al término, como Postgres sin ORDER BY (orden "de la casa", no por relevancia). */
function makeRepo(resultsByTerm: Record<string, PosProduct[]>): PosProductRepository {
  return {
    search: async (_tenantId: string, query: string, _limit?: number) => resultsByTerm[query] ?? [],
  } as unknown as PosProductRepository;
}

describe('CatalogSearchService — ranking de resultados (bug real del stress test)', () => {
  it('con varios candidatos, el match exacto de tokens gana sobre una variante con un token distinto (100 vs 200 hojas)', async () => {
    // El repo "de Postgres sin ORDER BY" regresa el peor match primero —
    // exactamente el escenario que causó el bug en producción.
    const repo = makeRepo({
      'cuaderno profesional 100 hojas': [PAP_0002, PAP_0001],
    });
    const service = new CatalogSearchService(repo);

    const result = await service.search(TENANT_ID, 'cuaderno profesional 100 hojas');

    expect(result?.sku).toBe('PAP-0001');
  });

  it('entre dos candidatos con el mismo match de tokens, gana el nombre más corto/cercano en longitud al término buscado', async () => {
    const repo = makeRepo({
      'cuaderno profesional 100 hojas': [EDGE_SIMILARSKU_01, PAP_0001],
    });
    const service = new CatalogSearchService(repo);

    const result = await service.search(TENANT_ID, 'cuaderno profesional 100 hojas');

    expect(result?.sku).toBe('PAP-0001');
  });

  it('con un solo resultado, no cambia el comportamiento existente (camino feliz intacto)', async () => {
    const repo = makeRepo({
      'tornillo estrella 2 pulgadas': [
        makeProduct({ id: 'p1', sku: 'SKU-1', name: 'Tornillo Estrella 2 pulgadas' }),
      ],
    });
    const service = new CatalogSearchService(repo);

    const result = await service.search(TENANT_ID, 'Tornillo Estrella 2 Pulgadas');

    expect(result?.sku).toBe('SKU-1');
  });

  it('sin ningún resultado, sigue devolviendo null (no rompe catalog_not_found)', async () => {
    const repo = makeRepo({});
    const service = new CatalogSearchService(repo);

    const result = await service.search(TENANT_ID, 'algo que no existe en el catálogo');

    expect(result).toBeNull();
  });
});
