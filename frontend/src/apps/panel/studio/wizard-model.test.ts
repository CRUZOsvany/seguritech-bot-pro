import { describe, expect, it } from 'vitest';
import type { WizardSpec } from '@/shared/api/studio';
import {
  availableVariables,
  businessPatch,
  withSuggestedTexts,
  type BusinessForm,
  charCount,
  isValidHours,
  newOption,
  optionOfNode,
  parseKeywords,
  presentation,
  removeOption,
  slugify,
  stepForIssue,
} from './wizard-model';

function spec(): WizardSpec {
  return {
    version: 1,
    menu: { listButtonLabel: 'Ver', listSectionTitle: 'Opciones' },
    options: [
      {
        id: 'emergencia',
        title: '🚨 Emergencia',
        kind: 'capture',
        keywords: ['urgente'],
        choices: { text: 'x', buttonLabel: 'Ver', sectionTitle: 'S', items: [{ title: 'Puerta' }], saveAs: 'tipo_emergencia' },
        question: '¿Dónde?',
        saveAs: 'datos_emergencia',
        confirm: null,
        handoff: { userResponse: 'Ya vamos', ownerAlert: 'Alerta' },
      },
      { id: 'info', title: 'Info', kind: 'info', keywords: [], text: 'Hacemos todo', actions: [{ title: 'Emergencia', goto: 'emergencia' }, { title: 'Salir', goto: 'farewell' }] },
    ],
    notUnderstood: { attempts: 2, retryText: 'Sigo sin entenderte', handoff: { userResponse: 'a', ownerAlert: 'b' } },
    farewell: { text: 'Gracias', keywords: ['gracias'] },
  };
}

describe('slugify', () => {
  it('quita emoji, acentos y espacios', () => {
    expect(slugify('🚨 Emergencia')).toBe('emergencia');
    expect(slugify('Programación de llaves')).toBe('programacion_de_llaves');
  });

  it('no repite un id que ya existe ni usa uno reservado', () => {
    expect(slugify('Emergencia', ['emergencia'])).toBe('emergencia_2');
    expect(slugify('Emergencia', ['emergencia', 'emergencia_2'])).toBe('emergencia_3');
    expect(slugify('Bienvenida')).toBe('bienvenida_op');
    expect(slugify('No entendí')).toBe('no_entendi_op');
  });

  it('un título sin letras da un id genérico', () => {
    expect(slugify('🔥🔥')).toBe('opcion');
  });
});

describe('parseKeywords', () => {
  it('separa por comas o líneas, recorta y quita repetidas sin importar mayúsculas', () => {
    expect(parseKeywords('urgente, Auxilio,\n no abre ,,urgente, AUXILIO')).toEqual(['urgente', 'Auxilio', 'no abre']);
  });
});

describe('opciones', () => {
  it('con hasta 3 opciones el menú va en botones; con 4, en lista', () => {
    const s = spec();
    expect(presentation(s)).toBe('botones');
    s.options.push(newOption('human', s), newOption('capture', s));
    expect(presentation(s)).toBe('lista');
  });

  it('una opción nueva no choca con los ids existentes', () => {
    const s = spec();
    s.options.push({ ...newOption('info', s) });
    const again = newOption('info', s);
    expect(again.id).toBe('info_3');
  });

  it('quitar una opción quita también los botones de información que llevaban a ella', () => {
    const next = removeOption(spec(), 'emergencia');
    expect(next.options.map((o) => o.id)).toEqual(['info']);
    expect(next.options[0].kind === 'info' && next.options[0].actions).toEqual([{ title: 'Salir', goto: 'farewell' }]);
  });

  it('variables disponibles: las del negocio y las que guardan las opciones', () => {
    expect(availableVariables(spec())).toEqual(['nombre_negocio', 'phone', 'tipo_emergencia', 'datos_emergencia']);
  });
});

describe('hallazgos del validador → paso del asistente', () => {
  it.each([
    [{ code: 'V-EST-07', nodeId: 'bienvenida' }, 'reconocimiento'],
    [{ code: 'V-META-01', nodeId: 'bienvenida' }, 'primer-mensaje'],
    [{ code: 'V-META-01', nodeId: 'emergencia__pregunta' }, 'opciones'],
    [{ code: 'V-EST-05', nodeId: 'emergencia__persona' }, 'humano'],
    [{ code: 'V-META-01', nodeId: 'no_entendi_2' }, 'no-entiende'],
    [{ code: 'V-META-01', nodeId: 'despedida' }, 'despedida'],
    [{ code: 'V-CUMP-01' }, 'humano'],
    [{ code: 'V-META-01', nodeId: 'hablar_persona' }, 'humano'],
    [{ code: 'V-CUMP-02' }, 'reconocimiento'],
    [{ code: 'V-EST-07' }, 'reconocimiento'],
    [{ code: 'V-EST-08' }, 'publicar'],
  ])('%j → %s', (issue, step) => {
    expect(stepForIssue({ level: 'error', message: '', ...issue }, spec())).toBe(step);
  });

  it('optionOfNode reconoce la opción dueña de un paso compilado', () => {
    expect(optionOfNode('emergencia__lista', spec())).toBe('emergencia');
    expect(optionOfNode('no_entendi', spec())).toBeNull();
  });
});

describe('datos del negocio', () => {
  const base: BusinessForm = {
    nombre_negocio: 'Cerrajería Pérez',
    horario_semana: '09:00-19:00',
    horario_sabado: '',
    abre_domingo: false,
    owner_nombre: '',
    owner_whatsapp: '',
    mensaje_bienvenida: 'Hola',
    mensaje_menu_principal: '',
    mensaje_no_entendio: '',
    mensaje_fuera_horario: 'Cerrado',
  };

  it('sin cambios no hay nada que mandar', () => {
    expect(businessPatch(base, { ...base })).toBeNull();
  });

  it('manda solo lo que cambió; un horario vacío va como null', () => {
    expect(businessPatch(base, { ...base, horario_semana: '  ', mensaje_menu_principal: '¿Qué necesitas?' })).toEqual({
      horario_semana: null,
      bot_configuration: { mensaje_menu_principal: '¿Qué necesitas?' },
    });
  });

  it('del dueño manda los dos datos juntos, porque crearlo exige ambos', () => {
    expect(businessPatch(base, { ...base, owner_nombre: ' Ana ', owner_whatsapp: '7471234567' })).toEqual({
      owner: { nombre_dueno: 'Ana', whatsapp_dueno: '7471234567' },
    });
  });

  it('los textos sugeridos del molde solo llenan lo que está vacío', () => {
    const next = withSuggestedTexts(base, {
      mensaje_bienvenida: 'Sugerido',
      mensaje_menu_principal: 'Menú sugerido',
      mensaje_no_entendio: 'No entendí',
      mensaje_fuera_horario: 'Otro',
    });
    expect(next).toMatchObject({
      mensaje_bienvenida: 'Hola',
      mensaje_menu_principal: 'Menú sugerido',
      mensaje_no_entendio: 'No entendí',
      mensaje_fuera_horario: 'Cerrado',
    });
  });
});

describe('utilidades', () => {
  it('charCount cuenta un emoji como un carácter, como WhatsApp', () => {
    expect(charCount('🚨 Emergencia')).toBe(12);
  });

  it('isValidHours', () => {
    expect(['', '09:00-19:00', '9:00 - 14:30', '22:00-02:00'].every(isValidHours)).toBe(true);
    expect(['9 a 7', '25:00-10:00', '09:00'].some(isValidHours)).toBe(false);
  });
});
