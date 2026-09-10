/**
 * Un test por bloque compuesto.
 *
 * LA PRUEBA REAL ES "BLOQUE + CABLEADO MÍNIMO", no "bloque solo". Un bloque
 * aislado NO puede pasar el linter: por definición tiene salidas colgando, que
 * es justo lo que violan R-F04 y R-F05. La garantía es del ensamblaje.
 *
 * `pasaElLinter()` conecta todas las salidas del bloque a un Cierre y ensambla:
 * si el subgrafo generado estuviera mal, `assemble` lanza — valida contra Zod
 * (L2) y contra las reglas de estructura portadas (L1).
 *
 * Ver .claude/REGLAS_FLOW.md para los códigos R-F.
 */

import type { BotFlow } from '@/domain/entities/flow';
import { assemble, expandBlock, BlockExpansionError } from '@/domain/blocks/expandBlock';
import type { BlockSpec, BlockWiring, CierreSpec } from '@/domain/blocks/expandBlock';
import { checkGraphRules } from '@/domain/validators/graphRules';

const CIERRE: CierreSpec = { kind: 'cierre', id: 'fin', mensaje: 'Hasta luego.' };

/**
 * Ensambla `spec` + un Cierre, cableando TODAS sus salidas al Cierre.
 * Devuelve el flow ya validado por las dos capas.
 */
function pasaElLinter(spec: BlockSpec): BotFlow {
  const exp = expandBlock(spec);
  const wiring: BlockWiring[] = exp.outlets.map((o) => ({
    fromBlockId: spec.id,
    outletId: o.id,
    toBlockId: CIERRE.id,
  }));
  return assemble({ blocks: [spec, CIERRE], wiring, startBlockId: spec.id });
}

function nodo(flow: BotFlow, id: string) {
  const n = flow.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`No existe el nodo ${id}. Hay: ${flow.nodes.map((x) => x.id).join(', ')}`);
  return n;
}

// ============================================================================

describe('bloque Entrada', () => {
  const spec: BlockSpec = { kind: 'entrada', id: 'inicio' };

  it('pasa el linter con cableado mínimo', () => {
    expect(() => pasaElLinter(spec)).not.toThrow();
  });

  it('el saludo sale del traje, no del grafo (R-F31 por construcción)', () => {
    const flow = pasaElLinter(spec);
    const saludo = nodo(flow, 'inicio__saludo');

    // No hay copy que se pueda desincronizar del panel: el texto ES la variable.
    expect(saludo.type).toBe('send_text');
    if (saludo.type !== 'send_text') throw new Error('tipo inesperado');
    expect(saludo.content.text).toBe('{{welcome_message}}');
    expect(saludo.config_bound).toEqual(['welcome_message']);
  });
});

// ============================================================================

describe('bloque Menú', () => {
  const tresOpciones: BlockSpec = {
    kind: 'menu',
    id: 'principal',
    texto: '¿En qué te ayudo?',
    opciones: [
      { id: 'productos', label: 'Buscar un producto' },
      { id: 'horario', label: 'Horario y ubicación' },
      { id: 'humano', label: 'Hablar con alguien' },
    ],
  };

  it('pasa el linter con cableado mínimo', () => {
    expect(() => pasaElLinter(tresOpciones)).not.toThrow();
  });

  it('con 1-3 opciones usa botones (R-F16)', () => {
    const flow = pasaElLinter(tresOpciones);
    const menu = nodo(flow, 'principal__menu');

    expect(menu.type).toBe('send_buttons');
    if (menu.type !== 'send_buttons') throw new Error('tipo inesperado');
    expect(menu.content.buttons).toHaveLength(3);
  });

  it('con 4-10 opciones cambia a lista (R-F17), sin que el operador lo pida', () => {
    const flow = pasaElLinter({
      ...tresOpciones,
      opciones: [
        ...tresOpciones.kind === 'menu' ? tresOpciones.opciones : [],
        { id: 'cuarta', label: 'Otra cosa' },
      ],
    } as BlockSpec);
    const menu = nodo(flow, 'principal__menu');

    expect(menu.type).toBe('send_list');
    if (menu.type !== 'send_list') throw new Error('tipo inesperado');
    expect(menu.content.sections[0].type).toBe('static');
  });

  it('trunca los títulos al límite de Meta en vez de dejar que reviente al publicar', () => {
    const flow = pasaElLinter({
      kind: 'menu',
      id: 'principal',
      texto: 'Elige',
      opciones: [{ id: 'a', label: 'Un texto larguísimo que no cabe en un botón de WhatsApp' }],
    });
    const menu = nodo(flow, 'principal__menu');
    if (menu.type !== 'send_buttons') throw new Error('tipo inesperado');

    expect(menu.content.buttons[0].title).toHaveLength(20);
  });

  it('siempre emite una salida de fallback: nada queda sin respuesta', () => {
    const exp = expandBlock(tresOpciones);
    const fallback = exp.outlets.find((o) => o.id === 'fallback');

    expect(fallback).toBeDefined();
    expect(fallback?.condition).toEqual({ type: 'default' });
  });

  it('el id de la opción no cambia al pasar de botones a lista', () => {
    const conBotones = expandBlock(tresOpciones);
    const conLista = expandBlock({
      ...tresOpciones,
      opciones: [
        ...(tresOpciones.kind === 'menu' ? tresOpciones.opciones : []),
        { id: 'cuarta', label: 'Otra' },
      ],
    } as BlockSpec);

    // El cableado que ya hizo el operador sobrevive a agregar una opción.
    const idsBotones = conBotones.outlets.map((o) => o.id);
    for (const id of idsBotones) {
      expect(conLista.outlets.map((o) => o.id)).toContain(id);
    }
  });

  it('rechaza más de 10 opciones al expandir, no al publicar', () => {
    const once = Array.from({ length: 11 }, (_, i) => ({ id: `o${i}`, label: `Opción ${i}` }));
    expect(() => expandBlock({ ...tresOpciones, opciones: once } as BlockSpec)).toThrow(
      BlockExpansionError,
    );
  });

  it('rechaza dos opciones con el mismo id (transiciones ambiguas)', () => {
    expect(() =>
      expandBlock({
        kind: 'menu',
        id: 'principal',
        texto: 'Elige',
        opciones: [
          { id: 'dup', label: 'Una' },
          { id: 'dup', label: 'Otra' },
        ],
      }),
    ).toThrow(BlockExpansionError);
  });
});

