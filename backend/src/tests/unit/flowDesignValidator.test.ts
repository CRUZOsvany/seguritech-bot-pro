/**
 * Validador de diseño del Studio (Fase 2). Un caso que dispara cada regla y
 * uno que no (criterio de aceptación de la fase), sobre un flow mínimo que
 * pasa limpio.
 */
import type { BotFlow, FlowNode, TransitionCondition } from '@/domain/entities/flow';
import { validateFlowDesign } from '@/domain/validation/flowDesignValidator';

function base(): BotFlow {
  return {
    version: '1.0',
    start_node_id: 'menu',
    nodes: [
      {
        id: 'menu',
        type: 'send_buttons',
        content: { text: 'Hola, ¿qué necesitas?', buttons: [{ id: 'info', title: 'Info' }, { id: 'humano', title: 'Hablar con alguien' }] },
        transitions: [
          { condition: { type: 'button', value: 'info' }, next_node_id: 'info' },
          { condition: { type: 'button', value: 'humano' }, next_node_id: 'humano' },
          { condition: { type: 'default' }, next_node_id: 'menu' },
        ],
      },
      { id: 'info', type: 'send_text', content: { text: 'Abrimos de 9 a 7.' }, transitions: [{ condition: { type: 'default' }, next_node_id: 'fin' }] },
      {
        id: 'humano',
        type: 'escape_to_human',
        content: { user_response: 'Te comunico con alguien.', owner_alert_template: 'Cliente {{phone}} pide ayuda' },
        transitions: [{ condition: { type: 'default' }, next_node_id: 'fin' }],
      },
      { id: 'fin', type: 'end', content: {}, transitions: [] },
    ],
  };
}

/** Copia del flow base con cambios, para no compartir estado entre casos. */
function flowWith(change: (f: BotFlow) => void): BotFlow {
  const f = structuredClone(base());
  change(f);
  return f;
}
/** Vista editable de un paso del flow base: los tests cambian texto, botones y salidas. */
interface EditableNode {
  id: string;
  content: { text: string; buttons: Array<{ id: string; title: string }> };
  transitions: Array<{ condition: TransitionCondition; next_node_id: string }>;
}
const node = (f: BotFlow, id: string) => f.nodes.find((n) => n.id === id) as unknown as EditableNode;
const codes = (f: unknown) => validateFlowDesign(f).issues.map((i) => `${i.level}:${i.code}`);

