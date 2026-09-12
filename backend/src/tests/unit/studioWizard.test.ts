/**
 * Asistente del Studio (Fase 3): compilador de la especificación a un flow
 * del motor, y lectura de vuelta.
 */
import { validateFlow } from '@/domain/validators/flowSchema';
import { validateFlowDesign } from '@/domain/validation/flowDesignValidator';
import {
  WizardSpecSchema,
  compileWizard,
  readWizardSpec,
  type WizardSpec,
} from '@/domain/studio/wizard';
import { STUDIO_MOLDS } from '@/domain/studio/molds';

const cerrajeria = () => structuredClone(STUDIO_MOLDS.find((m) => m.id === 'cerrajeria')!.spec);

function minimal(overrides: Partial<WizardSpec> = {}): WizardSpec {
  return {
    version: 1,
    menu: { listButtonLabel: 'Ver opciones', listSectionTitle: 'Opciones' },
    options: [
      {
        id: 'pedido',
        title: 'Hacer pedido',
        kind: 'capture',
        keywords: ['pedido'],
        choices: null,
        question: '¿Qué necesitas?',
        saveAs: 'detalle',
        confirm: null,
        handoff: { userResponse: 'Te atendemos en breve.', ownerAlert: 'Pedido: {{detalle}} de {{phone}}' },
      },
      { id: 'asesor', title: 'Hablar con alguien', kind: 'human', keywords: ['asesor', 'humano'], handoff: { userResponse: 'Te comunico.', ownerAlert: 'Pide asesor {{phone}}' } },
    ],
    notUnderstood: { attempts: 1, retryText: 'Sigo sin entenderte.', handoff: { userResponse: 'Te paso con alguien.', ownerAlert: 'No entendí a {{phone}}' } },
    farewell: { text: 'Gracias.', keywords: ['gracias'] },
    ...overrides,
  };
}

/** Lo que haría jsonb: mismas claves, en otro orden. */
function shuffleKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(shuffleKeys) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, shuffleKeys(v)])) as T;
  }
  return value;
}

describe('compileWizard', () => {
  it.each([
    ['cerrajería', cerrajeria()],
    ['mínimo', minimal()],
  ])('el flow de "%s" pasa el schema y el validador sin errores', (_name, spec) => {
    const flow = compileWizard(spec);

    expect(() => validateFlow(flow)).not.toThrow();
    expect(validateFlowDesign(flow).issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('el saludo y el menú salen de bot_configuration en un solo mensaje', () => {
    const start = compileWizard(minimal()).nodes[0];

    expect(start).toMatchObject({
      id: 'bienvenida',
      type: 'send_buttons',
      config_bound: ['welcome_message', 'menu_message'],
      content: { text: '{{welcome_message}}\n\n{{menu_message}}' },
    });
  });

  it('con 4 o más opciones el menú es una lista, con descripciones', () => {
    const spec = minimal();
    for (const n of [3, 4]) {
      spec.options.push({ id: `extra${n}`, title: `Extra ${n}`, description: `Desc ${n}`, kind: 'human', keywords: [], handoff: { userResponse: 'x', ownerAlert: 'y' } });
    }

    const start = compileWizard(spec).nodes[0];

    expect(start.type).toBe('send_list');
    expect(start).toMatchObject({
      content: { button_label: 'Ver opciones', sections: [{ title: 'Opciones', items: expect.arrayContaining([{ id: 'extra4', title: 'Extra 4', description: 'Desc 4' }]) }] },
    });
    expect(start.transitions[0].condition).toEqual({ type: 'list_item', value: 'pedido' });
  });

  it.each([1, 2, 3])('%s intento(s) de "no te entendí" antes de pasar a una persona', (attempts) => {
    const flow = compileWizard(minimal({ notUnderstood: { ...minimal().notUnderstood, attempts } }));
    const ladder = flow.nodes.filter((n) => n.id.startsWith('no_entendi')).map((n) => n.id);

    expect(ladder).toEqual([
      'no_entendi',
      ...Array.from({ length: attempts - 1 }, (_, i) => `no_entendi_${i + 2}`),
      'no_entendi__persona',
    ]);
  });

  it('sin lista previa ni confirmación, la pregunta lleva directo a la persona', () => {
    const flow = compileWizard(minimal());
    const question = flow.nodes.find((n) => n.id === 'pedido__pregunta')!;

    expect(question.transitions).toEqual([{ condition: { type: 'default' }, next_node_id: 'pedido__persona' }]);
    expect(flow.nodes.some((n) => n.id === 'despedida')).toBe(false);
  });

  it('las palabras clave de una opción se reconocen en el menú y en cada "no te entendí"', () => {
    const flow = compileWizard(minimal({ notUnderstood: { ...minimal().notUnderstood, attempts: 2 } }));
    for (const id of ['bienvenida', 'no_entendi', 'no_entendi_2']) {
      expect(flow.nodes.find((n) => n.id === id)!.transitions).toContainEqual({
        condition: { type: 'keyword', values: ['asesor', 'humano'] },
        next_node_id: 'asesor__persona',
      });
    }
  });

  it('guarda la especificación dentro del flow', () => {
    const spec = minimal();

    expect(compileWizard(spec).studio).toEqual({ wizard: spec });
  });
});

describe('readWizardSpec', () => {
  it('lee de vuelta lo que compiló, aunque Postgres reordene las claves', () => {
    const spec = cerrajeria();
    const stored = shuffleKeys(JSON.parse(JSON.stringify(compileWizard(spec))));

    expect(readWizardSpec(stored)).toEqual({ ok: true, spec });
  });

  it('un flow que no generó el asistente no tiene especificación', () => {
    expect(readWizardSpec({ version: '1.0', start_node_id: 'a', nodes: [] })).toEqual({ ok: false, reason: 'no_spec' });
  });

  it('si alguien lo cambió en el Designer, lo detecta en vez de pisar el cambio', () => {
    const flow = compileWizard(minimal());
    (flow.nodes[1].content as { prompt: string }).prompt = 'Otra pregunta escrita a mano';

    expect(readWizardSpec(flow)).toEqual({ ok: false, reason: 'edited_elsewhere' });
  });

  it('una especificación que ya no es válida', () => {
    expect(readWizardSpec({ ...compileWizard(minimal()), studio: { wizard: { version: 99 } } })).toEqual({
      ok: false,
      reason: 'invalid_spec',
    });
  });
});

describe('WizardSpecSchema', () => {
  it.each([
    ['id reservado', (s: WizardSpec) => { s.options[0].id = 'bienvenida'; }, 'reservado'],
    ['id repetido', (s: WizardSpec) => { s.options[1].id = 'pedido'; }, 'repetido'],
    ['id con mayúsculas', (s: WizardSpec) => { s.options[0].id = 'Pedido'; }, 'minúsculas'],
    ['botón de información a una opción que no existe', (s: WizardSpec) => {
      s.options.push({ id: 'info', title: 'Info', kind: 'info', keywords: [], text: 'x', actions: [{ title: 'Ir', goto: 'fantasma' }] });
    }, 'no existe'],
  ])('rechaza %s', (_name, change, message) => {
    const spec = minimal();
    change(spec);

    const parsed = WizardSpecSchema.safeParse(spec);

    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain(message);
  });

  it('el molde de cerrajería es una especificación válida', () => {
    expect(WizardSpecSchema.safeParse(cerrajeria()).success).toBe(true);
  });
});
