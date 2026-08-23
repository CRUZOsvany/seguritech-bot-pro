import { ServiceDirectoryMatcher } from '@/domain/services/ServiceDirectoryMatcher';
import type { ServiceDirectoryEntry } from '@/domain/entities';

function makeEntry(overrides: Partial<ServiceDirectoryEntry> = {}): ServiceDirectoryEntry {
  return {
    id: 'e1',
    tenantId: 't1',
    nombre: 'Copia de llave',
    keywords: ['copia de llave', 'duplicado'],
    respuesta: 'Sí, hacemos copias de llave.',
    activo: true,
    orden: 0,
    ...overrides,
  };
}

describe('ServiceDirectoryMatcher', () => {
  const matcher = new ServiceDirectoryMatcher();

  it('matchea por keyword exacta', () => {
    const entry = makeEntry();
    expect(matcher.match('quiero un duplicado', [entry])).toEqual(entry);
  });

  it('matchea tolerando acento/typo (Capa 0 reutilizada)', () => {
    const entry = makeEntry({ keywords: ['información'] });
    expect(matcher.match('quiero informacion', [entry])).toEqual(entry);
  });

  it('devuelve null si ninguna entrada matchea', () => {
    const entry = makeEntry();
    expect(matcher.match('quiero comprar tornillos', [entry])).toBeNull();
  });

  it('ignora entradas con activo=false', () => {
    const entry = makeEntry({ activo: false });
    expect(matcher.match('quiero un duplicado', [entry])).toBeNull();
  });

  it('devuelve la primera entrada activa que matchea, en orden del arreglo', () => {
    const first = makeEntry({ id: 'e1', keywords: ['llave'] });
    const second = makeEntry({ id: 'e2', keywords: ['llave'] });
    expect(matcher.match('necesito una llave', [first, second])).toEqual(first);
  });

  it('directorio vacío nunca matchea', () => {
    expect(matcher.match('cualquier mensaje', [])).toBeNull();
  });
});
