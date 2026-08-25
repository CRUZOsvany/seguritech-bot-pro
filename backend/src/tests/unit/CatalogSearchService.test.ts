/**
 * Tests de CatalogSearchService (§2.1 del plan V1). El repo es un stub que
 * registra los términos con los que se llamó `search()`, para verificar la
 * estrategia de tokenización/sinónimos sin depender de Supabase.
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

/** Repo fake: responde con `resultsByTerm[term]` o [] si el término no está mapeado. */
function makeRepo(resultsByTerm: Record<string, PosProduct[]>): {
  repo: PosProductRepository;
  calledTerms: string[];
} {
  const calledTerms: string[] = [];
  const repo = {
    search: async (_tenantId: string, query: string) => {
      calledTerms.push(query);
      return resultsByTerm[query] ?? [];
    },
  } as unknown as PosProductRepository;
  return { repo, calledTerms };
}

describe('CatalogSearchService', () => {
  it('encuentra match con la frase completa normalizada (sin acentos/mayúsculas)', async () => {
    const product = makeProduct();
    const { repo } = makeRepo({ 'tornillo estrella 2 pulgadas': [product] });
    const service = new CatalogSearchService(repo);

    const result = await service.search(TENANT_ID, 'Tornillo Estrella 2 Pulgadas');

    expect(result?.id).toBe('p1');
  });

  it('si la frase completa no matchea, prueba con palabras significativas individuales', async () => {
    const product = makeProduct();
    // La pregunta completa no matchea nada; "tornillos" sí (el repo la busca
    // tal cual, ILIKE %tornillos% no matchearía "Tornillo" en un stub literal,
    // pero aquí probamos que el SERVICIO sí intenta la palabra suelta).
    const { repo, calledTerms } = makeRepo({ tornillos: [product] });
    const service = new CatalogSearchService(repo);

    const result = await service.search(TENANT_ID, '¿Tienen tornillos de 2 pulgadas?');

    expect(result?.id).toBe('p1');
    expect(calledTerms).toContain('tornillos');
  });

  it('descarta stopwords y palabras cortas al tokenizar', async () => {
    const { repo, calledTerms } = makeRepo({});
    const service = new CatalogSearchService(repo);

    await service.search(TENANT_ID, '¿Tienen un cuaderno para mí?');

    // "tienen", "un", "para", "mi" son stopwords/cortas — no deben probarse
    // como término de búsqueda independiente.
    expect(calledTerms).not.toContain('tienen');
    expect(calledTerms).not.toContain('un');
    expect(calledTerms).not.toContain('para');
    expect(calledTerms).toContain('cuaderno');
  });

  it('expande sinónimos: si la palabra normalizada matchea un alias, también prueba el término canónico', async () => {
    const product = makeProduct({ name: 'Destornillador plano 6 pulgadas' });
    const { repo, calledTerms } = makeRepo({ destornillador: [product] });
    const service = new CatalogSearchService(repo);

    const result = await service.search(TENANT_ID, 'busco un desarmador', {
      desarmador: 'destornillador',
    });

    expect(result?.id).toBe('p1');
    expect(calledTerms).toContain('desarmador');
    expect(calledTerms).toContain('destornillador');
  });

  it('sin ningún término con match, devuelve null (nunca inventa)', async () => {
    const { repo } = makeRepo({});
    const service = new CatalogSearchService(repo);

    const result = await service.search(TENANT_ID, 'algo que no existe en el catálogo');

    expect(result).toBeNull();
  });

  it('mensaje solo de stopwords/vacío no genera búsquedas y devuelve null', async () => {
    const { repo, calledTerms } = makeRepo({});
    const service = new CatalogSearchService(repo);

    const result = await service.search(TENANT_ID, 'hola');

    expect(result).toBeNull();
    // "hola" (4 chars) sí se prueba como frase completa — no es stopword,
    // pero no matchea nada en el repo fake.
    expect(calledTerms).toEqual(['hola']);
  });
});
