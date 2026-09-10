import type { SearchCatalogNode } from '@/domain/entities/flow';
import { nodeId, type BlockExpansion, type ConsultaCatalogoSpec } from './types';

/**
 * Bloque Consulta de catálogo: texto libre → búsqueda real en `pos_products`.
 *
 * Las DOS salidas son obligatorias y ahí está el valor del bloque: sin match,
 * el flow nunca inventa una respuesta. `no_encontrado` tiene que ir a algún
 * lado que el autor decida — normalmente un escalado — y el ensamblador falla
 * si queda sin cablear.
 *
 * `encontrado` guarda el id del producto en contexto, que es la clave que
 * después resuelve {{selected_product_name}} y {{selected_product_price}} en
 * los nodos siguientes sin lookup extra.
 */
export function expandConsultaCatalogo(spec: ConsultaCatalogoSpec): BlockExpansion {
  const busqueda = nodeId(spec.id, 'busqueda');

  const node: SearchCatalogNode = {
    id: busqueda,
    type: 'search_catalog',
    content: { prompt: spec.prompt },
    transitions: [],
  };

  return {
    nodes: [node],
    entryNodeId: busqueda,
    outlets: [
      {
        id: 'encontrado',
        label: 'Encontré el producto',
        fromNodeIds: [busqueda],
        condition: {
          type: 'catalog_found',
          save_to_context: spec.guardarEn ?? 'selected_product_id',
        },
      },
      {
        id: 'no_encontrado',
        label: 'No lo encontré',
        fromNodeIds: [busqueda],
        condition: { type: 'catalog_not_found' },
      },
    ],
  };
}
