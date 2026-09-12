import type pino from 'pino';
import { Message, User, UserState } from '@/domain/entities';
import type { BotFlow } from '@/domain/entities/flow';
import type {
  AuditPort,
  ClockPort,
  IdGenerator,
  TenantConfigPort,
  UserRepository,
} from '@/domain/ports';
import { SESSION_EXPIRED_NOTICE, isSessionExpired } from '@/domain/services/SessionTtlPolicy';
import { enrichOwnerAlert } from '@/domain/services/OwnerAlertFormatter';
import type { FlowInterpreter } from '@/domain/services/FlowInterpreter';
import type { BusinessHoursService } from '@/domain/services/BusinessHoursService';
import type { DecisionStep } from './trace';
import { matchEscape, resolveEscape } from './escapeWords';
import {
  representativeText,
  type MessengerPort,
  type OutboundContent,
  type OutboundMessage,
} from './OutboundMessage';

/**
 * Comandos que el DUEÑO del negocio puede mandarle al número del bot para
 * reanudar una conversación pausada por handoff humano, sin tocar el panel
 * (P4, D4). Match EXACTO y case-insensitive — cualquier otro mensaje del
 * dueño sigue de largo al FlowInterpreter normal, para que pueda seguir
 * auto-probando su propio bot como si fuera cliente.
 */
const OWNER_RESUME_COMMANDS = ['#listo', '#reanudar'] as const;

export const OPT_OUT_CONFIRMATION =
  'Listo, no volverás a recibir mensajes de este número. ' +
  'Si cambias de opinión, solo escríbenos de nuevo cuando quieras.';

export const MAINTENANCE_TEXT =
  '⚙️ Este servicio está siendo configurado. Por favor intenta más tarde.';

const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface InboundMessage {
  tenantId: string;
  from: string;
  /** Lo que entregó el parser de Meta: texto, título de botón, id de fila… */
  content: string;
  metaMessageId?: string;
}

export interface EngineTurn {
  /** Lo que se envió, en orden. Solo lo que el messenger aceptó. */
  outbound: OutboundMessage[];
  trace: DecisionStep[];
  /**
   * Último texto enviado: el contrato de BotController.processMessage, que
   * ExpressServer usa para el log outbound.
   */
  lastText: string | null;
}

export interface ConversationEngineDeps {
  sessions: UserRepository;
  messenger: MessengerPort;
  tenantConfig: TenantConfigPort;
  /** De dónde sale el flow que atiende al tenant: el activo en producción, el que se prueba en simulación. */
  flows: { findActive(tenantId: string): Promise<BotFlow | null> };
  interpreter: FlowInterpreter;
  businessHours: BusinessHoursService;
  audit: AuditPort;
  clock: ClockPort;
  ids: IdGenerator;
  /** Cuánto se silencia el bot tras un paso a humano (HANDOFF_PAUSE_MINUTES, D3). */
  handoffPauseMs: number;
  logger: pino.Logger;
}

/**
 * Un turno de conversación completo: todo lo que pasa entre que llega un
 * mensaje del cliente y el bot termina de contestar.
 *
 * Es la orquestación que vivía en BotController.processMessage, movida al
 * dominio sin cambiar una sola decisión, para que producción y el simulador
 * del Studio ejecuten EL MISMO código (regla 1 de la especificación). Lo único
 * que cambia entre los dos son los adaptadores: dónde se guarda la sesión, por
 * dónde sale el mensaje y de dónde sale la hora.
 *
 * Orden de los gates, el mismo de siempre:
 *   1. sin configuración → nada
 *   2. comando del dueño (#listo)
 *   3. opt-out / opt-in implícito (palabras de baja del flow, C-08)
 *   4. sin flow → "en mantenimiento"
 *   5. pausa por paso a humano → silencio
 *   6. sesión expirada → aviso y reinicio
 *   7. fuera de horario → aviso, sin ejecutar el flow
 *   8. intérprete del flow
 */
export class ConversationEngine {
  constructor(private readonly deps: ConversationEngineDeps) {}

