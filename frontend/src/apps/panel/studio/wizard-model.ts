import type {
  CaptureCheck,
  CaptureRule,
  ValidationIssue,
  WizardInactivity,
  WizardOption,
  WizardSpec,
} from '@/shared/api/studio';
import type { TenantDetail, UpdateTenantInput } from '@/shared/api/tenants';

/** Datos del negocio que viven en el tenant, no en el flow. */
export interface BusinessForm {
  nombre_negocio: string;
  horario_semana: string;
  horario_sabado: string;
  abre_domingo: boolean;
  owner_nombre: string;
  owner_whatsapp: string;
  mensaje_bienvenida: string;
  mensaje_menu_principal: string;
  mensaje_no_entendio: string;
  mensaje_fuera_horario: string;
}

export function businessFromTenant(t: TenantDetail): BusinessForm {
  const bc = t.bot_configuration;
  return {
    nombre_negocio: t.nombre_negocio,
    horario_semana: t.horario_semana ?? '',
    horario_sabado: t.horario_sabado ?? '',
    abre_domingo: t.abre_domingo,
    owner_nombre: t.owner?.nombre_dueno ?? '',
    owner_whatsapp: t.owner?.whatsapp_dueno ?? '',
    mensaje_bienvenida: bc?.mensaje_bienvenida ?? '',
    mensaje_menu_principal: bc?.mensaje_menu_principal ?? '',
    mensaje_no_entendio: bc?.mensaje_no_entendio ?? '',
    mensaje_fuera_horario: bc?.mensaje_fuera_horario ?? '',
  };
}

/**
 * Solo lo que cambió, en la forma de PATCH /api/admin/tenants/:id. Un
 * horario vacío se manda como null (sin horario = el bot atiende siempre).
 * Del dueño se mandan los dos datos juntos: crearlo exige ambos.
 */
export function businessPatch(base: BusinessForm, cur: BusinessForm): UpdateTenantInput | null {
  const patch: UpdateTenantInput = {};
  if (cur.nombre_negocio !== base.nombre_negocio) patch.nombre_negocio = cur.nombre_negocio.trim();
  if (cur.horario_semana !== base.horario_semana) patch.horario_semana = cur.horario_semana.trim() || null;
  if (cur.horario_sabado !== base.horario_sabado) patch.horario_sabado = cur.horario_sabado.trim() || null;
  if (cur.abre_domingo !== base.abre_domingo) patch.abre_domingo = cur.abre_domingo;
  if (cur.owner_nombre !== base.owner_nombre || cur.owner_whatsapp !== base.owner_whatsapp) {
    patch.owner = {
      ...(cur.owner_nombre.trim() ? { nombre_dueno: cur.owner_nombre.trim() } : {}),
      ...(cur.owner_whatsapp.trim() ? { whatsapp_dueno: cur.owner_whatsapp.trim() } : {}),
    };
  }
  const texts = ['mensaje_bienvenida', 'mensaje_menu_principal', 'mensaje_no_entendio', 'mensaje_fuera_horario'] as const;
  const bc: NonNullable<UpdateTenantInput['bot_configuration']> = {};
  for (const k of texts) if (cur[k] !== base[k]) bc[k] = cur[k];
  if (Object.keys(bc).length > 0) patch.bot_configuration = bc;
  return Object.keys(patch).length > 0 ? patch : null;
}

/** Aplica los textos sugeridos de un molde solo donde el negocio no tiene los suyos. */
export function withSuggestedTexts(
  business: BusinessForm,
  suggested: Pick<BusinessForm, 'mensaje_bienvenida' | 'mensaje_menu_principal' | 'mensaje_no_entendio' | 'mensaje_fuera_horario'>,
): BusinessForm {
  const next = { ...business };
  for (const k of Object.keys(suggested) as Array<keyof typeof suggested>) {
    if (!next[k].trim()) next[k] = suggested[k];
  }
  return next;
}

/**
 * Lógica pura del asistente del Studio: lo que no es pantalla. Todo lo que
 * decide cómo se comporta el bot lo compila y valida el backend; aquí solo
 * se edita la especificación y se ordena lo que el validador devuelve.
 */

export const STEPS = [
  { key: 'negocio', title: 'Negocio' },
  { key: 'primer-mensaje', title: 'Primer mensaje' },
  { key: 'opciones', title: 'Opciones' },
  { key: 'reconocimiento', title: 'Cómo reconoce' },
  { key: 'no-entiende', title: 'Cuando no entiende' },
  { key: 'humano', title: 'Paso a humano' },
  { key: 'despedida', title: 'Despedida' },
  { key: 'publicar', title: 'Probar y publicar' },
] as const;

export type StepKey = (typeof STEPS)[number]['key'];

const RESERVED = new Set(['bienvenida', 'no_entendi', 'despedida', 'fin', 'farewell', 'hablar_persona']);

/** Id estable a partir del título: "🚨 Emergencia" → "emergencia". */
export function slugify(title: string, taken: Iterable<string> = []): string {
  const used = new Set(taken);
  const base =
    title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_{2,}/g, '_')
      .slice(0, 30) || 'opcion';
  const safe = RESERVED.has(base) || base.startsWith('no_entendi') ? `${base}_op` : base;
  let candidate = safe;
  for (let n = 2; used.has(candidate); n++) candidate = `${safe}_${n}`;
  return candidate;
}

/** "urgente, auxilio,\n no abre" → ["urgente", "auxilio", "no abre"], sin repetidas. */
export function parseKeywords(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,\n]/)) {
    const word = raw.trim();
    const key = word.toLowerCase();
    if (!word || seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }
  return out;
}

export const keywordsToText = (keywords: string[]) => keywords.join(', ');

