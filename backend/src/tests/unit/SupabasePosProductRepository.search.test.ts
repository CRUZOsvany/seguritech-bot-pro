/**
 * Regresión de seguridad — F3 (auditoría 2026-08-20):
 * `search()` solo escapaba %/_ (metacaracteres de ILIKE) en el patrón, no los
 * metacaracteres estructurales del filtro `.or()` de PostgREST (`,` `.` `(` `)`).
 * Un `q` con esos caracteres podía alterar la estructura del filtro (agregar
 * condiciones no previstas sobre otras columnas de `pos_products`).
 * Ahora cada valor va entre comillas dobles (sintaxis PostgREST) para que esos
 * caracteres se traten como literales del valor, no como separadores.
 */
import pino from 'pino';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabasePosProductRepository } from '@/infrastructure/repositories/pos/SupabasePosProductRepository';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const logger = pino({ level: 'silent' });

/** Mock fluent mínimo: captura el string pasado a `.or()` y resuelve vacío. */
function makeSupabase(): { client: SupabaseClient; capturedOr: string[] } {
  const capturedOr: string[] = [];
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    or: (filter: string) => {
      capturedOr.push(filter);
      return builder;
    },
    limit: () => Promise.resolve({ data: [], error: null }),
  };
  const client = { from: () => builder } as unknown as SupabaseClient;
  return { client, capturedOr };
}

describe('SupabasePosProductRepository.search — escaping del filtro .or()', () => {
  it('envuelve el patrón ILIKE entre comillas dobles', async () => {
    const { client, capturedOr } = makeSupabase();
    const repo = new SupabasePosProductRepository(client, logger);

    await repo.search(TENANT_ID, 'lapiz');

    expect(capturedOr[0]).toBe('name.ilike."%lapiz%",sku.ilike."%lapiz%",barcode.eq."lapiz"');
  });

  it('una coma + comillas en el query no inyecta una condición OR adicional', async () => {
    const { client, capturedOr } = makeSupabase();
    const repo = new SupabasePosProductRepository(client, logger);

    // Intento de inyección: cerrar el valor entre comillas y agregar una
    // condición sobre otra columna (ej. forzar cost_price a un valor conocido).
    const malicious = 'x",cost_price.eq.0,name.ilike."x';
    await repo.search(TENANT_ID, malicious);

    // Cada `"` literal del input debe salir DUPLICADO (escape de PostgREST
    // para comillas embebidas), y el valor completo queda envuelto entre
    // comillas — así el parser de PostgREST lo trata como un único string
    // literal para name/sku/barcode, no como 3 condiciones más una inyectada.
    // Mismo orden que la implementación: primero %/_ (para ILIKE), luego
    // comillas dobles (para el filtro .or()).
    const likeEscaped = malicious.replace(/[%_]/g, (m) => `\\${m}`);
    const quotedPattern = `%${likeEscaped}%`.replace(/"/g, '""');
    const quotedValue = malicious.replace(/"/g, '""');
    expect(capturedOr[0]).toBe(
      `name.ilike."${quotedPattern}",sku.ilike."${quotedPattern}",barcode.eq."${quotedValue}"`,
    );
  });

  it('un punto en el query no rompe la sintaxis columna.operador.valor', async () => {
    const { client, capturedOr } = makeSupabase();
    const repo = new SupabasePosProductRepository(client, logger);

    await repo.search(TENANT_ID, 'ref.001');

    const filter = capturedOr[0];
    expect(filter).toContain('"%ref.001%"');
    expect(filter).toContain('"ref.001"');
  });

  it('un paréntesis en el query no altera el agrupamiento del filtro', async () => {
    const { client, capturedOr } = makeSupabase();
    const repo = new SupabasePosProductRepository(client, logger);

    await repo.search(TENANT_ID, 'combo(2x1)');

    const filter = capturedOr[0];
    expect(filter).toBe(
      'name.ilike."%combo(2x1)%",sku.ilike."%combo(2x1)%",barcode.eq."combo(2x1)"',
    );
  });

  it('sigue escapando % y _ dentro del patrón ILIKE', async () => {
    const { client, capturedOr } = makeSupabase();
    const repo = new SupabasePosProductRepository(client, logger);

    await repo.search(TENANT_ID, '50%_off');

    const filter = capturedOr[0];
    expect(filter).toContain('%50\\%\\_off%');
  });
});
