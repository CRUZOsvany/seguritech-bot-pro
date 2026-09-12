/**
 * Studio Fase 4: expectativas de los casos de prueba y diff legible entre
 * versiones.
 */
import { TestExpectationSchema, evaluateTest, type TestOutcome } from '@/domain/studio/testCases';
import { diffFlows } from '@/domain/studio/diff';
import { compileWizard } from '@/domain/studio/wizard';
import { STUDIO_MOLDS } from '@/domain/studio/molds';
import type { Transition } from '@/domain/entities/flow';

const outcome = (o: Partial<TestOutcome> = {}): TestOutcome => ({
  finalNode: 'emergencia__confirmar',
  context: { tipo_emergencia: 'Apertura de puerta' },
  texts: ['Para confirmar antes de avisar al cerrajero', '✅ Sí, correcto'],
  messages: 4,
  ...o,
});

describe('evaluateTest', () => {
  it('pasa cuando se cumplen todas las expectativas', () => {
    expect(
      evaluateTest(
        { node: 'emergencia__confirmar', vars: { tipo_emergencia: 'Apertura de puerta' }, contains: ['PARA CONFIRMAR'], notContains: ['no te entendí'], maxMessages: 4 },
        outcome(),
      ),
    ).toEqual([]);
  });

  it('explica cada fallo en español', () => {
    const failures = evaluateTest(
      { node: 'fin', vars: { tipo_emergencia: 'Apertura de carro', datos: 'x' }, contains: ['cotización'], notContains: ['Sí, correcto'], maxMessages: 2 },
      outcome(),
    );

    expect(failures).toEqual([
      'Terminó en «emergencia__confirmar» y se esperaba «fin».',
      '{{tipo_emergencia}} vale "Apertura de puerta" y se esperaba "Apertura de carro".',
      '{{datos}} vale nada y se esperaba "x".',
      'El bot nunca dijo "cotización".',
      'El bot dijo "Sí, correcto" y no debía.',
      'El bot mandó 4 mensajes y el tope era 2.',
    ]);
  });

  it('una prueba sin ninguna expectativa no es válida', () => {
    expect(TestExpectationSchema.safeParse({}).success).toBe(false);
    expect(TestExpectationSchema.safeParse({ node: 'fin' }).success).toBe(true);
  });
});

describe('diffFlows', () => {
  const spec = () => structuredClone(STUDIO_MOLDS[0].spec);

  it('dos versiones iguales no tienen cambios, aunque cambie la especificación del asistente', () => {
    const a = compileWizard(spec());
    const b = { ...compileWizard(spec()), studio: { wizard: { otra: 'cosa' } } };

    expect(diffFlows(a, b).same).toBe(true);
  });

  it('textos cambiados, salidas nuevas y pasos agregados', () => {
    const before = compileWizard(spec());
    const next = spec();
    const info = next.options.find((o) => o.id === 'info')!;
    if (info.kind === 'info') info.text = 'Hacemos de todo.';
    next.options.push({ id: 'asesor', title: 'Hablar con alguien', kind: 'human', keywords: ['asesor'], handoff: { userResponse: 'Va', ownerAlert: 'Pide asesor {{phone}}' } });
    const after = compileWizard(next);

    const diff = diffFlows(before, after);

    expect(diff.same).toBe(false);
    expect(diff.added).toEqual(['asesor__persona']);
    expect(diff.removed).toEqual([]);
    const info_ = diff.changed.find((c) => c.nodeId === 'info__info')!;
    expect(info_.changes[0]).toMatch(/^texto: «En \{\{nombre_negocio\}\} hacemos:.*» → «Hacemos de todo\.»$/);
    // Con 4 opciones el menú deja de ser botones y pasa a lista.
    expect(diff.changed.find((c) => c.nodeId === 'bienvenida')!.changes).toEqual(['cambió de botones a lista']);
  });

  it('dentro del mismo tipo: texto de un botón y salida nueva', () => {
    const before = compileWizard(spec());
    const after = structuredClone(before);
    const menu = after.nodes.find((n) => n.id === 'bienvenida')!;
    (menu.content as { buttons: Array<{ title: string }> }).buttons[2].title = 'ℹ️ Info';
    (menu.transitions as Transition[]).unshift({ condition: { type: 'keyword', values: ['asesor'] }, next_node_id: 'no_entendi__persona' });

    expect(diffFlows(before, after).changed).toEqual([{
      nodeId: 'bienvenida',
      changes: ['botón 3: «ℹ️ Información» → «ℹ️ Info»', 'salida nueva: palabras (asesor) → «no_entendi__persona»'],
    }]);
  });

  it('salida que ahora lleva a otro paso, y paso quitado', () => {
    const before = compileWizard(spec());
    const after = structuredClone(before);
    after.nodes = after.nodes.filter((n) => n.id !== 'despedida');
    after.nodes.find((n) => n.id === 'info__info')!.transitions[2].next_node_id = 'fin';

    const diff = diffFlows(before, after);

    expect(diff.removed).toEqual(['despedida']);
    expect(diff.changed.find((c) => c.nodeId === 'info__info')!.changes).toContain('button "salir" ahora lleva a «fin» (antes «despedida»)');
  });

  it('sin versión publicada, todo el flow es nuevo', () => {
    const after = compileWizard(spec());

    expect(diffFlows(null, after).added).toHaveLength(after.nodes.length);
  });
});
