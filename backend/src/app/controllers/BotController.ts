import pino from 'pino';
import { config } from '@/config/env';
import { FlowInterpreter } from '@/domain/services/FlowInterpreter';
import { BusinessHoursService } from '@/domain/services/BusinessHoursService';
import {
  NotificationPort,
  UserRepository,
  TenantConfigPort,
  BotFlowRepository,
  AuditPort,
  ClockPort,
  IdGenerator,
} from '@/domain/ports';
import { ConversationEngine } from '@/domain/conversation/ConversationEngine';
import { NotificationPortMessenger } from '@/domain/conversation/NotificationPortMessenger';
import { createSystemIdGenerator, systemClock } from '@/app/systemRuntime';

/** TTL de la pausa por handoff humano, en ms. Default global 48h (env HANDOFF_PAUSE_MINUTES, D3). */
const HUMAN_HANDOFF_TTL_MS = config.bot.handoffPauseMinutes * 60 * 1000;

/**
 * Controlador del bot: la entrada del webhook de Meta.
 *
 * Desde la Fase 1 del Studio la orquestación (gates, intérprete, envío) vive
 * en ConversationEngine, el mismo código que ejecuta el simulador. Este
 * controlador solo arma el motor con los adaptadores de producción: la
 * sesión en bot_users, el envío por NotificationPort y la hora real.
 *
 * Ruta única: FlowInterpreter cuando el tenant tiene bot_flow activo.
 * Sin flow → mensaje de mantenimiento (ADR-012).
 */
export class BotController {
  private readonly engine: ConversationEngine;

  constructor(
    userRepository: UserRepository,
    notificationPort: NotificationPort,
    tenantConfigPort: TenantConfigPort,
    botFlowRepository: BotFlowRepository,
    flowInterpreter: FlowInterpreter,
    auditPort: AuditPort,
    businessHoursService: BusinessHoursService,
    logger: pino.Logger,
    /** Solo para tests: reloj e ids controlados (p.ej. el test de paridad con el simulador). */
    runtime: { clock?: ClockPort; ids?: IdGenerator } = {},
  ) {
    const clock = runtime.clock ?? systemClock;
    this.engine = new ConversationEngine({
      sessions: userRepository,
      messenger: new NotificationPortMessenger(notificationPort),
      tenantConfig: tenantConfigPort,
      flows: { findActive: (tenantId) => botFlowRepository.findActiveByTenant(tenantId) },
      interpreter: flowInterpreter,
      businessHours: businessHoursService,
      audit: auditPort,
      clock,
      ids: runtime.ids ?? createSystemIdGenerator(clock),
      handoffPauseMs: HUMAN_HANDOFF_TTL_MS,
      logger,
    });
  }

  /** Devuelve el último texto enviado (o null), que ExpressServer registra como outbound. */
  async processMessage(
    tenantId: string,
    from: string,
    content: string,
    metaMessageId?: string,
  ): Promise<string | null> {
    const turn = await this.engine.handle({ tenantId, from, content, metaMessageId });
    return turn.lastText;
  }
}