// ============================================================================

describe('bloque Consulta de catálogo', () => {
  const spec: BlockSpec = {
    kind: 'consulta_catalogo',
    id: 'buscar',
    prompt: '¿Qué producto buscas?',
  };

  it('pasa el linter con cableado mínimo', () => {
    expect(() => pasaElLinter(spec)).not.toThrow();
  });

  it('obliga a decidir qué pasa cuando NO se encuentra (cero escalado ciego)', () => {
    const exp = expandBlock(spec);

    expect(exp.outlets.map((o) => o.id).sort()).toEqual(['encontrado', 'no_encontrado']);
  });

  it('guarda el id del producto en selected_product_id por defecto', () => {
    const exp = expandBlock(spec);
    const encontrado = exp.outlets.find((o) => o.id === 'encontrado');

    expect(encontrado?.condition).toEqual({
      type: 'catalog_found',
      save_to_context: 'selected_product_id',
    });
  });

  it('dejar no_encontrado sin cablear rompe el ensamblaje', () => {
    expect(() =>
      assemble({
        blocks: [spec, CIERRE],
        wiring: [{ fromBlockId: 'buscar', outletId: 'encontrado', toBlockId: 'fin' }],
        startBlockId: 'buscar',
      }),
    ).toThrow(/sin conectar/);
  });
});

// ============================================================================

