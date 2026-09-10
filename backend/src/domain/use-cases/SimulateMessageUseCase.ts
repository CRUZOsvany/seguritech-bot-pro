import { randomUUID } from 'crypto';
import type pino from 'pino';
import type {
  UserRepository,
  TenantConfigPort,
  BotFlowRepository,
} from '@/domain/ports';
import { FlowInterpreter, InterpreterOutput } from '@/domain/services/FlowInterpreter';
import { BusinessHoursService } from '@/domain/services/BusinessHoursService';
import { Message, User, UserState } from '@/domain/entities';
import type { BotFlow } from '@/domain/entities/flow';
import { validateFlow, FlowValidationError } from '@/domain/validators/flowSchema';
import { enrichOwnerAlert } from '@/domain/services/OwnerAlertFormatter';
import { SESSION_EXPIRED_NOTICE, isSessionExpired } from '@/domain/services/SessionTtlPolicy';

/**
 * Fuente del flow a simular:
 *  - 'active'  (default): el flow publicado y activo del tenant (comportamiento previo).
 *  - 'draft'   : lo que el operador está editando (requiere flowId): el
 *                borrador si existe y, si no, una copia de lo publicado —
 *                mismo criterio que el Designer. Se valida en vivo; si es
 *                inválido se devuelve `error` sin reventar.
 *  - 'version' : una versión histórica publicada (requiere versionId).
 */
export type SimulateSource = 'active' | 'draft' | 'version';

export interface SimulateInput {
  tenantId: string;
  phoneNumber: string;
  content: string;
  /**
   * Si true, persiste el estado en bot_users (mismo comportamiento que un
   * mensaje real). Si false, el User es efímero y no toca la BD.
   */
  persist: boolean;
  /** Bloque A1: qué flow simular. Ausente ⇒ 'active'. */
  source?: SimulateSource;
  /** Requerido si source='draft'. */
  flowId?: string;
  /** Requerido si source='version'. */
  versionId?: string;
  /**
   * Estado previo de la conversación, devuelto por la llamada anterior.
   * Permite que el modo efímero (persist=false) avance sin tocar la BD: el
   * frontend encadena `currentNodeId` + `context` entre turnos. Ignorado
   * cuando persist=true (el estado vive en bot_users).
   */
  state?: {
    currentNodeId?: string;
    context?: Record<string, unknown>;
  };
  /**
   * Fase 4 (reconexión del Designer/Simulador): ISO 8601 opcional — hora a
   * la que se simula el mensaje, para probar el gate de horario de atención
   * sin esperar a que sea de noche de verdad. Ausente ⇒ sin gate, mismo
   * comportamiento que siempre (el simulador no respeta horarios).
   */
  simulateAt?: string;
  /**
   * Fase 3 (fidelidad del simulador): minutos a "avanzar" desde el turno
   * anterior antes de procesar este mensaje, para probar el gate de
   * expiración de sesión (DEC-07) sin esperar 2h de verdad. Ausente ⇒ sin
   * gate, mismo comportamiento que siempre. Solo tiene efecto si el usuario
   * estaba a media captura (currentNodeId definido y != 'end').
   */
  simulatedElapsedMinutes?: number;
}

export interface SimulateResult {
  outputs: InterpreterOutput[];
  nextNodeId: string;
  context: Record<string, unknown>;
  flowEnded: boolean;
  /**
   * Solo se llena cuando NO hay flow activo y caemos en error.
   */
  error?: string;
}

/**
 * Caso de uso paralelo al BotController.processMessage pero:
 *  - NO despacha al NotificationPort (devuelve outputs en memoria).
 *  - Opcionalmente NO persiste el User (modo efímero).
 *
 * Usado exclusivamente por el endpoint POST /api/admin/simulate del panel.
 * NO debe invocarse desde el webhook de Meta.
 */