  async handle(inbound: InboundMessage): Promise<EngineTurn> {
    const { tenantId, from, content, metaMessageId } = inbound;
    const { logger } = this.deps;
    const turn = new TurnRecorder(tenantId, this.deps.messenger);

    try {
      logger.info(
        { tenantId, from, contentPreview: content.slice(0, 80) },
        'Mensaje recibido',
      );

      // 1. Cargar configuración del tenant (con caché)
      const config = await this.deps.tenantConfig.getConfig(tenantId);
      if (!config) {
        logger.error(
          { tenantId },
          'No hay bot_configuration para este tenant — ignorando mensaje',
        );
        turn.trace.push({ kind: 'gate', gate: 'no_config' });
        return turn.result();
      }

      // 1.5. Gate de comandos del dueño (D4/P4): si el mensaje viene del
      // ownerPhone y matchea EXACTO un comando conocido, se resuelve aquí y
      // NUNCA se toca el FlowInterpreter. Va antes de cargar el flow porque
      // no lo necesita. Cualquier otro mensaje del dueño sigue de largo.
      if (config.ownerPhone && isSamePhone(from, config.ownerPhone)) {
        // null = el mensaje no matcheó ningún comando -> sigue de largo al flow.
        const handled = await this.tryHandleOwnerCommand(turn, tenantId, from, content);
        if (handled) return turn.result();
      }

      // 2. Construir entidad del dominio
      const message: Message = {
        id: this.deps.ids.uuid(),
        tenantId,
        from,
        content,
        timestamp: this.deps.clock.now(),
        metaMessageId,
      };
      turn.trace.push({ kind: 'input', content, messageId: metaMessageId ?? null });

      // 2.5. Usuario + cumplimiento Meta (Bloque 2.1/2.2). Se resuelve para
      // TODO mensaje entrante, tenga o no flow activo el tenant — el
      // opt-out y el tracking de ventana de servicio no dependen del flow.
      // El dueño queda fuera de esta lógica (ya se filtró arriba: si llegó
      // hasta acá es porque su mensaje no fue un comando, y no aplica
      // opt-out a su propio número de pruebas).
      const user = await this.getOrCreateUser(tenantId, from);
      await this.deps.sessions.touchLastInbound(tenantId, from, message.timestamp);
      turn.trace.push({
        kind: 'window',
        open: true,
        expiresAt: new Date(message.timestamp.getTime() + SERVICE_WINDOW_MS).toISOString(),
      });

      // 3. Cargar el flow activo. Va antes de la baja porque las palabras de
      // baja son del flow (C-08); sin flow aplican las de siempre.
      let flow: BotFlow | null = null;
      try {
        flow = await this.deps.flows.findActive(tenantId);
      } catch (err) {
        logger.error(
          { err, tenantId },
          'Error cargando bot_flow — respondiendo "en mantenimiento"',
        );
      }

      const isOwner = !!config.ownerPhone && isSamePhone(from, config.ownerPhone);
      if (!isOwner) {
        const escape = matchEscape(resolveEscape(flow), content);
        if (escape?.category === 'opt_out') {
          await this.deps.sessions.setOptOut(tenantId, from, message.timestamp);
          turn.trace.push({ kind: 'gate', gate: 'opt_out', detail: escape.word });
          await turn.send({ to: from, audience: 'customer', content: { kind: 'text', text: OPT_OUT_CONFIRMATION } });
          this.deps.audit.log({
            actorLabel: `whatsapp:${from}`,
            action: 'bot_user.opt_out',
            targetType: 'bot_user',
            targetId: user.id,
            metadata: { tenantId },
          });
          logger.info({ tenantId, from }, 'Opt-out real activado (Bloque 2.2)');
          return turn.result();
        }

        if (user.optedOutAt) {
          // Cualquier mensaje nuevo de un usuario opted-out es opt-in
          // implícito (patrón estándar) — se reactiva y el mensaje sigue
          // de largo al flow normal.
          await this.deps.sessions.setOptOut(tenantId, from, null);
          user.optedOutAt = null;
          turn.trace.push({ kind: 'gate', gate: 'opt_in_implicit' });
          this.deps.audit.log({
            actorLabel: `whatsapp:${from}`,
            action: 'bot_user.opt_in_implicit',
            targetType: 'bot_user',
            targetId: user.id,
            metadata: { tenantId },
          });
          logger.info({ tenantId, from }, 'Opt-in implícito — usuario reactivado');
        }
      }

      // 5. Sin bot_flow activo — respuesta de mantenimiento (ADR-012).
      if (!flow) {
        logger.warn(
          { tenantId, from },
          '[BotController] Tenant sin bot_flow activo — respondiendo "en mantenimiento"',
        );
        turn.trace.push({ kind: 'gate', gate: 'no_flow' });
        await turn.send({ to: from, audience: 'customer', content: { kind: 'text', text: MAINTENANCE_TEXT } });
        return turn.result();
      }

      // 4. Ruta principal: FlowInterpreter
      // Gate de handoff humano: si el usuario está en pausa, el bot calla.
      if (user.humanPausedUntil && user.humanPausedUntil > this.deps.clock.now()) {
        logger.info(
          { tenantId, from, pausedUntil: user.humanPausedUntil },
          'Usuario en handoff humano — mensaje registrado, bot silenciado',
        );
        turn.trace.push({
          kind: 'gate',
          gate: 'human_paused',
          detail: user.humanPausedUntil.toISOString(),
        });
        return turn.result();
      }

      // Gate de expiración de sesión conversacional (DEC-07, auditoría
      // 2026-08-26). Solo aplica a media captura: un usuario nuevo o que
      // terminó su flow (currentNodeId undefined o 'end') ya arranca
      // limpio y en silencio vía el "Caso 2" de FlowInterpreter — avisar
      // "empezamos de nuevo" ahí no tendría sentido (no había nada
      // empezado). Va DESPUÉS del gate de handoff humano: si el dueño
      // está atendiendo manualmente, este gate no debe resetear nada por
      // debajo suyo.
      let effectiveUser = user;
      const midFlow = !!user.currentNodeId && user.currentNodeId !== 'end';
      if (midFlow && user.lastInboundAt) {
        const expired = isSessionExpired(
          this.deps.businessHours,
          {
            horarioSemana: config.horarioSemana,
            horarioSabado: config.horarioSabado,
            abreDomingo: config.abreDomingo,
          },
          user.lastInboundAt,
          message.timestamp,
        );
        if (expired) {
          turn.trace.push({ kind: 'gate', gate: 'session_expired' });
          // No cuenta como último texto: el dispatch original solo miraba
          // las salidas del flow para el valor de retorno.
          await turn.send(
            { to: from, audience: 'customer', content: { kind: 'text', text: SESSION_EXPIRED_NOTICE } },
            { countsAsLastText: false },
          );
          // Limpia currentNodeId/context de verdad (mismo patrón que la
          // palabra de escape en FlowInterpreter) para que el "Caso 2" del
          // interpreter arranque el flow desde start_node_id, y para que
          // {{variables}} de la sesión vieja no se filtren en la nueva.
          effectiveUser = { ...user, currentNodeId: undefined, context: {} };
          logger.info({ tenantId, from }, 'Sesión conversacional expirada — reset con aviso');
        }
      }

      // Gate de horario de atención (§2.2): fuera de horario, el bot NO
      // ejecuta el flow — solo avisa que está cerrado y no mueve
      // currentNodeId/context, para retomar donde iba cuando reabra. El
      // dueño queda fuera (mismo criterio que opt-out: sigue probando su
      // bot a cualquier hora).
      //
      // Fase 5: con `flow.hours.when_closed = 'continue'` el flow atiende
      // igual. Una conversación nueva empieza con el mensaje de "cerrado" y
      // el paso a persona usa su texto de fuera de horario.
      let closedNow = false;
      if (!isOwner) {
        const hoursCheck = this.deps.businessHours.isOpenNow(
          {
            horarioSemana: config.horarioSemana,
            horarioSabado: config.horarioSabado,
            abreDomingo: config.abreDomingo,
          },
          this.deps.clock.now(),
        );
        if (hoursCheck.unknown) {
          logger.warn(
            { tenantId },
            'Horario de atención no parseable (formato esperado HH:MM-HH:MM) — sin gating',
          );
        }
        if (!hoursCheck.isOpen && flow.hours?.when_closed !== 'continue') {
          turn.trace.push({ kind: 'gate', gate: 'out_of_hours' });
          await turn.send({ to: from, audience: 'customer', content: { kind: 'text', text: config.outOfHoursMessage } });
          logger.info({ tenantId, from }, 'Fuera de horario — flow no ejecutado');
          return turn.result();
        }
        if (!hoursCheck.isOpen) {
          closedNow = true;
          const startsFresh = !effectiveUser.currentNodeId || effectiveUser.currentNodeId === 'end';
          if (startsFresh) {
            turn.trace.push({ kind: 'gate', gate: 'out_of_hours_notice' });
            await turn.send(
              { to: from, audience: 'customer', content: { kind: 'text', text: config.outOfHoursMessage } },
              { countsAsLastText: false },
            );
          }
        }
      }

      const result = await this.deps.interpreter.execute({
        flow,
        user: effectiveUser,
        message,
        tenantConfig: config,
        orderIdFactory: () => this.deps.ids.orderId(),
      });
      // Los dobles de prueba de FlowInterpreter anteriores a la Fase 1 no
      // traen `trace`.
      turn.trace.push(...(result.trace ?? []));
      for (const [key, value] of Object.entries(result.contextUpdates)) {
        turn.trace.push({ kind: 'context_update', key, value });
      }

      // Persistir nextNodeId + contextUpdates. Parte de effectiveUser (no
      // de user): si el gate de arriba reseteó la sesión, el contexto
      // viejo no debe resucitar aquí.
      const mergedContext = { ...(effectiveUser.context ?? {}), ...result.contextUpdates };
      await this.deps.sessions.update({
        ...effectiveUser,
        currentNodeId: result.nextNodeId,
        context: mergedContext,
        updatedAt: this.deps.clock.now(),
      });

      // Enviar outputs
      let ownerNotified = false;
      for (const output of result.outputs) {
        switch (output.kind) {
        case 'escape_to_human': {
          const closedText = closedNow && output.userResponseClosed?.trim() ? output.userResponseClosed : null;
          if (closedText) turn.trace.push({ kind: 'gate', gate: 'out_of_hours_handoff' });
          await turn.send({ to: from, audience: 'customer', content: { kind: 'text', text: closedText ?? output.userResponse } });
          // Aviso al dueño por WhatsApp — best-effort: NUNCA rompe el flujo del cliente.
          // El destino (ownerPhone) viene de owner_data.whatsapp_dueno vía TenantConfig.
          if (config.ownerPhone && output.ownerAlert?.trim()) {
            try {
              const alert = enrichOwnerAlert(output.ownerAlert, from, this.deps.clock.now());
              await turn.send(
                { to: config.ownerPhone, audience: 'owner', content: { kind: 'text', text: alert } },
                { countsAsLastText: false },
              );
              ownerNotified = true;
              logger.info({ tenantId }, 'Aviso de lead enviado al dueño');
            } catch (err) {
              logger.error(
                { err, tenantId },
                'No se pudo enviar el aviso al dueño (el cliente sí recibió su cierre)',
              );
            }
          } else if (!config.ownerPhone) {
            logger.warn(
              { tenantId },
              'escape_to_human sin ownerPhone (owner_data.whatsapp_dueno) — aviso no enviado',
            );
          }
          break;
        }

        case 'reaction':
          if (metaMessageId) {
            await turn.send({
              to: from,
              audience: 'customer',
              content: { kind: 'reaction', emoji: output.emoji, messageId: metaMessageId },
            });
          } else {
            logger.warn(
              { tenantId },
              'send_reaction sin messageId del usuario — reacción omitida',
            );
          }
          break;

        default:
          await turn.send({ to: from, audience: 'customer', content: output });
        }
      }

      // Si algún output fue escape_to_human, activar pausa en BD.
      const handoffTriggered = result.outputs.some((o) => o.kind === 'escape_to_human');
      if (handoffTriggered) {
        const pausedUntil = new Date(this.deps.clock.now().getTime() + this.deps.handoffPauseMs);
        await this.deps.sessions.setHumanHandoff(tenantId, from, pausedUntil);
        turn.trace.push({ kind: 'escalation', pausedUntil: pausedUntil.toISOString(), ownerNotified });
        logger.info(
          { tenantId, from, pausedUntil },
          'Handoff humano activado — bot silenciado 48 h',
        );
      }

      logger.info(
        {
          tenantId,
          from,
          nextNodeId: result.nextNodeId,
          outputs: result.outputs.length,
          flowEnded: result.flowEnded,
        },
        'Flow ejecutado',
      );
      return turn.result();
    } catch (error) {
      logger.error({ error, tenantId, from }, 'Error procesando mensaje');
      throw error;
    }
  }