describe('bloque Captura y escalado', () => {
  const spec: BlockSpec = {
    kind: 'captura_escalado',
    id: 'cotizacion',
    datos: [
      { clave: 'nombre', pregunta: '¿Cómo te llamas?' },
      { clave: 'articulo', pregunta: '¿Qué necesitas?' },
    ],
    resumen: 'Anoté: {{nombre}} pide {{articulo}}.',
    respuestaCliente: 'Listo, te contactamos.',
    avisoDueno: 'Lead: {{nombre}} — {{articulo}} — {{phone}}',
  };

  it('pasa el linter con cableado mínimo', () => {
    expect(() => pasaElLinter(spec)).not.toThrow();
  });

  it('pide un dato por turno, cada uno a su propia clave de contexto', () => {
    const flow = pasaElLinter(spec);
    const d0 = nodo(flow, 'cotizacion__dato_0');
    const d1 = nodo(flow, 'cotizacion__dato_1');

    if (d0.type !== 'wait_input' || d1.type !== 'wait_input') throw new Error('tipo inesperado');
    expect(d0.content.save_to_context).toBe('nombre');
    expect(d1.content.save_to_context).toBe('articulo');
  });

  it('el aviso al dueño viaja con el contexto: el escalado no es ciego', () => {
    const flow = pasaElLinter(spec);
    const escalado = nodo(flow, 'cotizacion__escalado');

    if (escalado.type !== 'escape_to_human') throw new Error('tipo inesperado');
    expect(escalado.content.owner_alert_template).toContain('{{nombre}}');
    expect(escalado.content.owner_alert_template).toContain('{{phone}}');
  });

  it('el ciclo de "corregir" es deliberado: warning de R-F13, nunca error', () => {
    const flow = pasaElLinter(spec);
    const issues = checkGraphRules(flow);
    const ciclo = issues.find((i) => i.code === 'cycle_detected');

    expect(ciclo).toBeDefined();
    expect(ciclo?.severity).toBe('warning');
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('rechaza dos datos con la misma clave (el segundo pisaría al primero)', () => {
    expect(() =>
      expandBlock({
        ...spec,
        datos: [
          { clave: 'x', pregunta: 'Uno' },
          { clave: 'x', pregunta: 'Dos' },
        ],
      } as BlockSpec),
    ).toThrow(BlockExpansionError);
  });
});

// ============================================================================

describe('bloque Cotizador', () => {
  const spec: BlockSpec = {
    kind: 'cotizador',
    id: 'impresion',
    parametros: [
      {
        clave: 'tamano',
        pregunta: '¿Qué tamaño?',
        opciones: [
          { id: 'carta', label: 'Carta' },
          { id: 'oficio', label: 'Oficio' },
        ],
      },
      {
        clave: 'color',
        pregunta: '¿Color o blanco y negro?',
        opciones: [
          { id: 'bn', label: 'Blanco y negro' },
          { id: 'color', label: 'Color' },
        ],
      },
    ],
    precios: {
      'carta|bn': '$1.50 por hoja',
      'carta|color': '$5.00 por hoja',
      'oficio|bn': '$2.00 por hoja',
      'oficio|color': '$6.00 por hoja',
    },
    plantillaResultado: 'Sale en {{precio}}. ¿Cuántas necesitas?',
  };

  it('pasa el linter con cableado mínimo', () => {
    expect(() => pasaElLinter(spec)).not.toThrow();
  });

  it('genera una hoja por combinación, con su precio escrito', () => {
    const flow = pasaElLinter(spec);
    const hoja = nodo(flow, 'impresion__precio_carta_color');

    if (hoja.type !== 'send_text') throw new Error('tipo inesperado');
    expect(hoja.content.text).toBe('Sale en $5.00 por hoja. ¿Cuántas necesitas?');
  });

  it('todas las hojas convergen en UNA salida, no una por combinación', () => {
    const exp = expandBlock(spec);

    expect(exp.outlets).toHaveLength(1);
    expect(exp.outlets[0].fromNodeIds).toHaveLength(4);
  });

  it('rechaza una combinación sin precio antes de generar un solo nodo', () => {
    const sinUno = { ...spec, precios: { ...(spec as { precios: Record<string, string> }).precios } };
    delete (sinUno as { precios: Record<string, string> }).precios['oficio|color'];

    expect(() => expandBlock(sinUno as BlockSpec)).toThrow(/Faltan precios/);
  });

  it('rechaza un parámetro sin opciones: no hay aritmética que valga', () => {
    expect(() =>
      expandBlock({
        ...spec,
        parametros: [{ clave: 'cantidad', pregunta: '¿Cuántas?', opciones: [] }],
      } as BlockSpec),
    ).toThrow(BlockExpansionError);
  });

  it('rechaza un árbol que explota en combinaciones', () => {
    const seisOpciones = Array.from({ length: 6 }, (_, i) => ({ id: `o${i}`, label: `O${i}` }));
    const precios: Record<string, string> = {};
    expect(() =>
      expandBlock({
        kind: 'cotizador',
        id: 'grande',
        parametros: [
          { clave: 'a', pregunta: 'a', opciones: seisOpciones },
          { clave: 'b', pregunta: 'b', opciones: seisOpciones },
          { clave: 'c', pregunta: 'c', opciones: seisOpciones },
        ],
        precios,
        plantillaResultado: '{{precio}}',
      }),
    ).toThrow(/combinaciones/);
  });
});

// ============================================================================

describe('bloque Cierre', () => {
  const spec: BlockSpec = { kind: 'cierre', id: 'adios', mensaje: 'Gracias por escribir.' };

  it('pasa el linter por sí solo: es el único bloque sin salidas', () => {
    expect(() =>
      assemble({ blocks: [spec], wiring: [], startBlockId: 'adios' }),
    ).not.toThrow();
  });

  it('emite un end sin transiciones (R-F10) y alcanzable (R-F07)', () => {
    const flow = assemble({ blocks: [spec], wiring: [], startBlockId: 'adios' });
    const fin = nodo(flow, 'adios__fin');

    expect(fin.type).toBe('end');
    expect(fin.transitions).toEqual([]);
    expect(checkGraphRules(flow).filter((i) => i.severity === 'error')).toEqual([]);
  });
});
