import { expandCapturaEscalado } from './capturaEscalado';
import { expandCierre } from './cierre';
import { expandConsultaCatalogo } from './consultaCatalogo';
import { expandCotizador } from './cotizador';
import { expandEntrada } from './entrada';
import { expandMenu } from './menu';
import type { BlockExpansion, BlockSpec } from './types';

/**
 * Expande un bloque a su subgrafo. Punto de entrada único.
 *
 * El `switch` es exhaustivo por el `never`: añadir un bloque nuevo a
 * `BlockSpec` sin implementarlo rompe el type-check, no el runtime.
 */
export function expandBlock(spec: BlockSpec): BlockExpansion {
  switch (spec.kind) {
  case 'entrada':
    return expandEntrada(spec);
  case 'menu':
    return expandMenu(spec);
  case 'consulta_catalogo':
    return expandConsultaCatalogo(spec);
  case 'captura_escalado':
    return expandCapturaEscalado(spec);
  case 'cotizador':
    return expandCotizador(spec);
  case 'cierre':
    return expandCierre(spec);
  default: {
    const _exhaustive: never = spec;
    throw new Error(`Tipo de bloque desconocido: ${JSON.stringify(_exhaustive)}`);
  }
  }
}

export * from './types';
export { assemble, type BlockWiring, type AssembleParams } from './assemble';
