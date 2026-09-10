import type { FlowNode, TransitionCondition } from '@/domain/entities/flow';

/**
 * Bloques compuestos: plantillas de subgrafo sobre los 14 tipos de nodo.
 *
 * El operador no arma nodos sueltos — elige un bloque y lo rellena. Cada
 * bloque se expande a un subgrafo que ya cumple por construcción las reglas
 * estructurales y de forma del catálogo (.claude/REGLAS_FLOW.md).
 *
 * NO se añade ningún tipo de nodo nuevo. El motor no se toca.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ LOS BLOQUES DEJAN SALIDAS COLGANDO
 *
 * Un bloque aislado NO puede pasar el linter, y eso es correcto: por
 * definición tiene salidas sin destino, que es justo lo que violan R-F04
 * (transición sin `next_node_id`) y R-F05 (transición a nodo inexistente).
 *
 * Por eso `expandBlock` no devuelve transiciones completas: devuelve
 * `outlets` — salidas nombradas que el ensamblador cablea. La garantía de
 * "pasa el linter" es del ENSAMBLAJE (`assemble.ts`), no del bloque suelto.
 * Los tests por bloque prueban "bloque + cableado mínimo", no "bloque solo".
 */

export type BlockKind =
  | 'entrada'
  | 'menu'
  | 'consulta_catalogo'
  | 'captura_escalado'
  | 'cotizador'
  | 'cierre';

/**
 * Una salida del bloque, todavía sin destino. El ensamblador la convierte en
 * una `Transition` real cuando sabe a qué bloque conecta.
 */
export interface BlockOutlet {
  /** Estable dentro del bloque: 'next', 'fallback', 'opcion:<id>'. */
  id: string;
  /** Etiqueta legible, para que la interfaz muestre a dónde va cada salida. */
  label: string;
  /**
   * Nodos del subgrafo de los que sale esta transición. Casi siempre uno.
   * El Cotizador es la excepción: su árbol de decisión termina en muchas
   * hojas que vuelven al mismo sitio, y sin esto el operador tendría que
   * cablear una salida por combinación de parámetros.
   */
  fromNodeIds: string[];
  condition: TransitionCondition;
}

export interface BlockExpansion {
  /** Nodos del subgrafo. Sus ids ya vienen prefijados con el id del bloque. */
  nodes: FlowNode[];
  /** Por dónde se entra al bloque. */
  entryNodeId: string;
  /** Salidas pendientes de cablear. */
  outlets: BlockOutlet[];
}

// ============================================================================
// ESPECIFICACIONES POR BLOQUE
// ============================================================================

export interface BlockBase {
  /**
   * Id del bloque, único en el flow. Prefija los ids de todos sus nodos, que
   * es como se garantiza R-F03 (ids únicos) sin coordinación global.
   */
  id: string;
}

/**
 * Saludo de bienvenida. El texto NO se escribe aquí: es siempre
 * `{{welcome_message}}` del traje del tenant, con `config_bound` declarado —
 * así el bloque cumple R-F31 por construcción y cambiar el saludo no obliga a
 * publicar una versión nueva del flujo.
 */
export interface EntradaSpec extends BlockBase {
  kind: 'entrada';
}

export interface MenuOpcion {
  /** Id estable de la opción; es el `value` de la transición `button`/`list_item`. */
  id: string;
  /** Lo que ve el cliente. Se trunca al límite de Meta según la presentación. */
  label: string;
  /** Solo para presentación de lista: subtítulo bajo la opción. */
  descripcion?: string;
}

/**
 * Menú principal. La presentación la decide el número de opciones, no el
 * operador: 1-3 botones (R-F16), 4-10 lista de una sección (R-F17/R-F18).
 * Más de 10 no cabe en WhatsApp y la expansión falla en vez de generar un
 * nodo que Meta rechazaría al publicar.
 */
