/**
 * BusinessHoursService (§2.2 del plan V1). Todos los `now` se construyen con
 * fechas conocidas y se verifica contra America/Mexico_City (timezone
 * default) para no depender del TZ del entorno donde corre el test.
 */
import { BusinessHoursService } from '@/domain/services/BusinessHoursService';

// 2026-08-24 es lunes; 2026-08-29 sábado; 2026-08-30 domingo (verificado
// contra calendario real). Horas en UTC-6 (CDMX no observa horario de
// verano desde 2022) — para no depender de eso, construimos las fechas ya
// en UTC con el offset sumado (ej. "14:30 CDMX" = "20:30Z"). Date.UTC hace
// el rollover de día automáticamente si hh+6 >= 24 (ej. 23:30 CDMX).
function cdmx(dateIso: string, hh: number, mm: number): Date {
  const [y, m, d] = dateIso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh + 6, mm, 0));
}

const MONDAY = '2026-08-24';
const SATURDAY = '2026-08-29';
const SUNDAY = '2026-08-30';

describe('BusinessHoursService.isOpenNow', () => {
  const service = new BusinessHoursService();

  it('sin horario configurado (todo null) nunca gatea, ningún día, ni domingo', () => {
    const hours = { horarioSemana: null, horarioSabado: null, abreDomingo: false };
    expect(service.isOpenNow(hours, cdmx(MONDAY, 3, 0))).toEqual({ isOpen: true, unknown: true });
    expect(service.isOpenNow(hours, cdmx(SATURDAY, 3, 0))).toEqual({ isOpen: true, unknown: true });
    expect(service.isOpenNow(hours, cdmx(SUNDAY, 3, 0))).toEqual({ isOpen: true, unknown: true });
  });

  it('lunes dentro del rango de horarioSemana → abierto', () => {
    const hours = { horarioSemana: '09:00-19:00', horarioSabado: null, abreDomingo: false };
    expect(service.isOpenNow(hours, cdmx(MONDAY, 14, 30))).toEqual({ isOpen: true, unknown: false });
  });

  it('lunes fuera del rango de horarioSemana → cerrado (el caso que motivó el feature: 3am)', () => {
    const hours = { horarioSemana: '09:00-19:00', horarioSabado: null, abreDomingo: false };
    expect(service.isOpenNow(hours, cdmx(MONDAY, 3, 0))).toEqual({ isOpen: false, unknown: false });
  });

  it('límite exacto: la hora de cierre NO está incluida (19:00 = cerrado)', () => {
    const hours = { horarioSemana: '09:00-19:00', horarioSabado: null, abreDomingo: false };
    expect(service.isOpenNow(hours, cdmx(MONDAY, 19, 0)).isOpen).toBe(false);
    expect(service.isOpenNow(hours, cdmx(MONDAY, 8, 59)).isOpen).toBe(false);
    expect(service.isOpenNow(hours, cdmx(MONDAY, 9, 0)).isOpen).toBe(true);
  });

  it('sábado usa horarioSabado, no horarioSemana', () => {
    const hours = { horarioSemana: '09:00-19:00', horarioSabado: '10:00-14:00', abreDomingo: false };
    expect(service.isOpenNow(hours, cdmx(SATURDAY, 15, 0))).toEqual({ isOpen: false, unknown: false });
    expect(service.isOpenNow(hours, cdmx(SATURDAY, 11, 0))).toEqual({ isOpen: true, unknown: false });
  });

  it('domingo con abreDomingo=false y horario configurado → siempre cerrado', () => {
    const hours = { horarioSemana: '09:00-19:00', horarioSabado: '10:00-14:00', abreDomingo: false };
    expect(service.isOpenNow(hours, cdmx(SUNDAY, 11, 0))).toEqual({ isOpen: false, unknown: false });
  });

  it('domingo con abreDomingo=true usa el rango de horarioSabado (no hay campo propio)', () => {
    const hours = { horarioSemana: '09:00-19:00', horarioSabado: '10:00-14:00', abreDomingo: true };
    expect(service.isOpenNow(hours, cdmx(SUNDAY, 11, 0))).toEqual({ isOpen: true, unknown: false });
    expect(service.isOpenNow(hours, cdmx(SUNDAY, 16, 0))).toEqual({ isOpen: false, unknown: false });
  });

  it('rango que cruza medianoche (cerrajería de urgencias) — abierto antes y después del corte', () => {
    const hours = { horarioSemana: '22:00-02:00', horarioSabado: null, abreDomingo: false };
    expect(service.isOpenNow(hours, cdmx(MONDAY, 23, 30)).isOpen).toBe(true);
    expect(service.isOpenNow(hours, cdmx(MONDAY, 1, 30)).isOpen).toBe(true);
    expect(service.isOpenNow(hours, cdmx(MONDAY, 10, 0)).isOpen).toBe(false);
  });

  it('"00:00-00:00" se interpreta como abierto 24h', () => {
    const hours = { horarioSemana: '00:00-00:00', horarioSabado: null, abreDomingo: false };
    expect(service.isOpenNow(hours, cdmx(MONDAY, 3, 0))).toEqual({ isOpen: true, unknown: false });
  });

  it('texto no parseable (formato viejo/libre) → fail-open con unknown:true', () => {
    const hours = { horarioSemana: 'Lunes a viernes de 9 a 7', horarioSabado: null, abreDomingo: false };
    expect(service.isOpenNow(hours, cdmx(MONDAY, 3, 0))).toEqual({ isOpen: true, unknown: true });
  });

  it('respeta un timezone distinto pasado por constructor', () => {
    const utcService = new BusinessHoursService('UTC');
    const hours = { horarioSemana: '09:00-19:00', horarioSabado: null, abreDomingo: false };
    // 14:30 CDMX = 20:30 UTC → en UTC eso cae fuera de 09:00-19:00.
    expect(utcService.isOpenNow(hours, cdmx(MONDAY, 14, 30)).isOpen).toBe(false);
  });
});

