import pino from 'pino';
import { Message, User, UserState } from '@/domain/entities';
import { HandleMessageUseCase } from '@/domain/use-cases/HandleMessageUseCase';
import { FlowInterpreter, InterpreterOutput } from '@/domain/services/FlowInterpreter';
import {
  NotificationPort,
  UserRepository,
  TenantConfigPort,
  BotFlowRepository,
} from '@/domain/ports';

/**
 * Controlador del bot — Sprint 2.
 *
 * Estrategia dual:
 *  1. Intenta FlowInterpreter cuando el tenant tiene un bot_flow activo.
 *  2. Si no hay flow (o falla la carga) → cae a HandleMessageUseCase (FSM legacy).
 *
 * El cliente de WhatsApp no nota la diferencia — ambas rutas envían mensajes
 * por el mismo NotificationPort.
 */
export class BotController {
  private readonly handleMessageUseCase: HandleMessageUseCase;

  constructor(
    private readonly userRepository: UserRepository,
    private readonly notificationPort: NotificationPort,
    private readonly tenantConfigPort: TenantConfigPort,
    private readonly botFlowRepository: BotFlowRepository,
    private readonly flowInterpreter: FlowInterpreter,
    private readonly logger: pino.Logger,
  ) {
    this.handleMessageUseCase = new HandleMessageUseCase(userRepository);
  }

  async processMessage(
    tenantId: string,
    from: string,
    content: string,
    metaMessageId?: string,
  ): Promise<string | null> {
    try {
      this.logger.info(
        { tenantId, from, contentPreview: content.slice(0, 80) },
        'Mensaje recibido',
      );

      // 1. Cargar configuración del tenant (con caché)
      const config = await this.tenantConfigPort.getConfig(tenantId);
      if (!config) {
        this.logger.error(
          { tenantId },
          'No hay bot_configuration para este tenant — ignorando mensaje',
        );
        return null;
      }

      // 2. Construir entidad del dominio
      const message: Message = {
        id: this.generateId(),
        tenantId,
        from,
        content,
        timestamp: new Date(),
        metaMessageId,
      };

      // 3. Intentar cargar bot_flow activo
      let flow = null;
      try {
        flow = await this.botFlowRepository.findActiveByTenant(tenantId);
      } catch (err) {
        this.logger.error(
          { err, tenantId },
          'Error cargando bot_flow — degradando a FSM legacy',
        );
      }

      // 4. Ruta principal: FlowInterpreter
      if (flow) {
        const user = await this.getOrCreateUser(tenantId, from);
        const result = await this.flowInterpreter.execute({
          flow,
          user,
          message,
          tenantConfig: config,
        });

        // Persistir nextNodeId + contextUpdates
        const mergedContext = { ...(user.context ?? {}), ...result.contextUpdates };
        await this.userRepository.update({
          ...user,
          currentNodeId: result.nextNodeId,
          context: mergedContext,
          updatedAt: new Date(),
        });

        // Enviar outputs
        const lastText = await this.dispatchOutputs(tenantId, from, result.outputs);

        this.logger.info(
          {
            tenantId,
            from,
            nextNodeId: result.nextNodeId,
            outputs: result.outputs.length,
            flowEnded: result.flowEnded,
          },
          'Flow ejecutado',
        );
        return lastText;
      }

      // 5. Fallback: HandleMessageUseCase (FSM hardcodeada)
      this.logger.debug({ tenantId }, 'Usando FSM legacy (sin bot_flow activo)');
      const response = await this.handleMessageUseCase.execute(message, config);

      this.logger.info(
        { tenantId, from, hasButtons: !!response.buttons?.length },
        'Respuesta FSM generada',
      );

      if (response.buttons && response.buttons.length > 0) {
        await this.notificationPort.sendButtons(tenantId, from, response.message, response.buttons);
      } else {
        await this.notificationPort.sendMessage(tenantId, from, response.message);
      }

      return response.message;
    } catch (error) {
      this.logger.error({ error, tenantId, from }, 'Error procesando mensaje');
      throw error;
    }
  }

  private async getOrCreateUser(tenantId: string, from: string): Promise<User> {
    const existing = await this.userRepository.findByPhoneNumber(tenantId, from);
    if (existing) return existing;

    const newUser: User = {
      id: this.generateId(),
      tenantId,
      phoneNumber: from,
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
   * Traduce InterpreterOutput[] a llamadas al NotificationPort.
   * Devuelve el último texto enviado (o null si no se envió nada).
   */
  private async dispatchOutputs(
    tenantId: string,
    to: string,
    outputs: InterpreterOutput[],
  ): Promise<string | null> {
    let lastText: string | null = null;

    for (const output of outputs) {
      switch (output.kind) {
      case 'text':
        await this.notificationPort.sendMessage(tenantId, to, output.text);
        lastText = output.text;
        break;

      case 'buttons':
        await this.notificationPort.sendButtons(
          tenantId,
          to,
          output.text,
          output.buttons.map((b) => b.title),
        );
        lastText = output.text;
        break;

      case 'list': {
        const lines: string[] = [output.text];
        if (output.sections.length > 0) lines.push('');
        for (const section of output.sections) {
          if (section.title) lines.push(`*${section.title}*`);
          section.items.forEach((item, i) => {
            const desc = item.description ? ` — ${item.description}` : '';
            lines.push(`${i + 1}. ${item.title}${desc}`);
          });
        }
        const text = lines.join('\n');
        await this.notificationPort.sendMessage(tenantId, to, text);
        lastText = text;
        break;
      }

      case 'image':
        await this.notificationPort.sendImage(
          tenantId,
          to,
          output.url,
          output.caption,
        );
        lastText = output.caption ?? null;
        break;

      case 'location':
        this.logger.warn(
          { kind: output.kind, to },
          'send_location aún no soportado por NotificationPort — omitiendo',
        );
        break;

      case 'escape_to_human':
        await this.notificationPort.sendMessage(tenantId, to, output.userResponse);
        lastText = output.userResponse;
        // owner_alert se ignora en V1 — Sprint futuro lo enrutará al operador.
        break;
      }
    }

    return lastText;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
}
