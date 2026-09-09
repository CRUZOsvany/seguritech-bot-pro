import type { BotFlow, FlowNode, Transition } from '@/domain/entities/flow';
import { validateFlow } from '@/domain/validators/flowSchema';
import { graphErrors } from '@/domain/validators/graphRules';
import { expandBlock } from './expandBlock';
import { BlockExpansionError, type BlockSpec } from './types';

/**
 * Cableado de una salida de bloque hacia la entrada de otro.
 */
export interface BlockWiring {
  fromBlockId: string;
  /** Id del outlet, tal como lo declara el bloque: 'next', 'fallback', 'opcion:x'. */
  outletId: string;
  toBlockId: string;
}

export interface AssembleParams {
  blocks: BlockSpec[];
  wiring: BlockWiring[];
  startBlockId: string;
}

/**
 * Ensambla bloques en un `BotFlow` completo y válido.
 *
 * Aquí es donde se cumplen las garantías, no en cada bloque suelto: un bloque
 * aislado siempre tiene salidas colgando (violaría R-F04/R-F05 por
 * definición). El ensamblador exige que TODAS estén cableadas y solo entonces
 * el grafo puede pasar el linter.
 *
 * Valida contra las dos capas antes de devolver nada:
 *  - `validateFlow` (Zod, L2): límites de Meta y estructura del backend.
 *  - `graphErrors` (L1 portada): que exista un `end` alcanzable (R-F07).
 *
 * Los warnings de R-F11..R-F14 NO bloquean — igual que en el canvas. El ciclo
 * de "corregir" del bloque Captura es uno de ellos y es deliberado.
 */
export function assemble(params: AssembleParams): BotFlow {
  const { blocks, wiring, startBlockId } = params;

  if (blocks.length === 0) {
    throw new BlockExpansionError('No hay bloques que ensamblar.', '');
  }

  const idsBloque = blocks.map((b) => b.id);
  if (new Set(idsBloque).size !== idsBloque.length) {
    throw new BlockExpansionError(
      'Dos bloques comparten el mismo id: sus nodos colisionarían.',
      '',
    );
  }
  if (!idsBloque.includes(startBlockId)) {
    throw new BlockExpansionError(
      `El bloque de inicio "${startBlockId}" no está en la lista de bloques.`,
      startBlockId,
    );
  }

  const expansiones = new Map(blocks.map((b) => [b.id, expandBlock(b)]));

  // Índice del cableado, con detección de duplicados: dos destinos para la
  // misma salida es ambiguo y se rechaza en vez de elegir uno en silencio.
  const destino = new Map<string, string>();
  for (const w of wiring) {
    const clave = `${w.fromBlockId}#${w.outletId}`;
    if (destino.has(clave)) {
      throw new BlockExpansionError(
        `La salida "${w.outletId}" del bloque "${w.fromBlockId}" está cableada dos veces.`,
        w.fromBlockId,
      );
    }
    if (!expansiones.has(w.toBlockId)) {
      throw new BlockExpansionError(
        `La salida "${w.outletId}" apunta al bloque "${w.toBlockId}", que no existe.`,
        w.fromBlockId,
      );
    }
    destino.set(clave, w.toBlockId);
  }

  // Toda salida tiene que ir a algún lado. Es lo que convierte un montón de
  // subgrafos con puntas sueltas en un flow que cumple R-F04 y R-F05.
  const sinCablear: string[] = [];
  for (const [blockId, exp] of expansiones) {
    for (const outlet of exp.outlets) {
      if (!destino.has(`${blockId}#${outlet.id}`)) {
        sinCablear.push(`${blockId}.${outlet.id} (${outlet.label})`);
      }
    }
  }
  if (sinCablear.length > 0) {
    throw new BlockExpansionError(
      `Hay salidas sin conectar: ${sinCablear.join(', ')}. Toda salida necesita destino.`,
      sinCablear[0].split('.')[0],
    );
  }

  // Cablear: por cada outlet, añadir la transición a los nodos de origen.
  const porId = new Map<string, FlowNode>();
  for (const exp of expansiones.values()) {
    for (const n of exp.nodes) porId.set(n.id, n);
  }

  for (const [blockId, exp] of expansiones) {
    for (const outlet of exp.outlets) {
      const targetBlock = destino.get(`${blockId}#${outlet.id}`) as string;
      const entrada = expansiones.get(targetBlock)!.entryNodeId;
      const transicion: Transition = {
        condition: outlet.condition,
        next_node_id: entrada,
      };
      for (const fromId of outlet.fromNodeIds) {
        const node = porId.get(fromId);
        if (!node) {
          throw new BlockExpansionError(
            `La salida "${outlet.id}" dice salir de "${fromId}", que no está en el subgrafo.`,
            blockId,
          );
        }
        node.transitions = [...node.transitions, transicion];
      }
    }
  }

  const flow: BotFlow = {
    version: '1.0',
    start_node_id: expansiones.get(startBlockId)!.entryNodeId,
    nodes: [...porId.values()],
  };

  // L2: Zod. Lanza FlowValidationError con el detalle.
  const validado = validateFlow(flow);

  // L1 portada: solo los errores (R-F07). Los warnings son informativos.
  const errores = graphErrors(validado);
  if (errores.length > 0) {
    throw new BlockExpansionError(
      `El grafo ensamblado tiene errores de estructura: ${errores.map((e) => e.message).join(' · ')}`,
      '',
    );
  }

  return validado;
}
