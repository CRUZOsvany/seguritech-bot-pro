import type { SendButtonsNode, SendListNode } from '@/domain/entities/flow';
import {
  BlockExpansionError,
  nodeId,
  truncate,
  type BlockExpansion,
  type BlockOutlet,
  type MenuSpec,
} from './types';

/** Meta: máximo 3 botones (R-F16). A partir de 4 opciones toca lista. */
const MAX_BOTONES = 3;
/** Meta: máximo 10 filas totales en un send_list (R-F18). */
const MAX_FILAS = 10;

/**
 * Bloque Menú.
 *
 * La presentación NO la elige el operador: la decide el número de opciones.
 * 1-3 → botones (R-F16). 4-10 → lista de una sección (R-F17, R-F18). Más de
 * 10 no cabe en WhatsApp y la expansión falla aquí, en el momento de armarlo,
 * en vez de generar un nodo que el backend rechazaría al publicar.
 *
 * Los títulos se truncan al límite que aplique — 20 chars en botón, 24 en
 * fila de lista — así que R-F16 y R-F17 se cumplen aunque el operador escriba
 * de más.
 *
 * SIN CONTADOR DE REINTENTOS. El bloque garantiza una salida `fallback`
 * (condición `default`) para que nada quede sin respuesta, pero "al tercer
 * intento te paso con un humano" no es expresable con los 14 tipos de nodo:
 * requiere estado numérico y ramificación aritmética que el motor no tiene.
 * Ver .claude/ADR_CONTADOR_REINTENTOS.md.
 */
export function expandMenu(spec: MenuSpec): BlockExpansion {
  if (spec.opciones.length === 0) {
    throw new BlockExpansionError('Un menú necesita al menos una opción.', spec.id);
  }
  if (spec.opciones.length > MAX_FILAS) {
    throw new BlockExpansionError(
      `Un menú admite hasta ${MAX_FILAS} opciones (WhatsApp no muestra más); recibidas ${spec.opciones.length}. Divide el menú en dos niveles.`,
      spec.id,
    );
  }

  const idsRepetidos = spec.opciones.length !== new Set(spec.opciones.map((o) => o.id)).size;
  if (idsRepetidos) {
    throw new BlockExpansionError(
      'Dos opciones del menú comparten el mismo id: las transiciones serían ambiguas.',
      spec.id,
    );
  }

  const menu = nodeId(spec.id, 'menu');
  const usaBotones = spec.opciones.length <= MAX_BOTONES;

  const node: SendButtonsNode | SendListNode = usaBotones
    ? {
      id: menu,
      type: 'send_buttons',
      content: {
        text: spec.texto,
        buttons: spec.opciones.map((o) => ({ id: o.id, title: truncate(o.label, 20) })),
      },
      transitions: [],
    }
    : {
      id: menu,
      type: 'send_list',
      content: {
        text: spec.texto,
        button_label: truncate(spec.etiquetaBoton ?? 'Ver opciones', 20),
        sections: [
          {
            type: 'static',
            title: truncate(spec.tituloSeccion ?? 'Opciones', 24),
            items: spec.opciones.map((o) => ({
              id: o.id,
              title: truncate(o.label, 24),
              ...(o.descripcion ? { description: truncate(o.descripcion, 72) } : {}),
            })),
          },
        ],
      },
      transitions: [],
    };

  const outlets: BlockOutlet[] = spec.opciones.map((o) => ({
    id: `opcion:${o.id}`,
    label: o.label,
    fromNodeIds: [menu],
    // La condición depende de la presentación, pero el id de la opción es el
    // mismo en las dos — por eso cambiar de botones a lista al agregar una
    // cuarta opción no rompe el cableado que ya hizo el operador.
    condition: usaBotones
      ? { type: 'button', value: o.id }
      : { type: 'list_item', value: o.id },
  }));

  outlets.push({
    id: 'fallback',
    label: 'No entendí lo que escribió',
    fromNodeIds: [menu],
    condition: { type: 'default' },
  });

  return { nodes: [node], entryNodeId: menu, outlets };
}
