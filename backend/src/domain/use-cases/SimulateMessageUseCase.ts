import type pino from 'pino';
import type {
  UserRepository,
  TenantConfigPort,
  BotFlowRepository,
} from '@/domain/ports';
import { FlowInterpreter, InterpreterOutput } from '@/domain/services/FlowInterpreter';
import { Message, User, UserState } from '@/domain/entities';
import type { BotFlow } from '@/domain/entities/flow';
import { validateFlow, FlowValidationError } from '@/domain/validators/flowSchema';

/**
 * Fuente del flow a simular:
 *  - 'active'  (default): el flow publicado y activo del tenant (comportamiento previo).
 *  - 'draft'   : el borrador en edición (requiere flowId). Se valida en vivo;
 *                si es inválido se devuelve `error` sin reventar.
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
        const raw = await this.botFlowRepository.getDraft(input.flowId, tenantId);
        if (raw == null) {
          return mkError(`El flow "${input.flowId}" no tiene draft para simular`);
        }
        flow = validateFlow(raw); // puede lanzar FlowValidationError
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

    // 3. Cargar o crear user (en BD si persist, en memoria si no)
    const user = persist
      ? await this.getOrCreatePersistentUser(tenantId, phoneNumber)
      : await this.getOrCreateEphemeralUser(tenantId, phoneNumber);

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
      user,
      message,
      tenantConfig,
    });

    // 6. Persistir si corresponde
    if (persist) {
      const mergedContext = { ...(user.context ?? {}), ...result.contextUpdates };
      await this.userRepository.update({
        ...user,
        currentNodeId: result.nextNodeId,
        context: mergedContext,
        updatedAt: new Date(),
      });
    }

    return {
      outputs: result.outputs,
      nextNodeId: result.nextNodeId,
      context: {
        ...(user.context ?? {}),
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

  private async getOrCreateEphemeralUser(
    tenantId: string,
    phoneNumber: string,
  ): Promise<User> {
    return {
      id: this.generateId(),
      tenantId,
      phoneNumber,
      currentState: UserState.INITIAL,
      currentNodeId: undefined,
      context: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
}
