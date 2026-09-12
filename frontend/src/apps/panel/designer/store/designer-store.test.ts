import { describe, expect, it } from 'vitest';
import type { BotFlow } from '../flow-types';
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

  it('conserva el horario y la inactividad (Fase 5) al guardar; antes el horario se perdía', () => {
    const hours = { when_closed: 'continue' };
    const inactivity = { reminder: { after_minutes: 15, text: '¿Sigues ahí?' }, close: { after_minutes: 60 } };
    useDesignerStore.getState().loadFromBotFlow(flow({ hours, inactivity }), 'f1');

    expect(useDesignerStore.getState().toBotFlow()).toEqual(flow({ hours, inactivity }));
  });

  it('un flow sin palabras de escape sale sin ellas', () => {
    useDesignerStore.getState().loadFromBotFlow(flow({ escape: { opt_out: { words: ['baja'] } } }), 'f1');
    useDesignerStore.getState().loadFromBotFlow(flow(), 'f2');

    expect(useDesignerStore.getState().toBotFlow()).not.toHaveProperty('escape');
  });
});
