/**
 * Ensamblaje: de una lista de bloques a un BotFlow publicable.
 *
 * Aquí es donde se cumplen las garantías. Un bloque suelto siempre tiene
 * salidas colgando; solo el ensamblaje las cierra y produce un grafo que pasa
 * las dos capas de validación (Zod y las reglas de estructura portadas).
 */

import { assemble, BlockExpansionError } from '@/domain/blocks/expandBlock';
import type { BlockSpec, BlockWiring } from '@/domain/blocks/expandBlock';
import { checkGraphRules } from '@/domain/validators/graphRules';
import { FlowValidationError } from '@/domain/validators/flowSchema';

/** Un bot de papelería mínimo pero completo, armado solo con bloques. */
const BLOQUES: BlockSpec[] = [
  { kind: 'entrada', id: 'inicio' },
  {
    kind: 'menu',
    id: 'menu',
    texto: '¿En qué te ayudo?',
    opciones: [
      { id: 'buscar', label: 'Buscar producto' },
      { id: 'impresiones', label: 'Impresiones' },
      { id: 'humano', label: 'Hablar con alguien' },
    ],
  },
  { kind: 'consulta_catalogo', id: 'catalogo', prompt: '¿Qué producto buscas?' },
  {
    kind: 'cotizador',
    id: 'impresion',
    parametros: [
      {
        clave: 'color',
        pregunta: '¿Color o blanco y negro?',
        opciones: [
          { id: 'bn', label: 'Blanco y negro' },
          { id: 'color', label: 'Color' },
        ],
      },
    ],
    precios: { bn: '$1.50 por hoja', color: '$5.00 por hoja' },
    plantillaResultado: 'Sale en {{precio}}.',
  },
  {
    kind: 'captura_escalado',
    id: 'lead',
    datos: [{ clave: 'necesidad', pregunta: '¿Qué necesitas exactamente?' }],
    resumen: 'Anoté: {{necesidad}}',
    respuestaCliente: 'Gracias, te contactamos en breve.',
    avisoDueno: 'Lead de {{phone}}: {{necesidad}}',
  },
  { kind: 'cierre', id: 'fin', mensaje: '¡Gracias por escribir!' },
];

const CABLEADO: BlockWiring[] = [
  { fromBlockId: 'inicio', outletId: 'next', toBlockId: 'menu' },
  { fromBlockId: 'menu', outletId: 'opcion:buscar', toBlockId: 'catalogo' },
  { fromBlockId: 'menu', outletId: 'opcion:impresiones', toBlockId: 'impresion' },
  { fromBlockId: 'menu', outletId: 'opcion:humano', toBlockId: 'lead' },
  // El fallback del menú va a escalado: nada queda sin respuesta.
  { fromBlockId: 'menu', outletId: 'fallback', toBlockId: 'lead' },
  { fromBlockId: 'catalogo', outletId: 'encontrado', toBlockId: 'fin' },
  // Sin match, escalar. El flow nunca inventa.
  { fromBlockId: 'catalogo', outletId: 'no_encontrado', toBlockId: 'lead' },
  { fromBlockId: 'impresion', outletId: 'next', toBlockId: 'lead' },
  { fromBlockId: 'lead', outletId: 'next', toBlockId: 'fin' },
];

function armar() {
  return assemble({ blocks: BLOQUES, wiring: CABLEADO, startBlockId: 'inicio' });
}

describe('assemble — un bot completo desde bloques', () => {
  it('produce un flow que pasa las dos capas de validación', () => {
    expect(() => armar()).not.toThrow();
  });

  it('no deja ni un error de estructura (R-F07 incluida)', () => {
    const errores = checkGraphRules(armar()).filter((i) => i.severity === 'error');

    expect(errores).toEqual([]);
  });

  it('arranca en la entrada del bloque de inicio', () => {
    expect(armar().start_node_id).toBe('inicio__saludo');
  });

  it('los ids de nodo no colisionan entre bloques (R-F03)', () => {
    const ids = armar().nodes.map((n) => n.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ningún nodo queda huérfano: todo es alcanzable desde el inicio', () => {
    const huerfanos = checkGraphRules(armar()).filter((i) => i.code === 'unreachable_node');

    expect(huerfanos).toEqual([]);
  });

  it('el único ciclo es el de "corregir", y es warning', () => {
    const issues = checkGraphRules(armar());
    const ciclos = issues.filter((i) => i.code === 'cycle_detected');

    expect(ciclos).toHaveLength(1);
    expect(ciclos[0].severity).toBe('warning');
  });
});

describe('assemble — lo que rechaza', () => {
  it('una salida sin cablear', () => {
    expect(() =>
      assemble({
        blocks: BLOQUES,
        wiring: CABLEADO.filter((w) => w.outletId !== 'fallback'),
        startBlockId: 'inicio',
      }),
    ).toThrow(/sin conectar/);
  });

  it('la misma salida cableada dos veces (ambigüedad silenciosa)', () => {
    expect(() =>
      assemble({
        blocks: BLOQUES,
        wiring: [...CABLEADO, { fromBlockId: 'inicio', outletId: 'next', toBlockId: 'fin' }],
        startBlockId: 'inicio',
      }),
    ).toThrow(/cableada dos veces/);
  });

  it('una salida que apunta a un bloque inexistente', () => {
    expect(() =>
      assemble({
        blocks: BLOQUES,
        wiring: CABLEADO.map((w) =>
          w.outletId === 'fallback' ? { ...w, toBlockId: 'no_existe' } : w,
        ),
        startBlockId: 'inicio',
      }),
    ).toThrow(/no existe/);
  });

  it('dos bloques con el mismo id', () => {
    expect(() =>
      assemble({
        blocks: [...BLOQUES, { kind: 'cierre', id: 'fin', mensaje: 'otro' }],
        wiring: CABLEADO,
        startBlockId: 'inicio',
      }),
    ).toThrow(BlockExpansionError);
  });

  it('un bloque de inicio que no está en la lista', () => {
    expect(() =>
      assemble({ blocks: BLOQUES, wiring: CABLEADO, startBlockId: 'fantasma' }),
    ).toThrow(BlockExpansionError);
  });

  it('un flow sin ningún Cierre: no habría end que alcanzar', () => {
    // Sin bloque Cierre, Zod se queja antes (R-F06) — el punto es que el
    // ensamblaje NO deja pasar un flujo que nunca termina.
    expect(() =>
      assemble({
        blocks: [
          { kind: 'entrada', id: 'inicio' },
          { kind: 'menu', id: 'menu', texto: 'Hola', opciones: [{ id: 'a', label: 'A' }] },
        ],
        wiring: [
          { fromBlockId: 'inicio', outletId: 'next', toBlockId: 'menu' },
          { fromBlockId: 'menu', outletId: 'opcion:a', toBlockId: 'menu' },
          { fromBlockId: 'menu', outletId: 'fallback', toBlockId: 'menu' },
        ],
        startBlockId: 'inicio',
      }),
    ).toThrow(FlowValidationError);
  });
});
