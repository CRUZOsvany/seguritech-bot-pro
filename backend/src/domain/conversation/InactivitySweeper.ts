import type pino from 'pino';
import type { User } from '@/domain/entities';
import type { BotFlow, FlowInactivity } from '@/domain/entities/flow';
import type { ClockPort, TenantConfigPort, UserRepository } from '@/domain/ports';
import type { BusinessHoursService } from '@/domain/services/BusinessHoursService';
import { SESSION_TTL_MS, isSessionExpired } from '@/domain/services/SessionTtlPolicy';
import type { MessengerPort, OutboundMessage } from './OutboundMessage';
import type { DecisionStep } from './trace';
import { inactivityDue, type InactivityAction } from './inactivity';

export interface InactivitySweeperDeps {
  sessions: UserRepository;
  messenger: MessengerPort;
  tenantConfig: TenantConfigPort;
  /** El flow que atiende al tenant: el activo en producción, el que se prueba en simulación. */
  flows: { findActive(tenantId: string): Promise<BotFlow | null> };
  businessHours: BusinessHoursService;
  clock: ClockPort;
  logger: pino.Logger;
}

export interface InactivityOutcome {
  to: string;
  action: InactivityAction;
  /** Lo que salió: el recordatorio, el mensaje de cierre, o nada (cierre sin texto). */
  outbound: OutboundMessage[];
  trace: DecisionStep[];
}

/**
 * El barrido de inactividad (Fase 5): recorre las conversaciones de un
 * tenant que esperan al cliente y manda el recordatorio o cierra, según
 * `flow.inactivity`. Las reglas están en ./inactivity.ts.
 *
 * El mismo código en producción (InactivityScheduler, cada minuto) y en el
 * simulador del Studio (al adelantar el reloj); cambian los adaptadores.
 *
 * Antes de mandar, reclama en la sesión (markInactivityReminder,
 * closeInactiveSession): si el cliente escribió entre la lectura y el
 * reclamo, o si otra pasada ya lo hizo, no sale nada. Se reclama ANTES de
 * enviar a propósito: si el envío falla, ese recordatorio se pierde, pero
 * nunca sale dos veces.
 */
export class InactivitySweeper {
  constructor(private readonly deps: InactivitySweeperDeps) {}

  /** Una pasada sobre un tenant. Una conversación que falla se registra y no frena a las demás. */
  async sweepTenant(tenantId: string): Promise<InactivityOutcome[]> {
    const flow = await this.deps.flows.findActive(tenantId);
    const inactivity = flow?.inactivity;
    if (!inactivity) return [];
    const config = await this.deps.tenantConfig.getConfig(tenantId);
    if (!config) return [];

    const now = this.deps.clock.now();
    const soonest = Math.min(inactivity.reminder?.after_minutes ?? Infinity, inactivity.close.after_minutes);
    const candidates = await this.deps.sessions.listAwaitingReply(
      tenantId,
      new Date(now.getTime() - SESSION_TTL_MS),
      new Date(now.getTime() - soonest * 60_000),
    );
    const hours = {
      horarioSemana: config.horarioSemana,
      horarioSabado: config.horarioSabado,
      abreDomingo: config.abreDomingo,
    };

    const outcomes: InactivityOutcome[] = [];
    for (const user of candidates) {
      const sessionExpired =
        !!user.lastInboundAt && isSessionExpired(this.deps.businessHours, hours, user.lastInboundAt, now);
      const action = inactivityDue({ inactivity, user, now, sessionExpired });
      if (!action) continue;
      try {
        const outcome =
          action === 'reminder'
            ? await this.remind(tenantId, user, inactivity, now)
            : await this.close(tenantId, user, inactivity);
        if (outcome) outcomes.push(outcome);
      } catch (err) {
        this.deps.logger.error(
          { err, tenantId, to: user.phoneNumber, action },
          'Inactividad: no se pudo atender una conversación; sigue con las demás',
        );
      }
    }
    return outcomes;
  }

  private async remind(
    tenantId: string,
    user: User,
    inactivity: FlowInactivity,
    now: Date,
  ): Promise<InactivityOutcome | null> {
    const reminder = inactivity.reminder!;
    const claimed = await this.deps.sessions.markInactivityReminder(tenantId, user.phoneNumber, user.lastInboundAt!, now);
    if (!claimed) return null;

    const message = textTo(user.phoneNumber, reminder.text);
    await this.deps.messenger.send(tenantId, message);
    this.deps.logger.info({ tenantId, to: user.phoneNumber, nodeId: user.currentNodeId }, 'Recordatorio de inactividad enviado');
    return {
      to: user.phoneNumber,
      action: 'reminder',
      outbound: [message],
      trace: [{ kind: 'inactivity', action: 'reminder', afterMinutes: reminder.after_minutes, nodeId: user.currentNodeId!, sent: true }],
    };
  }

  private async close(tenantId: string, user: User, inactivity: FlowInactivity): Promise<InactivityOutcome | null> {
    const { after_minutes, text } = inactivity.close;
    const closed = await this.deps.sessions.closeInactiveSession(tenantId, user.phoneNumber, user.lastInboundAt!);
    if (!closed) return null;

    const outbound: OutboundMessage[] = [];
    if (text?.trim()) {
      const message = textTo(user.phoneNumber, text);
      await this.deps.messenger.send(tenantId, message);
      outbound.push(message);
    }
    this.deps.logger.info({ tenantId, to: user.phoneNumber, nodeId: user.currentNodeId }, 'Conversación cerrada por inactividad');
    return {
      to: user.phoneNumber,
      action: 'close',
      outbound,
      trace: [
        { kind: 'inactivity', action: 'close', afterMinutes: after_minutes, nodeId: user.currentNodeId!, sent: outbound.length > 0 },
        // Lo capturado se borra: el "Por qué" lo lista como variables borradas.
        ...Object.keys(user.context ?? {})
          .filter((key) => !key.startsWith('__'))
          .map((key): DecisionStep => ({ kind: 'context_update', key, value: null })),
      ],
    };
  }
}

function textTo(to: string, text: string): OutboundMessage {
  return { to, audience: 'customer', content: { kind: 'text', text } };
}
