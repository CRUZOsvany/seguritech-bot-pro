import { describe, expect, it } from 'vitest';
import type { BotFlow } from '../flow-types';
import { graphToBotFlow } from '../mapping/to-bot-flow';
import { useDesignerStore } from './designer-store';

const flow = (extra: Partial<BotFlow> = {}): BotFlow => ({
  version: '1.0',
  start_node_id: 'hola',
  nodes: [
    { id: 'hola', type: 'send_text', content: { text: 'Hola' }, transitions: [{ condition: { type: 'default' }, next_node_id: 'fin' }] },
    { id: 'fin', type: 'end', content: {}, transitions: [] },
  ],
  ...extra,
});

describe('Designer: configuración del flow fuera del grafo', () => {
  it('conserva las palabras de escape (C-08) al guardar, aunque no las edita', () => {
    const escape = { human: { words: ['asesor'], node_id: 'fin' }, opt_out: { words: ['baja'] } };
    useDesignerStore.getState().loadFromBotFlow(flow({ escape }), 'f1');

    expect(useDesignerStore.getState().toBotFlow()).toEqual(flow({ escape }));
  });

  // Regresión (2026-09-12): el Designer solo devolvía `escape`. Un flow en
  // `continue` guardado desde el Designer volvía en silencio a `block`: fuera
  // de horario el bot dejaba de atender (p. ej. las emergencias 24/7 de
  // cerrajería) sin que nadie lo hubiera pedido.
  it('regresión: conserva el horario al guardar; un flow en `continue` no vuelve a `block`', () => {
    const hours = { when_closed: 'continue' };
    useDesignerStore.getState().loadFromBotFlow(flow({ hours }), 'f1');

    expect(useDesignerStore.getState().toBotFlow().hours).toEqual({ when_closed: 'continue' });
  });

  it('conserva la inactividad (Fase 5) al guardar, aunque no la edita', () => {
    const inactivity = { reminder: { after_minutes: 15, text: '¿Sigues ahí?' }, close: { after_minutes: 60 } };
    useDesignerStore.getState().loadFromBotFlow(flow({ inactivity }), 'f1');

    expect(useDesignerStore.getState().toBotFlow()).toEqual(flow({ inactivity }));
  });

  it('regresión: la «Revisión del Studio» valida el flow con su horario y su inactividad, no sin ellos', () => {
    // StudioReview arma el flow con graphToBotFlow y lo que hay en el store,
    // no con toBotFlow(): es un segundo camino que también los perdía.
    const hours = { when_closed: 'continue' };
    const inactivity = { close: { after_minutes: 30 } };
    useDesignerStore.getState().loadFromBotFlow(flow({ hours, inactivity }), 'f1');
    const s = useDesignerStore.getState();

    expect(graphToBotFlow(s.nodes, s.edges, s.startNodeId, s.extras)).toEqual(flow({ hours, inactivity }));
  });

  it('un flow sin palabras de escape sale sin ellas', () => {
    useDesignerStore.getState().loadFromBotFlow(flow({ escape: { opt_out: { words: ['baja'] } } }), 'f1');
    useDesignerStore.getState().loadFromBotFlow(flow(), 'f2');

    expect(useDesignerStore.getState().toBotFlow()).not.toHaveProperty('escape');
  });
});
