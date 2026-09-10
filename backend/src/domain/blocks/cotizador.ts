import type { FlowNode, SendButtonsNode, SendListNode, SendTextNode } from '@/domain/entities/flow';
import {
  BlockExpansionError,
  nodeId,
  truncate,
  type BlockExpansion,
  type CotizadorSpec,
} from './types';

/** Meta: máximo 3 botones (R-F16). */
const MAX_BOTONES = 3;
/** Meta: máximo 10 filas por send_list (R-F18). */
const MAX_FILAS = 10;

/**
 * Tope de hojas del árbol. No es un límite de Meta: es de sensatez. El árbol
 * crece como el producto de las opciones de cada parámetro, y un flow con
 * cientos de nodos generados es imposible de revisar en el canvas y pesado de
 * publicar. Si se pasa, el precio probablemente debería salir del catálogo
 * (bloque Consulta) y no de un cotizador.
 */
const MAX_HOJAS = 60;

/**
 * Bloque Cotizador: parámetros enumerados → precio determinista.
 *
 * ---------------------------------------------------------------------------
 * EL LÍMITE ES DEL MOTOR, NO DEL BLOQUE
 *
 * Los 14 tipos de nodo no computan nada: no hay operación aritmética ni
 * condición sobre un número. Un precio no se puede CALCULAR — solo se puede
 * LEER de una hoja del árbol de decisión.
 *
 * Por eso el cotizador se expande a un árbol: cada combinación de opciones
 * llega a su propio `send_text` con el precio escrito. Es determinista y
 * reproducible, que es lo que se pedía, pero tiene dos consecuencias que hay
 * que decir en voz alta:
 *
 *  1. El número de nodos es el PRODUCTO de las opciones de cada parámetro.
 *     2×2×2 son 8 hojas; 3×3×3 son 27. De ahí el tope de MAX_HOJAS.
 *  2. Precio unitario sí; precio × cantidad NO. "$1.50 por hoja" se puede;
 *     "$1.50 × 200 hojas = $300" no, porque no hay multiplicación. El patrón
 *     recomendado es dar el unitario y capturar la cantidad con un bloque
 *     Captura y escalado, para que el humano cierre.
 *
 * Ambas limitaciones se levantan con computación en el motor — el mismo ADR
 * que el contador de reintentos.
 */
export function expandCotizador(spec: CotizadorSpec): BlockExpansion {
  if (spec.parametros.length === 0) {
    throw new BlockExpansionError('Un cotizador necesita al menos un parámetro.', spec.id);
  }

  for (const p of spec.parametros) {
    if (p.opciones.length === 0) {
      throw new BlockExpansionError(
        `El parámetro "${p.clave}" no tiene opciones. El cotizador no admite respuesta libre: sin opciones enumeradas no hay hoja del árbol que leer.`,
        spec.id,
      );
    }
    if (p.opciones.length > MAX_FILAS) {
      throw new BlockExpansionError(
        `El parámetro "${p.clave}" tiene ${p.opciones.length} opciones; WhatsApp admite hasta ${MAX_FILAS}.`,
        spec.id,
      );
    }
  }

  const totalHojas = spec.parametros.reduce((acc, p) => acc * p.opciones.length, 1);
  if (totalHojas > MAX_HOJAS) {
    throw new BlockExpansionError(
      `Este cotizador genera ${totalHojas} combinaciones y el máximo es ${MAX_HOJAS}. ` +
        'Reduce parámetros u opciones, o resuelve el precio desde el catálogo en vez de un cotizador.',
      spec.id,
    );
  }

  // Toda combinación necesita precio: si falta una, el cliente llegaría a una
  // hoja sin respuesta. Se comprueba ANTES de generar un solo nodo.
  const combinaciones = cartesiano(spec.parametros.map((p) => p.opciones.map((o) => o.id)));
  const faltantes = combinaciones
    .map((c) => c.join('|'))
    .filter((clave) => spec.precios[clave] === undefined);
  if (faltantes.length > 0) {
    throw new BlockExpansionError(
      `Faltan precios para ${faltantes.length} combinación(es): ${faltantes.slice(0, 5).join(', ')}${faltantes.length > 5 ? '…' : ''}`,
      spec.id,
    );
  }

  const nodes: FlowNode[] = [];
  const hojas: string[] = [];

  /**
   * Construye el subárbol para el parámetro `depth`, dado el camino de
   * opciones ya elegidas. Devuelve el id del nodo raíz de ese subárbol.
   */
  function construir(depth: number, camino: string[]): string {
    const sufijoCamino = camino.length > 0 ? `_${camino.join('_')}` : '';

    // Hoja: se acabaron los parámetros, toca decir el precio.
    if (depth === spec.parametros.length) {
      const id = nodeId(spec.id, `precio${sufijoCamino}`);
      const precio = spec.precios[camino.join('|')];
      const hoja: SendTextNode = {
        id,
        type: 'send_text',
        content: { text: spec.plantillaResultado.replace(/\{\{precio\}\}/g, precio) },
        transitions: [],
      };
      nodes.push(hoja);
      hojas.push(id);
      return id;
    }

    const param = spec.parametros[depth];
    const id = nodeId(spec.id, `${param.clave}${sufijoCamino}`);

    // Los hijos se construyen primero: sus ids son el destino de las
    // transiciones de este nodo.
    const destinos = param.opciones.map((o) => construir(depth + 1, [...camino, o.id]));

    const usaBotones = param.opciones.length <= MAX_BOTONES;
    const node: SendButtonsNode | SendListNode = usaBotones
      ? {
        id,
        type: 'send_buttons',
        content: {
          text: param.pregunta,
          buttons: param.opciones.map((o) => ({ id: o.id, title: truncate(o.label, 20) })),
        },
        transitions: [],
      }
      : {
        id,
        type: 'send_list',
        content: {
          text: param.pregunta,
          button_label: 'Ver opciones',
          sections: [
            {
              type: 'static',
              title: truncate(param.clave, 24),
              items: param.opciones.map((o) => ({ id: o.id, title: truncate(o.label, 24) })),
            },
          ],
        },
        transitions: [],
      };

    node.transitions = param.opciones.map((o, i) => ({
      condition: usaBotones
        ? { type: 'button' as const, value: o.id }
        : { type: 'list_item' as const, value: o.id },
      next_node_id: destinos[i],
    }));
    // Sin `default` el nodo se quedaría re-renderizando ante texto libre.
    node.transitions.push({ condition: { type: 'default' }, next_node_id: id });

    nodes.push(node);
    return id;
  }

  const raiz = construir(0, []);

  return {
    nodes,
    entryNodeId: raiz,
    outlets: [
      {
        id: 'next',
        label: 'Después de dar el precio',
        // Todas las hojas convergen aquí: el operador cablea UNA salida, no
        // una por combinación.
        fromNodeIds: hojas,
        condition: { type: 'default' },
      },
    ],
  };
}

function cartesiano(listas: string[][]): string[][] {
  return listas.reduce<string[][]>(
    (acc, lista) => acc.flatMap((prefijo) => lista.map((x) => [...prefijo, x])),
    [[]],
  );
}