/** Con hasta 3 opciones el menú va en botones; con más, en lista. */
export const presentation = (spec: WizardSpec): 'botones' | 'lista' =>
  spec.options.length <= 3 ? 'botones' : 'lista';

/** Una opción nueva, lista para editar, con un id que no choca con las demás. */
export function newOption(kind: WizardOption['kind'], spec: WizardSpec): WizardOption {
  const taken = spec.options.map((o) => o.id);
  const handoff = { userResponse: 'Te comunico con alguien del equipo en un momento.', ownerAlert: 'Nuevo cliente: {{phone}}' };
  switch (kind) {
    case 'capture': {
      const id = slugify('pedido', taken);
      return {
        id,
        title: 'Hacer un pedido',
        kind,
        keywords: [],
        choices: null,
        question: '¿Qué necesitas? Cuéntanos en un solo mensaje.',
        saveAs: `datos_${id}`.slice(0, 40),
        confirm: null,
        handoff: { ...handoff, ownerAlert: `Nuevo pedido de {{phone}}:\n{{datos_${id}}}`.slice(0, 1000) },
      };
    }
    case 'info':
      return {
        id: slugify('info', taken),
        title: 'Información',
        kind,
        keywords: [],
        text: 'Escribe aquí la información.',
        actions: [{ title: 'Salir', goto: 'farewell' }],
      };
    case 'human':
      return { id: slugify('asesor', taken), title: 'Hablar con alguien', kind, keywords: ['asesor', 'humano', 'persona'], handoff };
  }
}

/** Quita una opción y los botones de información que llevaban a ella. */
export function removeOption(spec: WizardSpec, id: string): WizardSpec {
  return {
    ...spec,
    options: spec.options
      .filter((o) => o.id !== id)
      .map((o) => (o.kind === 'info' ? { ...o, actions: o.actions.filter((a) => a.goto !== id) } : o)),
  };
}

/** Variables que se pueden usar en los textos: las del negocio y las que guardan las opciones. */
export function availableVariables(spec: WizardSpec): string[] {
  const vars = ['nombre_negocio', 'phone'];
  for (const o of spec.options) {
    if (o.kind !== 'capture') continue;
    if (o.choices) vars.push(o.choices.saveAs);
    vars.push(o.saveAs);
  }
  return [...new Set(vars)];
}

/** Id de la opción a la que pertenece un paso del flow compilado ("emergencia__pregunta" → "emergencia"). */
export function optionOfNode(nodeId: string | undefined, spec: WizardSpec): string | null {
  if (!nodeId) return null;
  const id = nodeId.split('__')[0];
  return spec.options.some((o) => o.id === id) ? id : null;
}

/** En qué paso del asistente se arregla un hallazgo del validador. */
export function stepForIssue(issue: ValidationIssue, spec: WizardSpec): StepKey {
  if (issue.code === 'V-EST-07' || issue.code === 'V-CUMP-02') return 'reconocimiento';
  if (issue.code === 'V-CUMP-03' || issue.code === 'V-CUMP-04') return 'despedida';
  const node = issue.nodeId ?? '';
  if (node === 'hablar_persona') return 'humano';
  if (node === 'bienvenida') return 'primer-mensaje';
  if (node.startsWith('no_entendi')) return 'no-entiende';
  if (node === 'despedida') return 'despedida';
  if (optionOfNode(node, spec)) return node.endsWith('__persona') ? 'humano' : 'opciones';
  if (issue.code === 'V-CUMP-01') return 'humano';
  return 'publicar';
}

/**
 * Lo que propone el asistente al activar la inactividad (Fase 5): un
 * recordatorio a los 15 minutos y el cierre a la hora.
 */
export const DEFAULT_INACTIVITY: WizardInactivity = {
  reminder: { afterMinutes: 15, text: '¿Sigues ahí? Si quieres continuar, contesta este mensaje.' },
  close: { afterMinutes: 60, text: 'Cerramos la conversación por ahora. Escríbenos cuando quieras y empezamos de nuevo.' },
};

/** Tipos de respuesta que el asistente ofrece para una captura (C-04). */
export const CAPTURE_TYPES = [
  { value: 'free', label: 'Cualquier texto (no se revisa)' },
  { value: 'phone_mx', label: 'Teléfono de 10 dígitos' },
  { value: 'email', label: 'Correo' },
  { value: 'number', label: 'Número' },
  { value: 'date', label: 'Fecha' },
  { value: 'time', label: 'Hora' },
  { value: 'text', label: 'Texto con largo mínimo o máximo' },
] as const;
export type CaptureTypeChoice = (typeof CAPTURE_TYPES)[number]['value'];

/**
 * La revisión de una captura al elegir un tipo: "free" la quita; cambiar de
 * tipo conserva el mensaje, los intentos y a dónde sigue, y empieza la regla
 * de cero (un rango de número no aplica a un texto).
 */
export function checkForType(current: CaptureCheck | undefined, type: CaptureTypeChoice): CaptureCheck | undefined {
  if (type === 'free') return undefined;
  if (current?.rule.type === type) return current;
  return { maxAttempts: 3, onExhausted: 'human', ...current, rule: { type } as CaptureRule };
}

/** "" → sin valor; lo demás, número. Para los campos de rango y largo. */
export const optionalNumber = (text: string): number | undefined => (text.trim() === '' ? undefined : Number(text));

/** Largo como lo cuenta WhatsApp: por caracteres, no por unidades UTF-16 (un emoji cuenta uno). */
export const charCount = (text: string) => [...text].length;

/** "09:00-19:00", o vacío (sin horario = el bot atiende siempre). */
export const isValidHours = (text: string) =>
  text.trim() === '' || /^([01]?\d|2[0-3]):[0-5]\d\s*-\s*([01]?\d|2[0-3]):[0-5]\d$/.test(text.trim());