  private async getOrCreateUser(tenantId: string, from: string): Promise<User> {
    const existing = await this.deps.sessions.findByPhoneNumber(tenantId, from);
    if (existing) return existing;

    const now = this.deps.clock.now();
    const newUser: User = {
      id: this.deps.ids.uuid(),
      tenantId,
      phoneNumber: from,
      currentState: UserState.INITIAL,
      currentNodeId: undefined,
      context: {},
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.sessions.save(newUser);
    return newUser;
  }

  // ==========================================================================
  // P4 — Reanudación de handoff por WhatsApp del dueño (D4, conservadora)
  // ==========================================================================

  /** "vence en 3h 20m" — cuánto falta para que la pausa expire sola. */
  private formatRemaining(until: Date | null | undefined): string {
    if (!until) return '';
    const ms = until.getTime() - this.deps.clock.now().getTime();
    if (ms <= 0) return 'por expirar';
    const hours = Math.floor(ms / 3_600_000);
    const mins = Math.floor((ms % 3_600_000) / 60_000);
    return hours > 0 ? `vence en ${hours}h${mins > 0 ? ` ${mins}m` : ''}` : `vence en ${mins}m`;
  }

  /**
   * Resuelve un comando del dueño. Devuelve `false` si `content` no matcheó
   * ningún comando (el caller debe dejar que el mensaje siga al flow normal,
   * D4). Si matcheó, SIEMPRE contesta algo al dueño.
   */
  private async tryHandleOwnerCommand(
    turn: TurnRecorder,
    tenantId: string,
    ownerPhone: string,
    content: string,
  ): Promise<boolean> {
    const match = matchOwnerResumeCommand(content);
    if (!match) return false;

    turn.trace.push({ kind: 'gate', gate: 'owner_command', detail: content.trim() });
    const reply = async (text: string): Promise<boolean> => {
      await turn.send({ to: ownerPhone, audience: 'owner', content: { kind: 'text', text } });
      return true;
    };

    const paused = await this.deps.sessions.listPaused(tenantId);

    if (paused.length === 0) {
      return reply('No hay conversaciones pausadas ahora mismo.');
    }

    let target: User;
    if (match.code) {
      const candidates = paused.filter((u) => u.phoneNumber.endsWith(match.code!));
      if (candidates.length === 0) {
        return reply(`No encontré ninguna conversación pausada que termine en ${match.code}.`);
      }
      if (candidates.length > 1) {
        // Colisión de últimos 4 dígitos entre pausados simultáneos: rarísimo
        // para un negocio chico, pero no se adivina — se pide desambiguar.
        const list = candidates.map((u) => u.phoneNumber).join(', ');
        return reply(
          `Hay ${candidates.length} conversaciones pausadas que terminan en ${match.code}: ` +
            `${list}. Contacta soporte para reanudar la correcta.`,
        );
      }
      target = candidates[0];
    } else if (paused.length === 1) {
      target = paused[0];
    } else {
      const list = paused
        .map((u) => `• …${u.phoneNumber.slice(-4)} (${this.formatRemaining(u.humanPausedUntil)})`)
        .join('\n');
      return reply(
        `Hay ${paused.length} conversaciones pausadas. Dime cuál con el código:\n${list}\n\n` +
          `Ejemplo: #listo ${paused[0].phoneNumber.slice(-4)}`,
      );
    }

    await this.deps.sessions.setHumanHandoff(tenantId, target.phoneNumber, null);
    this.deps.audit.log({
      actorLabel: `whatsapp:${ownerPhone}`,
      action: 'handoff.resume_via_whatsapp',
      targetType: 'bot_user',
      targetId: target.id,
      metadata: { tenantId, resumedPhone: target.phoneNumber },
    });
    this.deps.logger.info(
      { tenantId, resumedPhone: target.phoneNumber },
      'Handoff reanudado por comando de WhatsApp del dueño',
    );
    return reply(`Listo, reanudé el bot para …${target.phoneNumber.slice(-4)}.`);
  }
}

/** Acumula lo que pasa en un turno: mensajes enviados, traza y último texto. */
class TurnRecorder {
  readonly trace: DecisionStep[] = [];
  private readonly outbound: OutboundMessage[] = [];
  private lastText: string | null = null;

