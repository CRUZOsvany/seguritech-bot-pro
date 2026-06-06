import { randomUUID } from 'crypto';
import pino from 'pino';
import { Message, User, UserState } from '@/domain/entities';
import { FlowInterpreter, InterpreterOutput } from '@/domain/services/FlowInterpreter';
import {
  NotificationPort,
  UserRepository,
  TenantConfigPort,
  BotFlowRepository,
} from '@/domain/ports';

/**
 * Controlador del bot.
 *
 * Ruta única: FlowInterpreter cuando el tenant tiene bot_flow activo.
 * Sin flow → mensaje de mantenimiento (ADR-012: fallback a FSM hardcodeada
 * de papelería eliminado en Sprint 6 — causaba que ferreterías/cerrajerías
 * respondieran con catálogo de productos escolares).
 */
export class BotController {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly notificationPort: NotificationPort,
    private readonly tenantConfigPort: TenantConfigPort,
    private readonly botFlowRepository: BotFlowRepository,
    private readonly flowInterpreter: FlowInterpreter,
    private readonly logger: pino.Logger,
  ) {}

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
          'Error cargando bot_flow — respondiendo "en mantenimiento"',
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
        const lastText = await this.dispatchOutputs(
          tenantId,
          from,
          result.outputs,
          config.ownerPhone,
          metaMessageId,
        );

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

      // 5. Sin bot_flow activo — respuesta de mantenimiento (ADR-012).
      const maintenanceText =
        '⚙️ Este servicio está siendo configurado. Por favor intenta más tarde.';
      this.logger.warn(
        { tenantId, from },
        '[BotController] Tenant sin bot_flow activo — respondiendo "en mantenimiento"',
      );
      await this.notificationPort.sendMessage(tenantId, from, maintenanceText);
      return maintenanceText;
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
    ownerPhone?: string | null,
    lastUserMessageId?: string, // nuevo: para send_reaction
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

      case 'list':
        await this.notificationPort.sendList(
          tenantId,
          to,
          output.text,
          output.buttonLabel,
          output.sections.map((section) => ({
            title: section.title,
            rows: section.items.map((item) => ({
              id: item.id,
              title: item.title,
              ...(item.description ? { description: item.description } : {}),
            })),
          })),
        );
        lastText = output.text;
        break;

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
        await this.notificationPort.sendLocation(
          tenantId,
          to,
          output.latitude,
          output.longitude,
          output.name,
          output.address,
        );
        lastText = output.name ?? null;
        break;

      case 'document':
        await this.notificationPort.sendDocument(
          tenantId,
          to,
          output.url,
          output.filename,
          output.caption,
        );
        lastText = output.caption ?? output.filename;
        break;

      case 'escape_to_human':
        await this.notificationPort.sendMessage(tenantId, to, output.userResponse);
        lastText = output.userResponse;
        // Aviso al dueño por WhatsApp — best-effort: NUNCA rompe el flujo del cliente.
        // El destino (ownerPhone) viene de owner_data.whatsapp_dueno vía TenantConfig.
        if (ownerPhone && output.ownerAlert?.trim()) {
          try {
            await this.notificationPort.sendMessage(tenantId, ownerPhone, output.ownerAlert);
            this.logger.info({ tenantId }, 'Aviso de lead enviado al dueño');
          } catch (err) {
            this.logger.error(
              { err, tenantId },
              'No se pudo enviar el aviso al dueño (el cliente sí recibió su cierre)',
            );
          }
        } else if (!ownerPhone) {
          this.logger.warn(
            { tenantId },
            'escape_to_human sin ownerPhone (owner_data.whatsapp_dueno) — aviso no enviado',
          );
        }
        break;

      case 'cta_url':
        await this.notificationPort.sendCtaUrl(
          tenantId,
          to,
          output.body,
          output.button,
          {
            ...(output.header ? { header: output.header } : {}),
            ...(output.footer ? { footer: output.footer } : {}),
          },
        );
        lastText = output.body;
        break;

      case 'location_request':
        await this.notificationPort.sendLocationRequest(tenantId, to, output.body);
        lastText = output.body;
        break;

      case 'media_carousel':
        await this.notificationPort.sendMediaCarousel(tenantId, to, output.body, output.cards);
        lastText = output.body;
        break;

      case 'reaction':
        if (lastUserMessageId) {
          await this.notificationPort.sendReaction(tenantId, to, lastUserMessageId, output.emoji);
        } else {
          this.logger.warn(
            { tenantId },
            'send_reaction sin messageId del usuario — reacción omitida',
          );
        }
        // Reactions no tienen texto de respuesta
        break;

      case 'call_permission_request':
        await this.notificationPort.sendCallPermissionRequest(
          tenantId,
          to,
          output.body,
          output.footer,
        );
        lastText = output.body;
        break;

      case 'whatsapp_flow':
        await this.notificationPort.sendWhatsappFlow(
          tenantId,
          to,
          output.body,
          output.flow_id_meta,
          output.flow_cta,
          {
            header: output.header,
            footer: output.footer,
            mode: output.mode,
            flow_action: output.flow_action,
            flow_action_payload: output.flow_action_payload,
          },
        );
        lastText = output.body;
        break;
      }
    }

    return lastText;
  }

  private generateId(): string {
    return randomUUID();
  }
}
