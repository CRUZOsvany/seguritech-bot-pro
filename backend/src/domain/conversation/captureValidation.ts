/**
 * Validación de capturas (C-04): qué acepta un paso `wait_input` como
 * respuesta, cómo la normaliza antes de guardarla y qué contesta si no sirve.
 *
 * Funciones puras: las usan el motor (FlowInterpreter), el validador de
 * diseño, el explorador de ramas y el "Por qué". Ubicación e imagen no están:
 * el motor todavía no recibe esos mensajes (hallazgos H-4 y H-8).
 */

export type CaptureValidation =
  | { type: 'phone_mx' }
  | { type: 'email' }
  | { type: 'number'; integer?: boolean; min?: number; max?: number }
  | { type: 'date' }
  | { type: 'time' }
  | { type: 'text'; min_length?: number; max_length?: number };

/** `'numeric'` es la validación de antes de C-04 (papelería); se conserva tal cual. */
export type AnyCaptureValidation = 'numeric' | CaptureValidation;
export type CaptureValidatorName = 'numeric' | CaptureValidation['type'];

/**
 * Clave reservada de la sesión donde se cuentan las respuestas inválidas
 * seguidas de un paso. Se borra al aceptar una respuesta o al agotar los
 * intentos.
 */
export const CAPTURE_ATTEMPTS_KEY = '__capture_attempts';

export interface CaptureCheck {
  valid: boolean;
  /** Lo que se guarda: la respuesta normalizada. Sin él se guarda el mensaje tal cual. */
  value?: string;
}

export const validatorName = (v: AnyCaptureValidation): CaptureValidatorName => (v === 'numeric' ? 'numeric' : v.type);

export function checkCapture(v: AnyCaptureValidation, input: string): CaptureCheck {
  const text = input.trim();
  if (v === 'numeric') return { valid: /^\d+([.,]\d+)?$/.test(text) };
  switch (v.type) {
  case 'phone_mx':
    return checkPhoneMx(text);
  case 'email': {
    const email = text.toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? { valid: true, value: email } : { valid: false };
  }
  case 'number':
    return checkNumber(v, text);
  case 'date':
    return checkDate(text);
  case 'time':
    return checkTime(text);
  case 'text': {
    const length = [...text].length;
    const ok = length > 0 && length >= (v.min_length ?? 1) && length <= (v.max_length ?? Infinity);
    return ok ? { valid: true, value: text } : { valid: false };
  }
  }
}

/** Teléfono de México: 10 dígitos. Acepta +52, 52 o 521 delante, espacios, guiones y paréntesis. */
function checkPhoneMx(text: string): CaptureCheck {
  if (!/^\+?[\d\s\-().]+$/.test(text)) return { valid: false };
  let digits = text.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('521')) digits = digits.slice(3);
  else if (digits.length === 12 && digits.startsWith('52')) digits = digits.slice(2);
  return /^\d{10}$/.test(digits) ? { valid: true, value: digits } : { valid: false };
}

function checkNumber(v: Extract<CaptureValidation, { type: 'number' }>, text: string): CaptureCheck {
  if (!/^-?\d+([.,]\d+)?$/.test(text)) return { valid: false };
  const n = Number(text.replace(',', '.'));
  if (v.integer && !Number.isInteger(n)) return { valid: false };
  if (v.min !== undefined && n < v.min) return { valid: false };
  if (v.max !== undefined && n > v.max) return { valid: false };
  return { valid: true, value: String(n) };
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const pad = (n: number) => String(n).padStart(2, '0');
const COMBINING_MARKS_RE = new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, 'g');

/** "15/03/2026", "15-3-26", "15/03" o "15 de marzo (de 2026)". Se guarda como dd/mm/aaaa, o dd/mm sin año. */
function checkDate(text: string): CaptureCheck {
  const lower = text.toLowerCase().normalize('NFD').replace(COMBINING_MARKS_RE, '');
  let day: number;
  let month: number;
  let year: number | null = null;
  const numeric = lower.match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2}|\d{4}))?$/);
  const words = lower.match(/^(\d{1,2}) de ([a-z]+)(?: (?:de|del) (\d{4}))?$/);
  if (numeric) {
    day = Number(numeric[1]);
    month = Number(numeric[2]);
    if (numeric[3]) year = numeric[3].length === 2 ? 2000 + Number(numeric[3]) : Number(numeric[3]);
  } else if (words) {
    day = Number(words[1]);
    month = MONTHS.indexOf(words[2] === 'setiembre' ? 'septiembre' : words[2]) + 1;
    if (words[3]) year = Number(words[3]);
  } else {
    return { valid: false };
  }
  if (month < 1 || month > 12 || day < 1) return { valid: false };
  // Sin año se usa uno bisiesto: "29/02" es una fecha posible.
  const daysInMonth = new Date(Date.UTC(year ?? 2024, month, 0)).getUTCDate();
  if (day > daysInMonth) return { valid: false };
  return { valid: true, value: `${pad(day)}/${pad(month)}${year !== null ? `/${year}` : ''}` };
}

