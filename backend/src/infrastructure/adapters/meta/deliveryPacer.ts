import type pino from 'pino';

/**
 * Orden de entrega (Fase 5, §7.7 de la especificación) y pausa entre
 * mensajes (DEC-08).
 *
 * Meta no garantiza que varios mensajes lleguen en el orden en que se
 * mandaron ("not guaranteed to match the order of your API requests"). Antes
 * de mandar el siguiente mensaje a un mismo cliente, este marcapasos espera
 * el estado "entregado" del anterior, con un tope para no colgar el turno, y
 * deja además la pausa de 600–1200 ms que decidió DEC-08.
 *
 * - "Leído" también cuenta como entregado (puede llegar antes, o solo), y
 *   "fallido" deja seguir: esperar no lo va a entregar.
 * - Cada cliente va por su lado: la alerta al dueño no espera al cliente.
 * - Un mensaje anterior de hace más de `sameTurnMs` ya no es del mismo turno.
 * - En memoria: el estado llega por el webhook al mismo proceso. Con varias
 *   instancias, el estado podría caer en otra y aquí se cumpliría el tope.
 */

export interface DeliveryPacerOptions {
  /** Cuánto se espera el "entregado" del mensaje anterior. */
  deliveryTimeoutMs?: number;
  /** DEC-08: pausa entre mensajes seguidos al mismo cliente. */
  minGapMs?: number;
  maxGapMs?: number;
  /** Pasado este tiempo, el mensaje anterior ya no cuenta. */
  sameTurnMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  logger?: pino.Logger;
}

/** Estados que dejan mandar el siguiente mensaje. */
const SETTLED = new Set(['delivered', 'read', 'failed']);
const MAX_REMEMBERED = 2000;

export class DeliveryPacer {
  private readonly deliveryTimeoutMs: number;
  private readonly minGapMs: number;
  private readonly maxGapMs: number;
  private readonly sameTurnMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly logger?: pino.Logger;

  /** Último mensaje mandado a cada cliente. */
  private readonly last = new Map<string, { wamid: string; sentAt: number }>();
  /** Mensajes que ya se entregaron, leyeron o fallaron (los más recientes). */
  private readonly settled = new Set<string>();
  private readonly waiters = new Map<string, Set<() => void>>();

  constructor(opts: DeliveryPacerOptions = {}) {
    this.deliveryTimeoutMs = opts.deliveryTimeoutMs ?? 2000;
    this.minGapMs = opts.minGapMs ?? 600;
    this.maxGapMs = opts.maxGapMs ?? 1200;
    this.sameTurnMs = opts.sameTurnMs ?? 15_000;
    this.now = opts.now ?? (() => Date.now());
    this.sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.random = opts.random ?? Math.random;
    this.logger = opts.logger;
  }

  /** Espera lo necesario antes de mandarle otro mensaje a `recipient`. */
  async beforeSend(recipient: string): Promise<void> {
    const prev = this.last.get(recipient);
    if (!prev) return;
    if (this.now() - prev.sentAt > this.sameTurnMs) {
      this.last.delete(recipient);
      return;
    }

    if (!this.settled.has(prev.wamid)) {
      const delivered = await this.waitSettled(prev.wamid, this.deliveryTimeoutMs);
      if (!delivered) {
        this.logger?.info({ recipient, wamid: prev.wamid }, 'Sin "entregado" a tiempo del mensaje anterior — se manda el siguiente igual');
      }
    }

    const gap = this.minGapMs + Math.floor(this.random() * (this.maxGapMs - this.minGapMs + 1));
    const rest = gap - (this.now() - prev.sentAt);
    if (rest > 0) await this.sleep(rest);
  }

  /** Registra el mensaje que se acaba de mandar. Sin id (Meta no lo devolvió), no hay a qué esperar. */
  sent(recipient: string, wamid: string | undefined): void {
    if (wamid) this.last.set(recipient, { wamid, sentAt: this.now() });
    else this.last.delete(recipient);
  }

  /** Un estado del webhook (sent, delivered, read, failed). */
  onStatus(wamid: string, status: string): void {
    if (!SETTLED.has(status)) return;
    this.settled.add(wamid);
    if (this.settled.size > MAX_REMEMBERED) {
      const oldest = this.settled.values().next().value;
      if (oldest !== undefined) this.settled.delete(oldest);
    }
    const waiting = this.waiters.get(wamid);
    if (waiting) {
      this.waiters.delete(wamid);
      for (const resolve of waiting) resolve();
    }
  }

  /** true si llegó el estado; false si se cumplió el tope. */
  private waitSettled(wamid: string, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      let done = false;
      const onSettled = () => {
        if (done) return;
        done = true;
        resolve(true);
      };
      const set = this.waiters.get(wamid) ?? new Set<() => void>();
      set.add(onSettled);
      this.waiters.set(wamid, set);
      void this.sleep(timeoutMs).then(() => {
        if (done) return;
        done = true;
        const current = this.waiters.get(wamid);
        current?.delete(onSettled);
        if (current && current.size === 0) this.waiters.delete(wamid);
        resolve(false);
      });
    });
  }
}
