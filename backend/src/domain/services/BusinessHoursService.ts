/**
 * Gatea si el negocio está abierto ahora mismo (§2.2 del plan V1 —
 * `.claude/PLAN_V1_BOT_FLOWS_SIN_IA.md`). El gap que resuelve: `tenants.
 * horario_semana/horario_sabado` existen como texto libre desde siempre
 * (editable en el panel), pero nada comparaba la hora real contra ellos —
 * el bot podía confirmar una cita a las 3am.
 *
 * Formato esperado por campo: "HH:MM-HH:MM" (24h). Soporta rango que cruza
 * medianoche (ej. "22:00-02:00", típico de cerrajería de urgencias). Texto
 * vacío/null o que no matchea el formato = "unknown" → fail-open (isOpen
 * true): un tenant que todavía no reformateó su horario a este formato
 * simple NO debe quedar bloqueado por accidente; simplemente no se gatea.
 *
 * No hay campo `horario_domingo` en el schema (solo `abre_domingo`
 * boolean) — si abreDomingo=true, domingo usa el MISMO rango que
 * horarioSabado (decisión documentada, no hay otro dato del que partir).
 *
 * Timezone: hardcodeado a America/Mexico_City (alcance V1 — el schema no
 * tiene una columna de timezone por tenant todavía; agregarla es la
 * extensión natural si algún tenant real cae en otra zona horaria de México).
 */

export interface BusinessHours {
  horarioSemana: string | null;
  horarioSabado: string | null;
  abreDomingo: boolean;
}

export interface BusinessHoursCheck {
  isOpen: boolean;
  /** true si el horario configurado no se pudo parsear — isOpen siempre true en ese caso. */
  unknown: boolean;
}

const RANGE_RE = /^(\d{1,2}):([0-5]\d)\s*-\s*(\d{1,2}):([0-5]\d)$/;
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

export class BusinessHoursService {
  constructor(private readonly timezone: string = 'America/Mexico_City') {}

  isOpenNow(hours: BusinessHours, now: Date = new Date()): BusinessHoursCheck {
    const { weekday, minutesOfDay } = this.localParts(now);

    if (weekday === 0) {
      // Domingo: sin horario propio en el schema — usa el de sábado si abre.
      // `abreDomingo=false` SOLO gatea (cierra) si el tenant configuró algo
      // de horario_semana/horario_sabado — si no configuró nada todavía,
      // `abreDomingo` sigue en su default de columna (false) sin que el
      // operador lo haya decidido a propósito, y un tenant recién creado NO
      // debe amanecer "cerrado" los domingos antes de tocar el panel.
      if (!this.hasAnyConfiguredRange(hours)) return { isOpen: true, unknown: true };
      if (!hours.abreDomingo) return { isOpen: false, unknown: false };
      return this.checkRange(hours.horarioSabado, minutesOfDay);
    }
    if (weekday === 6) {
      return this.checkRange(hours.horarioSabado, minutesOfDay);
    }
    return this.checkRange(hours.horarioSemana, minutesOfDay);
  }

  /**
   * DEC-07 (auditoría 2026-08-26): true si el negocio estuvo cerrado en
   * algún momento entre `from` y `to`. Usado para tratar un cierre real
   * (la noche, la comida) como frontera de una conversación, incluso si el
   * TTL numérico de sesión (2h, ver BotController) todavía no se cumplió —
   * "cierra a las 2pm por comida, cliente vuelve a las 4pm" son solo 2h,
   * pero sigue siendo una conversación nueva.
   *
   * Sampling cada 15 min sobre `isOpenNow()` — no reimplementa los límites
   * exactos de horario (cruces de medianoche, domingo, etc.), reutiliza el
   * mismo parser ya probado. Cualquier cierre real de al menos 15 min se
   * detecta; el caso de uso real (gaps de sesión de horas, no días) nunca
   * se acerca al tope de seguridad.
   */
  hadClosureBetween(hours: BusinessHours, from: Date, to: Date): boolean {
    if (to.getTime() <= from.getTime()) return false;
    const STEP_MS = 15 * 60 * 1000;
    const MAX_SAMPLES = 500; // ~5 días a 15 min — tope de seguridad, no se espera llegar aquí
    let sampled = 0;
    for (let t = from.getTime(); t <= to.getTime() && sampled < MAX_SAMPLES; t += STEP_MS, sampled += 1) {
      if (!this.isOpenNow(hours, new Date(t)).isOpen) return true;
    }
    return false;
  }

  private hasAnyConfiguredRange(hours: BusinessHours): boolean {
    return this.parseRange(hours.horarioSemana) !== null || this.parseRange(hours.horarioSabado) !== null;
  }

  private checkRange(raw: string | null, minutesOfDay: number): BusinessHoursCheck {
    const range = this.parseRange(raw);
    if (!range) return { isOpen: true, unknown: true };

    const { startMin, endMin } = range;
    if (startMin === endMin) return { isOpen: true, unknown: false }; // "00:00-00:00" ⇒ abierto 24h
    if (startMin < endMin) {
      return { isOpen: minutesOfDay >= startMin && minutesOfDay < endMin, unknown: false };
    }
    // Cruza medianoche (ej. 22:00-02:00): abierto si es >= inicio O < fin.
    return { isOpen: minutesOfDay >= startMin || minutesOfDay < endMin, unknown: false };
  }

  private parseRange(raw: string | null): { startMin: number; endMin: number } | null {
    if (!raw) return null;
    const m = raw.trim().match(RANGE_RE);
    if (!m) return null;
    const startH = Number(m[1]);
    const endH = Number(m[3]);
    if (startH > 23 || endH > 23) return null;
    return {
      startMin: startH * 60 + Number(m[2]),
      endMin: endH * 60 + Number(m[4]),
    };
  }

  private localParts(now: Date): { weekday: number; minutesOfDay: number } {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: this.timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);

    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const weekday = WEEKDAY_INDEX[get('weekday')] ?? now.getUTCDay();
    const hour = Number(get('hour'));
    const minute = Number(get('minute'));
    return { weekday, minutesOfDay: hour * 60 + minute };
  }
}