/** "17:30", "5:30 pm", "5 pm", "17 h" o "17:30 hrs". Se guarda como HH:MM de 24 horas. */
function checkTime(text: string): CaptureCheck {
  const lower = text.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
  const m = lower.match(/^(\d{1,2})(?::(\d{2}))? ?(am|pm|a m|p m|h|hr|hrs|horas)?$/);
  if (!m || (!m[2] && !m[3])) return { valid: false };
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const suffix = m[3]?.replace(' ', '');
  if (suffix === 'am' || suffix === 'pm') {
    if (hour < 1 || hour > 12) return { valid: false };
    hour = (hour % 12) + (suffix === 'pm' ? 12 : 0);
  }
  if (hour > 23 || minute > 59) return { valid: false };
  return { valid: true, value: `${pad(hour)}:${pad(minute)}` };
}

/** Lo que se contesta si la respuesta no sirve y el paso no trae su propio mensaje. */
export function defaultCaptureError(v: AnyCaptureValidation): string {
  if (v === 'numeric') return 'No logré entender la cantidad 🤔. Escríbela solo con el número, por ejemplo: *3*';
  switch (v.type) {
  case 'phone_mx':
    return 'Ese número no parece un teléfono de 10 dígitos 🤔. Escríbelo así: *747 123 4567*';
  case 'email':
    return 'Ese correo no parece válido 🤔. Escríbelo así: *nombre@correo.com*';
  case 'number':
    return `Escribe solo el número${rangeText(v.min, v.max)}, por ejemplo: *${sampleNumber(v)}*`;
  case 'date':
    return 'No entendí la fecha 🤔. Escríbela así: *15/03/2026*';
  case 'time':
    return 'No entendí la hora 🤔. Escríbela así: *10:30* o *5 pm*';
  case 'text':
    return v.max_length !== undefined
      ? `Tu respuesta debe tener entre ${v.min_length ?? 1} y ${v.max_length} caracteres.`
      : `Cuéntanos un poco más: al menos ${v.min_length ?? 1} caracteres.`;
  }
}

/** "un teléfono de 10 dígitos", para el "Por qué" y el panel. */
export function describeCapture(v: AnyCaptureValidation): string {
  if (v === 'numeric') return 'un número';
  switch (v.type) {
  case 'phone_mx':
    return 'un teléfono de 10 dígitos';
  case 'email':
    return 'un correo';
  case 'number':
    return `${v.integer ? 'un número entero' : 'un número'}${rangeText(v.min, v.max)}`;
  case 'date':
    return 'una fecha';
  case 'time':
    return 'una hora';
  case 'text':
    return v.max_length !== undefined
      ? `un texto de ${v.min_length ?? 1} a ${v.max_length} caracteres`
      : `un texto de al menos ${v.min_length ?? 1} caracteres`;
  }
}

/** Una respuesta que la validación acepta. La usa el explorador para seguir por el camino bueno. */
export function sampleCapture(v: AnyCaptureValidation): string {
  if (v === 'numeric') return '3';
  switch (v.type) {
  case 'phone_mx':
    return '747 123 4567';
  case 'email':
    return 'cliente@ejemplo.com';
  case 'number':
    return String(sampleNumber(v));
  case 'date':
    return '15/03/2026';
  case 'time':
    return '10:30';
  case 'text': {
    const base = 'Dato de prueba del explorador 123'.padEnd(v.min_length ?? 0, '.');
    return v.max_length !== undefined ? base.slice(0, v.max_length) : base;
  }
  }
}

function sampleNumber(v: Extract<CaptureValidation, { type: 'number' }>): number {
  if (v.min !== undefined && v.min > 3) return v.min;
  if (v.max !== undefined && v.max < 3) return v.max;
  return 3;
}

function rangeText(min: number | undefined, max: number | undefined): string {
  if (min !== undefined && max !== undefined) return ` entre ${min} y ${max}`;
  if (min !== undefined) return ` de ${min} o más`;
  if (max !== undefined) return ` de hasta ${max}`;
  return '';
}
