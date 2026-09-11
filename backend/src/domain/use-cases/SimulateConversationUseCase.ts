import type pino from 'pino';
import type { BotFlow } from '@/domain/entities/flow';
import type { TenantConfigPort } from '@/domain/ports';
import type { FlowInterpreter } from '@/domain/services/FlowInterpreter';
import type { BusinessHoursService } from '@/domain/services/BusinessHoursService';
import { ConversationEngine } from '@/domain/conversation/ConversationEngine';
import type { OutboundMessage } from '@/domain/conversation/OutboundMessage';
import type { DecisionStep } from '@/domain/conversation/trace';
import {
  CapturingMessenger,
  FakeClock,
  InMemorySessionRepository,
  SequentialIdGenerator,
  noopAudit,
} from '@/domain/conversation/simulation/fakes';

/**
 * Un paso de la conversación simulada.
 *
 * `inbound.content` es lo que el parser de Meta entregó para ese mensaje, o
 * null si el parser lo descartó (audio, sticker…): así la simulación
 * muestra el mismo silencio que vería el cliente. Traducir un toque de botón
 * o una fila a `content` es trabajo del parser, que vive en infraestructura
 * — el endpoint lo hace antes de llamar a este caso de uso.
 */
export type SimulationStep =
  | { kind: 'inbound'; content: string | null; messageId: string; ignoredReason?: string }
  | { kind: 'advance_time'; minutes: number };

export interface SimulateConversationInput {
  tenantId: string;
  flow: BotFlow;
  /** Teléfono del cliente simulado. Si es el del dueño, aplican sus reglas (#listo, sin horario). */
  from: string;
  /** Hora de arranque del reloj simulado. */
  startAt: Date;
  steps: SimulationStep[];
}

export interface SessionSnapshot {
  currentNodeId: string | null;
  context: Record<string, unknown>;
  lastInboundAt: string | null;
  humanPausedUntil: string | null;
  optedOut: boolean;
}

export interface SimulatedTurn {
  /** Hora simulada al terminar el paso. */
  at: string;
  outbound: OutboundMessage[];
  trace: DecisionStep[];
  session: SessionSnapshot | null;
  /**
   * Mensajes que este paso envió. Todos son mensajes de servicio: el motor
   * todavía no envía plantillas. Incluye la alerta al dueño, que también es
   * un mensaje del número del negocio.
   */
  billing: { serviceMessages: number; templates: number };
}

/**
 * Corre una conversación completa con el motor real y adaptadores falsos
 * (§8.3 de la especificación del Studio).
 *
 * Sin efectos externos: no escribe en bot_users, no llama a Meta, no avisa al
 * dueño, no deja rastro en la auditoría. Lo único real y de solo lectura es
 * lo que el bot consulta para contestar: la configuración del tenant y su
 * catálogo.
 */
export class SimulateConversationUseCase {
  constructor(
    private readonly tenantConfigPort: TenantConfigPort,
    private readonly interpreter: FlowInterpreter,
    private readonly businessHours: BusinessHoursService,
    private readonly handoffPauseMs: number,
    private readonly logger: pino.Logger,
  ) {}

  async execute(input: SimulateConversationInput): Promise<SimulatedTurn[]> {
    const clock = new FakeClock(input.startAt);
    const sessions = new InMemorySessionRepository(clock);
    const messenger = new CapturingMessenger();
    const engine = new ConversationEngine({
      sessions,
      messenger,
      tenantConfig: this.tenantConfigPort,
      flows: { findActive: async () => input.flow },
      interpreter: this.interpreter,
      businessHours: this.businessHours,
      audit: noopAudit,
      clock,
      ids: new SequentialIdGenerator(),
      handoffPauseMs: this.handoffPauseMs,
      // El log de una simulación no es un evento de producción.
      logger: this.logger.child({ simulation: true }, { level: 'silent' }),
    });

    const turns: SimulatedTurn[] = [];
    for (const step of input.steps) {
      let outbound: OutboundMessage[] = [];
      let trace: DecisionStep[];

      if (step.kind === 'advance_time') {
        clock.advanceMinutes(step.minutes);
        trace = [{ kind: 'clock_advanced', minutes: step.minutes, now: clock.now().toISOString() }];
      } else if (step.content === null) {
        trace = [{
          kind: 'input_ignored',
          reason: 'unsupported_type',
          detail: step.ignoredReason ?? 'tipo de mensaje no soportado',
        }];
      } else {
        const turn = await engine.handle({
          tenantId: input.tenantId,
          from: input.from,
          content: step.content,
          metaMessageId: step.messageId,
        });
        outbound = turn.outbound;
        trace = turn.trace;
      }

      turns.push({
        at: clock.now().toISOString(),
        outbound,
        trace,
        session: toSnapshot(sessions, input.tenantId, input.from),
        billing: { serviceMessages: outbound.length, templates: 0 },
      });
    }
    return turns;
  }
}

function toSnapshot(
  sessions: InMemorySessionRepository,
  tenantId: string,
  from: string,
): SessionSnapshot | null {
  const user = sessions.snapshot(tenantId, from);
  if (!user) return null;
  return {
    currentNodeId: user.currentNodeId ?? null,
    context: user.context ?? {},
    lastInboundAt: user.lastInboundAt?.toISOString() ?? null,
    humanPausedUntil: user.humanPausedUntil?.toISOString() ?? null,
    optedOut: !!user.optedOutAt,
  };
}