export interface MenuSpec extends BlockBase {
  kind: 'menu';
  texto: string;
  /** Solo se usa en presentación de lista. Default: 'Ver opciones'. */
  etiquetaBoton?: string;
  /** Solo se usa en presentación de lista. Default: 'Opciones'. */
  tituloSeccion?: string;
  opciones: MenuOpcion[];
}

/**
 * Búsqueda de producto en texto libre. Dos salidas obligatorias, que es lo que
 * impide el escalado ciego: sin match el flow NUNCA inventa, va a donde el
 * autor decida (típicamente escalado).
 */
export interface ConsultaCatalogoSpec extends BlockBase {
  kind: 'consulta_catalogo';
  prompt: string;
  /** Clave de contexto donde cae el id del producto. Default 'selected_product_id'. */
  guardarEn?: string;
}

export interface DatoCaptura {
  /** Clave de contexto. También se usa como `{{clave}}` en el resumen. */
  clave: string;
  /** La pregunta que se le hace al cliente en su propio turno. */
  pregunta: string;
}

/**
 * Pide N datos, uno por turno, los resume, pide confirmación y escala.
 *
 * La salida `corregir` vuelve al primer dato: es un ciclo deliberado y con
 * salida, así que dispara R-F13 (warning) a propósito. Ver BLOQUES_COMPUESTOS.md.
 */
export interface CapturaEscaladoSpec extends BlockBase {
  kind: 'captura_escalado';
  datos: DatoCaptura[];
  /** Texto del resumen. Puede usar {{clave}} de los datos capturados. */
  resumen: string;
  /** Lo que se le responde al cliente al escalar. */
  respuestaCliente: string;
  /** Plantilla del aviso al dueño. Puede usar {{clave}} y {{phone}}. */
  avisoDueno: string;
}

export interface CotizadorParametro {
  clave: string;
  pregunta: string;
  /** Opciones enumeradas. El cotizador es un árbol de decisión, no aritmética. */
  opciones: MenuOpcion[];
}

/**
 * Cotizador por parámetros enumerados.
 *
 * LÍMITE DURO, y es del motor, no del bloque: los 14 tipos de nodo no computan
 * nada. No hay nodo de operación aritmética ni condición sobre un número, así
 * que un precio NO se puede calcular — solo se puede LEER de una hoja del
 * árbol. Por eso todos los parámetros deben ser opciones enumeradas y el
 * precio de cada combinación se escribe en `precios`.
 *
 * Consecuencia práctica: precio unitario sí, precio × cantidad no. Para eso
 * hace falta computación en el motor — mismo ADR que el contador de reintentos.
 */
export interface CotizadorSpec extends BlockBase {
  kind: 'cotizador';
  parametros: CotizadorParametro[];
  /**
   * Precio por combinación. La clave es el join de los ids de opción en el
   * orden de `parametros`, separados por '|'. Ej: 'carta|bn|una_cara'.
   * Toda combinación posible debe estar presente.
   */
  precios: Record<string, string>;
  /** Texto de la hoja. `{{precio}}` se sustituye por el valor de `precios`. */
  plantillaResultado: string;
}

export interface CierreSpec extends BlockBase {
  kind: 'cierre';
  mensaje: string;
}

export type BlockSpec =
  | EntradaSpec
  | MenuSpec
  | ConsultaCatalogoSpec
  | CapturaEscaladoSpec
  | CotizadorSpec
  | CierreSpec;

/**
 * Un bloque no se pudo expandir a un subgrafo válido. Se lanza en la
 * expansión, no al publicar: el objetivo es que el operador se entere en el
 * momento, no después del round-trip.
 */
export class BlockExpansionError extends Error {
  constructor(
    message: string,
    readonly blockId: string,
  ) {
    super(message);
    this.name = 'BlockExpansionError';
  }
}

/** Ids de nodo prefijados por bloque — así R-F03 sale gratis. */
export function nodeId(blockId: string, suffix: string): string {
  return `${blockId}__${suffix}`;
}

/** Trunca respetando el límite de Meta que aplique. */
export function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}
