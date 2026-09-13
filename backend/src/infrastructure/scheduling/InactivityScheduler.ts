import type pino from 'pino';
import type { InactivitySweeper } from '@/domain/conversation/InactivitySweeper';

export interface InactivitySchedulerDeps {
  sweeper: Pick<InactivitySweeper, 'sweepTenant'>;
  /** Tenants con el bot activo. */
  listTenants: () => Promise<string[]>;
  /** Registra lo que salió en `messages`, como las respuestas del webhook. */
  logOutbound?: (tenantId: string, to: string, text: string) => Promise<void>;
  /** Cada cuánto corre. Default: un minuto. */
  intervalMs?: number;
  logger: pino.Logger;
}

export interface InactivityTally {
  reminders: number;
  closes: number;
}

/**
 * Corre el barrido de inactividad (Fase 5) cada minuto sobre los tenants con
 * el bot activo.
 *
 * - Una pasada a la vez: si la anterior no terminó, esta se salta.
 * - Un tenant que falla no frena a los demás.
 * - Vive en el proceso, como el marcapasos de entrega. Con varias
 *   instancias cada una barrería; el reclamo en bot_users (migración 024)
 *   evita que un recordatorio salga dos veces.
 */
export class InactivityScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private readonly deps: InactivitySchedulerDeps) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.runOnce();
    }, this.deps.intervalMs ?? 60_000);
    // No mantiene vivo el proceso: lo mantiene Express.
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Una pasada. null si se saltó porque la anterior seguía corriendo. */
  async runOnce(): Promise<InactivityTally | null> {
    if (this.running) return null;
    this.running = true;
    const tally: InactivityTally = { reminders: 0, closes: 0 };
    try {
      let tenants: string[];
      try {
        tenants = await this.deps.listTenants();
      } catch (err) {
        this.deps.logger.error({ err }, 'Inactividad: no se pudo listar los tenants; se reintenta en la siguiente pasada');
        return tally;
      }

      for (const tenantId of tenants) {
        try {
          for (const outcome of await this.deps.sweeper.sweepTenant(tenantId)) {
            if (outcome.action === 'reminder') tally.reminders += 1;
            else tally.closes += 1;
            for (const message of outcome.outbound) {
              if (message.content.kind === 'text') {
                await this.deps.logOutbound?.(tenantId, message.to, message.content.text);
              }
            }
          }
        } catch (err) {
          this.deps.logger.error({ err, tenantId }, 'Inactividad: falló el barrido de un tenant; sigue con los demás');
        }
      }

      if (tally.reminders > 0 || tally.closes > 0) {
        this.deps.logger.info(tally, 'Barrido de inactividad');
      }
      return tally;
    } finally {
      this.running = false;
    }
  }
}
