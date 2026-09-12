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

  it('palabras de escape (C-08): un paso de persona propio y la configuración del flow', () => {
    const flow = compileWizard(minimal({ escape: ESCAPE }));

    expect(flow.escape).toEqual({
      menu: { words: ['menu'] },
      human: { words: ['asesor', 'persona'], node_id: 'hablar_persona' },
      opt_out: { words: ['baja'] },
    });
    expect(flow.nodes.find((n) => n.id === 'hablar_persona')).toMatchObject({
      type: 'escape_to_human',
      content: { user_response: 'Te comunico con alguien.', owner_alert_template: 'Pide persona: {{phone}}' },
    });
    expect(validateFlow(flow)).toBeTruthy();
    expect(validateFlowDesign(flow).ok).toBe(true);
  });

  it('captura con validación (C-04): la pregunta lleva la regla, el tope y a dónde sigue al agotarlo', () => {
    const spec = minimal();
    const option = spec.options[0] as Extract<WizardSpec['options'][number], { kind: 'capture' }>;
    option.check = { rule: { type: 'phone_mx' }, maxAttempts: 2, onExhausted: 'human' };
    const flow = compileWizard(spec);

    expect(flow.nodes.find((n) => n.id === 'pedido__pregunta')?.content).toEqual({
      prompt: '¿Qué necesitas?',
      save_to_context: 'detalle',
      validation: { type: 'phone_mx' },
      max_attempts: 2,
      on_exhausted: 'no_entendi__persona',
    });
    expect(validateFlowDesign(flow).ok).toBe(true);
    expect(readWizardSpec(JSON.parse(JSON.stringify(flow)))).toEqual({ ok: true, spec });

    option.check = { rule: { type: 'number', min: 1 }, errorText: 'Solo el número.', maxAttempts: 3, onExhausted: 'menu' };
    expect(compileWizard(spec).nodes.find((n) => n.id === 'pedido__pregunta')?.content).toMatchObject({
      validation_error: 'Solo el número.',
      on_exhausted: 'bienvenida',
    });
  });

  it('horario (Fase 5): el flow sigue atendiendo cerrado y el paso de persona trae su texto de fuera de horario', () => {
    const spec = minimal({ hours: { whenClosed: 'continue' } });
    const option = spec.options[0] as Extract<WizardSpec['options'][number], { kind: 'capture' }>;
    option.handoff = { ...option.handoff, userResponseClosed: 'Mañana te marcamos.' };
    const flow = compileWizard(spec);

    expect(flow.hours).toEqual({ when_closed: 'continue' });
    expect(flow.nodes.find((n) => n.id === 'pedido__persona')?.content).toEqual({
      user_response: 'Te atendemos en breve.',
      user_response_closed: 'Mañana te marcamos.',
      owner_alert_template: 'Pedido: {{detalle}} de {{phone}}',
    });
    expect(readWizardSpec(JSON.parse(JSON.stringify(flow)))).toEqual({ ok: true, spec });

    const edited = compileWizard(spec);
    edited.hours = { when_closed: 'block' };
    expect(readWizardSpec(edited)).toEqual({ ok: false, reason: 'edited_elsewhere' });
  });

  it('sin palabras de escape en la especificación, el flow tampoco las trae (el motor usa las de siempre)', () => {
    const flow = compileWizard(minimal());

    expect(flow.escape).toBeUndefined();
    expect(flow.nodes.some((n) => n.id === 'hablar_persona')).toBe(false);
  });
});

const ESCAPE: NonNullable<WizardSpec['escape']> = {
  menuWords: ['menu'],
  restartWords: [],
  humanWords: ['asesor', 'persona'],
  optOutWords: ['baja'],
  handoff: { userResponse: 'Te comunico con alguien.', ownerAlert: 'Pide persona: {{phone}}' },
};

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

  it('detecta también un cambio en las palabras de escape hecho fuera del asistente', () => {
    const flow = compileWizard(minimal({ escape: ESCAPE }));
    flow.escape!.opt_out = { words: ['baja', 'alto'] };

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
    ['escape sin palabra de baja', (s: WizardSpec) => { s.escape = { ...ESCAPE, optOutWords: [] }; }, 'darse de baja'],
    ['escape sin palabra para una persona', (s: WizardSpec) => { s.escape = { ...ESCAPE, humanWords: [] }; }, 'hablar con una persona'],
    ['opción con el id del paso de persona', (s: WizardSpec) => { s.options[0].id = 'hablar_persona'; }, 'reservado'],
    ['captura con tope de intentos 0', (s: WizardSpec) => {
      (s.options[0] as { check?: unknown }).check = { rule: { type: 'email' }, maxAttempts: 0, onExhausted: 'human' };
    }, 'maxAttempts'],
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