describe('BusinessHoursService.hadClosureBetween (DEC-07, auditoría 2026-08-26)', () => {
  const service = new BusinessHoursService();
  const hours = { horarioSemana: '09:00-19:00', horarioSabado: '09:00-19:00', abreDomingo: false };

  it('ambos extremos dentro del rango, sin cierre entre medio: false', () => {
    expect(service.hadClosureBetween(hours, cdmx(MONDAY, 10, 0), cdmx(MONDAY, 12, 0))).toBe(false);
  });

  it('el rango cruza el cierre de las 19:00: true', () => {
    // 18:30 (abierto) a 19:30 (cerrado) el mismo lunes.
    expect(service.hadClosureBetween(hours, cdmx(MONDAY, 18, 30), cdmx(MONDAY, 19, 30))).toBe(true);
  });

  it('el rango cruza toda una noche cerrada (18:00 lunes a 10:00 martes): true', () => {
    expect(service.hadClosureBetween(hours, cdmx(MONDAY, 18, 0), cdmx('2026-08-25', 10, 0))).toBe(true);
  });

  it('to <= from: false sin evaluar nada (evita loop infinito con timestamps invertidos)', () => {
    expect(service.hadClosureBetween(hours, cdmx(MONDAY, 12, 0), cdmx(MONDAY, 10, 0))).toBe(false);
    expect(service.hadClosureBetween(hours, cdmx(MONDAY, 12, 0), cdmx(MONDAY, 12, 0))).toBe(false);
  });

  it('sin horario configurado (fail-open): nunca hay cierre que detectar', () => {
    const noHours = { horarioSemana: null, horarioSabado: null, abreDomingo: false };
    expect(service.hadClosureBetween(noHours, cdmx(MONDAY, 3, 0), cdmx(MONDAY, 23, 0))).toBe(false);
  });
});