  constructor(
    private readonly tenantId: string,
    private readonly messenger: MessengerPort,
  ) {}

  async send(message: OutboundMessage, opts: { countsAsLastText?: boolean } = {}): Promise<void> {
    await this.messenger.send(this.tenantId, message);
    this.outbound.push(message);
    if (opts.countsAsLastText === false) return;
    const text = representativeText(message.content as OutboundContent);
    if (text !== undefined) this.lastText = text;
  }

  result(): EngineTurn {
    return { outbound: this.outbound, trace: this.trace, lastText: this.lastText };
  }
}

function normalizeDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

function isSamePhone(from: string, ownerPhone: string): boolean {
  const a = normalizeDigits(from);
  const b = normalizeDigits(ownerPhone);
  return a.length > 0 && a === b;
}

/**
 * Match EXACTO (case-insensitive) contra OWNER_RESUME_COMMANDS, con o sin
 * un código de 4 dígitos (últimos 4 del teléfono del cliente a reanudar).
 * `null` = el mensaje no es un comando reconocido.
 */
function matchOwnerResumeCommand(content: string): { code: string | null } | null {
  const trimmed = content.trim();
  for (const cmd of OWNER_RESUME_COMMANDS) {
    if (trimmed.toLowerCase() === cmd) return { code: null };
    const withCode = new RegExp(`^${cmd}\\s+(\\d{4})$`, 'i');
    const m = trimmed.match(withCode);
    if (m) return { code: m[1] };
  }
  return null;
}