export class SimulateMessageUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly tenantConfigPort: TenantConfigPort,
    private readonly botFlowRepository: BotFlowRepository,
    private readonly flowInterpreter: FlowInterpreter,
    private readonly businessHoursService: BusinessHoursService,
    private readonly logger: pino.Logger,
  ) {}

  async execute(input: SimulateInput): Promise<SimulateResult> {
    const { tenantId, phoneNumber, content, persist } = input;

    // 1. Cargar config del tenant
    const tenantConfig = await this.tenantConfigPort.getConfig(tenantId);
    if (!tenantConfig) {
      return {
        outputs: [],
        nextNodeId: '',
        context: {},
        flowEnded: true,
        error: `No hay bot_configuration para el tenant "${tenantId}"`,
      };
    }

    // 2. Resolver el flow a simular según `source` (default: activo).
    const mkError = (error: string): SimulateResult => ({
      outputs: [],
      nextNodeId: '',
      context: {},
      flowEnded: true,
      error,
    });

    const source: SimulateSource = input.source ?? 'active';
    let flow: BotFlow | null = null;
    try {
      if (source === 'draft') {
        if (!input.flowId) return mkError("source='draft' requiere flowId");
        // Mismo criterio que el Designer: "draft" es lo que el operador está
        // editando. Sin draft guardado eso es una copia de lo publicado, no un
        // error — si aquí fallara, simular lo que se ve en el canvas recién
        // publicado sería imposible.
        const editable = await this.botFlowRepository.getEditableFlow(input.flowId, tenantId);
        if (editable == null) {
          return mkError(`El flow "${input.flowId}" no existe para este tenant`);
        }
        flow = validateFlow(editable.flow); // puede lanzar FlowValidationError
      } else if (source === 'version') {
        if (!input.versionId) return mkError("source='version' requiere versionId");
        flow = await this.botFlowRepository.getVersionFlow(input.versionId, tenantId);
        if (!flow) return mkError(`La versión "${input.versionId}" no existe`);
      } else {
        flow = await this.botFlowRepository.findActiveByTenant(tenantId);
        if (!flow) {
          return mkError(
            `No hay bot_flow activo para el tenant "${tenantId}". Asigna un molde primero.`,
          );
        }
      }
    } catch (err) {
      if (err instanceof FlowValidationError) {
        return mkError(`Draft inválido: ${err.message}`);
      }
      throw err;
    }

    // Tras la resolución, flow está garantizado; el guard narrowea el tipo
    // para el FlowInterpreter (que exige BotFlow, no BotFlow | null).
    if (!flow) {
      return mkError('No se pudo resolver el flow a simular');
    }

    // 3. Cargar o crear user (en BD si persist, en memoria si no).
    //    En modo efímero, sembramos el estado que el frontend encadenó del
    //    turno anterior para que la conversación avance sin escribir en BD.
    const user = persist
      ? await this.getOrCreatePersistentUser(tenantId, phoneNumber)
      : this.makeEphemeralUser(tenantId, phoneNumber, input.state);

    // 3.5. Fase 4: gate de horario de atención, copiado tal cual del punto de
    // inserción real en BotController (mismo config.outOfHoursMessage, misma
    // condición isOpenNow). Solo aplica si el caller mandó `simulateAt` — el
    // panel lo manda cuando el operador activa "simular a esta hora"; sin
    // eso, el simulador no gatea por horario (comportamiento de siempre).
    // A diferencia de BotController, aquí no hay concepto de "dueño" que se
    // salte el gate — el simulador es una herramienta de prueba, no un canal
    // real de mensajes.
    if (input.simulateAt) {
      const simulatedNow = new Date(input.simulateAt);
      const hoursCheck = this.businessHoursService.isOpenNow(
        {
          horarioSemana: tenantConfig.horarioSemana,
          horarioSabado: tenantConfig.horarioSabado,
          abreDomingo: tenantConfig.abreDomingo,
        },
        simulatedNow,
      );
      if (!hoursCheck.isOpen) {
        return {
          outputs: [{ kind: 'text', text: tenantConfig.outOfHoursMessage }],
          nextNodeId: user.currentNodeId ?? '',
          context: user.context ?? {},
          flowEnded: false,
        };
      }
    }

    // 3.6 (Fase 3, fidelidad del simulador): gate de expiración de sesión
    // (DEC-07), reusando la misma política que BotController aplica a
    // mensajes reales. Solo se activa si el operador manda
    // `simulatedElapsedMinutes`; sin eso, comportamiento idéntico al de
    // siempre. En modo persist=true, si el operador no mandó ese campo,
    // también se respeta el TTL real vía `user.lastInboundAt` — igual que
    // en producción.
    let effectiveUser = user;
    let sessionExpiredNoticeShown = false;
    const midFlow = !!user.currentNodeId && user.currentNodeId !== 'end';
    if (midFlow) {
      const now = input.simulateAt ? new Date(input.simulateAt) : new Date();
      const hours = {
        horarioSemana: tenantConfig.horarioSemana,
        horarioSabado: tenantConfig.horarioSabado,
        abreDomingo: tenantConfig.abreDomingo,
      };
      let expired = false;
      if (input.simulatedElapsedMinutes !== undefined) {
        const from = new Date(now.getTime() - input.simulatedElapsedMinutes * 60_000);
        expired = isSessionExpired(this.businessHoursService, hours, from, now);
      } else if (persist && user.lastInboundAt) {
        expired = isSessionExpired(this.businessHoursService, hours, user.lastInboundAt, now);
      }
      if (expired) {
        effectiveUser = { ...user, currentNodeId: undefined, context: {} };
        sessionExpiredNoticeShown = true;
      }
    }

    // 4. Construir Message
    const message: Message = {
      id: this.generateId(),
      tenantId,
      from: phoneNumber,
      content,
      timestamp: new Date(),
    };

    // 5. Ejecutar flow
    const result = await this.flowInterpreter.execute({
      flow,
      user: effectiveUser,
      message,
      tenantConfig,
    });

    // 6. Persistir si corresponde
    if (persist) {
      const mergedContext = { ...(effectiveUser.context ?? {}), ...result.contextUpdates };
      await this.userRepository.update({
        ...effectiveUser,
        currentNodeId: result.nextNodeId,
        context: mergedContext,
        updatedAt: new Date(),
      });
    }

    // Fase 2 (fidelidad del simulador): la alerta que ve el operador debe
    // ser la MISMA que recibiría el dueño de verdad, no el
    // owner_alert_template crudo del flow.
    const enrichedOutputs: InterpreterOutput[] = result.outputs.map((o) =>
      o.kind === 'escape_to_human'
        ? { ...o, ownerAlert: enrichOwnerAlert(o.ownerAlert, phoneNumber) }
        : o,
    );

    // Fase 3: mismo orden de dos mensajes que BotController — primero el
    // aviso de "empezamos de nuevo", luego lo que haya respondido el flow
    // ya reiniciado.
    const finalOutputs: InterpreterOutput[] = sessionExpiredNoticeShown
      ? [{ kind: 'text', text: SESSION_EXPIRED_NOTICE }, ...enrichedOutputs]
      : enrichedOutputs;

    return {
      outputs: finalOutputs,
      nextNodeId: result.nextNodeId,
      context: {
        ...(effectiveUser.context ?? {}),
        ...result.contextUpdates,
      },
      flowEnded: result.flowEnded,
    };
  }

  /**
   * Resetea el estado del user para una conversación de simulación.
   * Si persist=false, este método es no-op (no hay nada que resetear).
   */
  async reset(tenantId: string, phoneNumber: string): Promise<void> {
    try {
      await this.userRepository.resetUserState(tenantId, phoneNumber);
      this.logger.info(
        { tenantId, phoneNumber },
        '🔄 Estado de simulación reseteado',
      );
    } catch (err) {
      this.logger.warn(
        { err, tenantId, phoneNumber },
        '⚠️  resetUserState falló (puede no existir el user aún)',
      );
    }
  }

  private async getOrCreatePersistentUser(
    tenantId: string,
    phoneNumber: string,
  ): Promise<User> {
    const existing = await this.userRepository.findByPhoneNumber(
      tenantId,
      phoneNumber,
    );
    if (existing) return existing;

    const newUser: User = {
      id: this.generateId(),
      tenantId,
      phoneNumber,
      currentState: UserState.INITIAL,
      currentNodeId: undefined,
      context: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await this.userRepository.save(newUser);
    return newUser;
  }

  /**
   * Construye un User en memoria (nunca toca la BD) sembrado con el estado
   * que el frontend encadenó del turno anterior. Sin `state` arranca de cero
   * (primer mensaje de la conversación).
   */
  private makeEphemeralUser(
    tenantId: string,
    phoneNumber: string,
    state?: SimulateInput['state'],
  ): User {
    return {
      id: this.generateId(),
      tenantId,
      phoneNumber,
      currentState: UserState.INITIAL,
      currentNodeId: state?.currentNodeId,
      context: state?.context ?? {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private generateId(): string {
    return randomUUID();
  }
}