describe('validateFlowDesign', () => {
  it('el flow base pasa limpio, y también el schema', () => {
    expect(validateFlowDesign(base())).toEqual({
      ok: true,
      summary: { errors: 0, warnings: 0 },
      issues: [],
      schema: { ok: true, issues: [] },
    });
  });

  it('V-FORMA: sin lista de pasos no se puede revisar nada más', () => {
    const report = validateFlowDesign({ version: '1.0', start_node_id: 'x' });
    expect(report.ok).toBe(false);
    expect(report.issues).toEqual([expect.objectContaining({ code: 'V-FORMA', level: 'error' })]);
    expect(report.schema.ok).toBe(false);
  });

  describe('estructura', () => {
    it('V-EST-08: inicio inexistente', () => {
      expect(codes(flowWith((f) => { f.start_node_id = 'nope'; }))).toContain('error:V-EST-08');
    });

    it('V-EST-08: ningún camino llega al fin', () => {
      const f = flowWith((f) => {
        f.nodes = f.nodes.filter((n) => n.id !== 'fin');
        node(f, 'info').transitions = [{ condition: { type: 'default' }, next_node_id: 'menu' }];
        node(f, 'humano').transitions = [{ condition: { type: 'default' }, next_node_id: 'menu' }];
      });
      expect(codes(f)).toContain('error:V-EST-08');
    });

    it('V-EST-02: salida a un paso que no existe', () => {
      const f = flowWith((f) => { node(f, 'info').transitions = [{ condition: { type: 'default' }, next_node_id: 'fantasma' }]; });
      expect(codes(f)).toContain('error:V-EST-02');
      expect(codes(base())).not.toContain('error:V-EST-02');
    });

    it('V-EST-01: paso sin salida, con aviso especial para el paso a humano', () => {
      const f = flowWith((f) => { node(f, 'humano').transitions = []; });
      const report = validateFlowDesign(f);
      expect(report.issues).toContainEqual(expect.objectContaining({ code: 'V-EST-01', nodeId: 'humano' }));
      expect(report.issues.find((i) => i.code === 'V-EST-01')?.message).toMatch(/volvería a escalar/);
    });

    it('V-EST-03: paso huérfano es advertencia, no error', () => {
      const f = flowWith((f) => {
        f.nodes.push({ id: 'huerfano', type: 'send_text', content: { text: 'x' }, transitions: [{ condition: { type: 'default' }, next_node_id: 'fin' }] });
      });
      const report = validateFlowDesign(f);
      expect(report.ok).toBe(true);
      expect(codes(f)).toContain('warning:V-EST-03');
    });

    it('V-EST-04: dos botones con el mismo id', () => {
      const f = flowWith((f) => { node(f, 'menu').content.buttons[1].id = 'info'; });
      expect(codes(f)).toContain('error:V-EST-04');
    });

    it('V-EST-05: variable que ningún paso guarda; con quien la guarde, pasa', () => {
      const sin = flowWith((f) => { node(f, 'info').content.text = 'Tu pedido: {{misterio}}'; });
      expect(codes(sin)).toContain('error:V-EST-05');

      const con = flowWith((f) => {
        node(f, 'info').content.text = 'Tu pedido: {{misterio}}';
        node(f, 'menu').transitions[0].next_node_id = 'captura';
        f.nodes.push({
          id: 'captura',
          type: 'wait_input',
          content: { prompt: '¿Qué buscas?', save_to_context: 'misterio' },
          transitions: [{ condition: { type: 'default' }, next_node_id: 'info' }],
        });
      });
      expect(codes(con)).not.toContain('error:V-EST-05');
    });

    it('V-EST-05: {{selected_product_name}} sin búsqueda ni carrusel que guarde el producto', () => {
      const f = flowWith((f) => { node(f, 'info').content.text = 'Elegiste {{selected_product_name}}'; });
      expect(validateFlowDesign(f).issues.find((i) => i.code === 'V-EST-05')?.message).toMatch(/saldría vacío/);
    });

    it('V-EST-05: las variables del negocio no necesitan fuente', () => {
      const f = flowWith((f) => { node(f, 'info').content.text = '{{nombre_negocio}} abre de 9 a 7. Tu número: {{phone}}'; });
      expect(codes(f)).not.toContain('error:V-EST-05');
    });

    it('V-EST-06: pasos que se encadenan solos en círculo', () => {
      const f = flowWith((f) => {
        node(f, 'info').transitions = [{ condition: { type: 'default' }, next_node_id: 'otro' }];
        f.nodes.push({ id: 'otro', type: 'send_text', content: { text: 'y' }, transitions: [{ condition: { type: 'default' }, next_node_id: 'info' }] });
      });
      expect(codes(f)).toContain('error:V-EST-06');
      // Volver a un paso que espera al cliente no es un bucle automático.
      expect(codes(base())).not.toContain('error:V-EST-06');
    });

    it('V-EST-07: dos salidas iguales a destinos distintos, o una palabra en dos listas', () => {
      const botones = flowWith((f) => {
        node(f, 'menu').transitions.push({ condition: { type: 'button', value: 'info' }, next_node_id: 'humano' });
      });
      expect(codes(botones)).toContain('warning:V-EST-07');

      const palabras = flowWith((f) => {
        node(f, 'menu').transitions.push(
          { condition: { type: 'keyword', values: ['horario', 'Información'] }, next_node_id: 'info' },
          { condition: { type: 'keyword', values: ['informacion', 'asesor'] }, next_node_id: 'humano' },
        );
      });
      expect(validateFlowDesign(palabras).issues.find((i) => i.code === 'V-EST-07')?.message).toMatch(/"informacion"/);
    });
  });

  describe('formato Meta (límites de limits.ts)', () => {
    it('V-META-01: título de botón de más de 20', () => {
      const f = flowWith((f) => { node(f, 'menu').content.buttons[0].title = 'Información completa!'.padEnd(21, '!'); });
      expect(codes(f)).toContain('error:V-META-01');
    });

    it('V-META-01: una lista de 2000 caracteres cabe en WhatsApp (4096) aunque hoy el schema la rechace (1024)', () => {
      const f = flowWith((f) => {
        f.nodes[0] = {
          id: 'menu',
          type: 'send_list',
          content: {
            text: 'x'.repeat(2000),
            button_label: 'Ver',
            sections: [{ type: 'static', title: 'Opciones', items: [{ id: 'info', title: 'Info' }, { id: 'humano', title: 'Persona' }] }],
          },
          transitions: [
            { condition: { type: 'list_item', value: 'info' }, next_node_id: 'info' },
            { condition: { type: 'list_item', value: 'humano' }, next_node_id: 'humano' },
            { condition: { type: 'default' }, next_node_id: 'menu' },
          ],
        };
      });
      const report = validateFlowDesign(f);
      expect(codes(f)).not.toContain('error:V-META-01');
      expect(report.schema.ok).toBe(false);
    });

    it('V-META-01: tarjeta de carrusel de más de 160 caracteres o con 3 saltos de línea', () => {
      const largo = flowWith((f) => { f.nodes.push(carousel('c', [card('x'.repeat(161)), card('ok')])); link(f, 'c'); });
      expect(codes(largo)).toContain('error:V-META-01');
      const saltos = flowWith((f) => { f.nodes.push(carousel('c', [card('a\nb\nc\nd'), card('ok')])); link(f, 'c'); });
      expect(validateFlowDesign(saltos).issues.find((i) => i.code === 'V-META-01')?.message).toMatch(/saltos de línea/);
    });

    it('V-META-02: cuatro botones', () => {
      const f = flowWith((f) => { node(f, 'menu').content.buttons.push({ id: 'a', title: 'A' }, { id: 'b', title: 'B' }); });
      expect(codes(f)).toContain('error:V-META-02');
    });

    it('V-META-02: carrusel de una sola tarjeta es error; uno desde el catálogo, advertencia', () => {
      const una = flowWith((f) => { f.nodes.push(carousel('c', [card('solo')])); link(f, 'c'); });
      expect(codes(una)).toContain('error:V-META-02');
      const dinamico = flowWith((f) => {
        f.nodes.push({
          id: 'c',
          type: 'send_media_carousel',
          content: { body: 'Productos', dynamic_cards: { cards_source: 'catalog_items', button_title: 'Lo quiero' } },
          transitions: [{ condition: { type: 'card_any' }, next_node_id: 'humano' }, { condition: { type: 'default' }, next_node_id: 'humano' }],
        });
        link(f, 'c');
      });
      expect(codes(dinamico)).toContain('warning:V-META-02');
      expect(codes(dinamico)).not.toContain('error:V-META-02');
    });

    it('V-META-02: lista de 11 opciones', () => {
      const f = flowWith((f) => {
        f.nodes[0] = {
          id: 'menu',
          type: 'send_list',
          content: {
            text: 'Elige',
            button_label: 'Ver',
            sections: [{ type: 'static', title: 'Todo', items: Array.from({ length: 11 }, (_, i) => ({ id: `o${i}`, title: `Opción ${i}` })) }],
          },
          transitions: [{ condition: { type: 'list_item_any' }, next_node_id: 'humano' }],
        };
      });
      expect(codes(f)).toContain('error:V-META-02');
    });

    it('V-META-04: tarjetas con distinta cantidad de botones', () => {
      const f = flowWith((f) => {
        const second = card('b');
        second.buttons.push({ type: 'quick_reply', id: 'extra', title: 'Otro' });
        f.nodes.push(carousel('c', [card('a'), second]));
        link(f, 'c');
      });
      expect(codes(f)).toContain('error:V-META-04');
    });

    it('V-META-05: imagen por http', () => {
      const f = flowWith((f) => {
        f.nodes.push({ id: 'foto', type: 'send_media', content: { media_type: 'image', url: 'http://x/a.jpg' }, transitions: [{ condition: { type: 'default' }, next_node_id: 'fin' }] });
        node(f, 'info').transitions = [{ condition: { type: 'default' }, next_node_id: 'foto' }];
      });
      expect(codes(f)).toContain('error:V-META-05');
    });
  });

  describe('cumplimiento', () => {
    it('V-CUMP-01: sin ningún paso a una persona', () => {
      const f = flowWith((f) => {
        f.nodes = f.nodes.filter((n) => n.id !== 'humano');
        node(f, 'menu').transitions = node(f, 'menu').transitions.filter((t) => t.next_node_id !== 'humano');
        node(f, 'menu').content.buttons = [{ id: 'info', title: 'Info' }];
      });
      expect(codes(f)).toContain('error:V-CUMP-01');
    });

    it('V-CUMP-01: un paso donde el cliente se queda sin forma de llegar a una persona', () => {
      const f = flowWith((f) => {
        node(f, 'info').transitions = [{ condition: { type: 'default' }, next_node_id: 'encierro' }];
        f.nodes.push({
          id: 'encierro',
          type: 'send_buttons',
          content: { text: '¿Algo más?', buttons: [{ id: 'no', title: 'No' }] },
          transitions: [{ condition: { type: 'default' }, next_node_id: 'fin' }],
        });
      });
      expect(validateFlowDesign(f).issues).toContainEqual(expect.objectContaining({ code: 'V-CUMP-01', nodeId: 'encierro' }));
    });

    describe('con palabras de escape (C-08)', () => {
      /** Un paso sin salida a una persona, cubierto solo por la palabra de escape. */
      const escaped = (escape: BotFlow['escape']) => flowWith((f) => {
        node(f, 'info').transitions = [{ condition: { type: 'default' }, next_node_id: 'encierro' }];
        f.nodes.push({
          id: 'encierro',
          type: 'send_buttons',
          content: { text: '¿Algo más?', buttons: [{ id: 'no', title: 'No' }] },
          transitions: [{ condition: { type: 'default' }, next_node_id: 'fin' }],
        });
        f.escape = escape;
      });
      const HUMAN = { words: ['asesor'], node_id: 'humano' };
      /** Sin V-COSTO-01: el fixture manda un texto justo antes de un menú, a propósito. */
      const relevant = (f: BotFlow) => codes(f).filter((c) => c !== 'warning:V-COSTO-01');
      const relevantIssues = (f: BotFlow) => validateFlowDesign(f).issues.filter((i) => i.code !== 'V-COSTO-01');

      it('V-CUMP-01: la palabra para hablar con una persona cubre todos los pasos', () => {
        expect(relevant(escaped({ human: HUMAN }))).toEqual([]);
      });

      it('V-CUMP-01: la palabra lleva a un paso que no pasa a una persona', () => {
        expect(validateFlowDesign(escaped({ human: { words: ['asesor'], node_id: 'fin' } })).issues).toContainEqual(
          expect.objectContaining({ code: 'V-CUMP-01', level: 'error', message: expect.stringContaining('«fin»') }),
        );
      });

      it('V-CUMP-01: un paso atrapa la palabra con una salida propia que no llega a una persona', () => {
        const f = escaped({ human: HUMAN });
        node(f, 'encierro').transitions.unshift({ condition: { type: 'keyword', values: ['asesor'] }, next_node_id: 'fin' });

        expect(validateFlowDesign(f).issues).toContainEqual(expect.objectContaining({ code: 'V-CUMP-01', nodeId: 'encierro' }));
      });

      it('V-CUMP-01: si la salida propia sí llega a una persona, está bien', () => {
        const f = escaped({ human: HUMAN });
        node(f, 'encierro').transitions.unshift({ condition: { type: 'keyword', values: ['asesor'] }, next_node_id: 'humano' });

        expect(relevant(f)).toEqual([]);
      });

      it('V-CUMP-02: sin palabra de baja', () => {
        expect(relevant(escaped({ human: HUMAN, opt_out: { words: [] } }))).toEqual(['error:V-CUMP-02']);
        expect(relevant(escaped({ human: HUMAN, opt_out: { words: ['baja'] } }))).toEqual([]);
      });

      it('V-EST-02: la palabra lleva a un paso que no existe (y el schema no publica)', () => {
        const report = validateFlowDesign(escaped({ human: { words: ['asesor'], node_id: 'nadie' }, menu: { words: ['menu'], node_id: 'tampoco' } }));

        expect(report.issues.filter((i) => i.code === 'V-EST-02')).toHaveLength(2);
        expect(report.schema.ok).toBe(false);
      });

      it('V-EST-03: un paso al que solo se llega con la palabra no es inalcanzable', () => {
        const f = flowWith((f) => {
          node(f, 'menu').transitions = node(f, 'menu').transitions.filter((t) => t.next_node_id !== 'humano');
          node(f, 'menu').content.buttons = [{ id: 'info', title: 'Info' }];
          f.escape = { human: HUMAN };
        });

        expect(relevant(f)).toEqual([]);
      });

      it('V-EST-07: la misma palabra en dos grupos', () => {
        expect(relevantIssues(escaped({ human: HUMAN, restart: { words: ['Cancelar'] }, opt_out: { words: ['cancelar'] } }))).toEqual([
          expect.objectContaining({ code: 'V-EST-07', level: 'warning', message: 'La palabra "cancelar" está en baja y en empezar de nuevo: se usa solo como baja.' }),
        ]);
      });
    });

    it.each([
      ['Mándanos el número de tu tarjeta para cobrarte', true],
      ['Pásanos tu CLABE y te depositamos', true],
      ['Envíanos foto de tu INE', true],
      ['¿Cuál es tu contraseña?', true],
      ['Aceptamos pago con tarjeta en tienda', false],
      ['Déjanos tu nombre y teléfono', false],
    ])('V-CUMP-06: "%s" → error=%s', (prompt, expected) => {
      const f = flowWith((f) => {
        node(f, 'menu').transitions[0].next_node_id = 'captura';
        f.nodes.push({ id: 'captura', type: 'wait_input', content: { prompt }, transitions: [{ condition: { type: 'default' }, next_node_id: 'humano' }] });
      });
      expect(codes(f).includes('error:V-CUMP-06')).toBe(expected);
    });

    it('V-CUMP-07: más de 3 mensajes seguidos; V-COSTO-02: exactamente 3', () => {
      const chain = (n: number) => flowWith((f) => {
        const ids = Array.from({ length: n }, (_, i) => `t${i}`);
        ids.forEach((id, i) => f.nodes.push({
          id,
          type: 'send_text',
          content: { text: `Mensaje ${i}` },
          transitions: [{ condition: { type: 'default' }, next_node_id: ids[i + 1] ?? 'humano' }],
        }));
        node(f, 'menu').transitions[0].next_node_id = 't0';
      });
      // cadena + la respuesta del paso a humano
      expect(codes(chain(3))).toContain('warning:V-CUMP-07');
      expect(codes(chain(2))).toContain('warning:V-COSTO-02');
      expect(codes(chain(2))).not.toContain('warning:V-CUMP-07');
      expect(codes(chain(1))).not.toContain('warning:V-COSTO-02');
    });
  });

  describe('costo', () => {
    it('V-COSTO-01: texto suelto justo antes de un menú', () => {
      const f = flowWith((f) => {
        f.nodes.unshift({ id: 'saludo', type: 'send_text', content: { text: 'Bienvenido' }, transitions: [{ condition: { type: 'default' }, next_node_id: 'menu' }] });
        f.start_node_id = 'saludo';
      });
      expect(codes(f)).toContain('warning:V-COSTO-01');
      expect(codes(base())).not.toContain('warning:V-COSTO-01');
    });
  });
});

function card(body: string) {
  return {
    header: { type: 'image' as const, link: 'https://x/a.jpg' },
    body,
    buttons: [{ type: 'quick_reply' as const, id: `id-${body.slice(0, 5)}-${body.length}`, title: 'Lo quiero' }] as Array<
      { type: 'quick_reply'; id: string; title: string } | { type: 'cta_url'; display_text: string; url: string }
    >,
  };
}

function carousel(id: string, cards: ReturnType<typeof card>[]): FlowNode {
  return {
    id,
    type: 'send_media_carousel',
    content: { body: 'Productos', cards },
    transitions: [{ condition: { type: 'card_any' }, next_node_id: 'humano' }, { condition: { type: 'default' }, next_node_id: 'humano' }],
  };
}

/** Hace alcanzable el paso `id` desde el botón "info" del menú. */
function link(f: BotFlow, id: string) {
  node(f, 'menu').transitions[0].next_node_id = id;
}
