import { randomUUID } from 'crypto';
import pino from 'pino';
import { config } from '@/config/env';

/** TTL de la pausa por handoff humano, en ms. Default global 48h (env HANDOFF_PAUSE_MINUTES, D3). */
const HUMAN_HANDOFF_TTL_MS = config.bot.handoffPauseMinutes * 60 * 1000;
import { Message, User, UserState } from '@/domain/entities';
import { FlowInterpreter, InterpreterOutput } from '@/domain/services/FlowInterpreter';
import {
  NotificationPort,
  UserRepository,
  TenantConfigPort,
  BotFlowRepository,
  AuditPort,
} from '@/domain/ports';

/**
 * Comandos que el DUEÑO del negocio puede mandarle al número del bot para
 * reanudar una conversación pausada por handoff humano, sin tocar el panel
 * (P4, D4). Match EXACTO y case-insensitive — cualquier otro mensaje del
 * dueño sigue de largo al FlowInterpreter normal, para que pueda seguir
 * auto-probando su propio bot como si fuera cliente.
 */
const OWNER_RESUME_COMMANDS = ['#listo', '#reanudar'] as const;

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
    private readonly auditPort: AuditPort,
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

      // 1.5. Gate de comandos del dueño (D4/P4): si el mensaje viene del
      // ownerPhone y matchea EXACTO un comando conocido, se resuelve aquí y
      // NUNCA se toca el FlowInterpreter. Va antes de cargar el flow porque
      // no lo necesita. Cualquier otro mensaje del dueño sigue de largo.
      if (config.ownerPhone && this.isOwnerPhone(from, config.ownerPhone)) {
        // null = el mensaje no matcheó ningún comando -> sigue de largo al flow.
        const reply = await this.tryHandleOwnerCommand(tenantId, from, content);
        if (reply !== null) return reply;
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

        // Gate de handoff humano: si el usuario está en pausa, el bot calla.
        if (user.humanPausedUntil && user.humanPausedUntil > new Date()) {
          this.logger.info(
            { tenantId, from, pausedUntil: user.humanPausedUntil },
            'Usuario en handoff humano — mensaje registrado, bot silenciado',
          );
          return null;
        }

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

        // Si algún output fue escape_to_human, activar pausa en BD.
        const handoffTriggered = result.outputs.some((o) => o.kind === 'escape_to_human');
        if (handoffTriggered) {
          const pausedUntil = new Date(Date.now() + HUMAN_HANDOFF_TTL_MS);
          await this.userRepository.setHumanHandoff(tenantId, from, pausedUntil);
          this.logger.info(
            { tenantId, from, pausedUntil },
            'Handoff humano activado — bot silenciado 48 h',
          );
        }

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
            const enrichedAlert = this.enrichOwnerAlert(output.ownerAlert, to);
            await this.notificationPort.sendMessage(tenantId, ownerPhone, enrichedAlert);
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

  // ==========================================================================
  // P4 — Reanudación de handoff por WhatsApp del dueño (D4, conservadora)
  // ==========================================================================

  private normalizeDigits(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  private isOwnerPhone(from: string, ownerPhone: string): boolean {
    const a = this.normalizeDigits(from);
    const b = this.normalizeDigits(ownerPhone);
    return a.length > 0 && a === b;
  }

  /**
   * Match EXACTO (case-insensitive) contra OWNER_RESUME_COMMANDS, con o sin
   * un código de 4 dígitos (últimos 4 del teléfono del cliente a reanudar).
   * `null` = el mensaje no es un comando reconocido.
   */
  private matchOwnerResumeCommand(content: string): { code: string | null } | null {
    const trimmed = content.trim();
    for (const cmd of OWNER_RESUME_COMMANDS) {
      if (trimmed.toLowerCase() === cmd) return { code: null };
      const withCode = new RegExp(`^${cmd}\\s+(\\d{4})$`, 'i');
      const m = trimmed.match(withCode);
      if (m) return { code: m[1] };
    }
    return null;
  }

  /** "vence en 3h 20m" — cuánto falta para que la pausa expire sola. */
  private formatRemaining(until: Date | null | undefined): string {
    if (!until) return '';
    const ms = until.getTime() - Date.now();
    if (ms <= 0) return 'por expirar';
    const hours = Math.floor(ms / 3_600_000);
    const mins = Math.floor((ms % 3_600_000) / 60_000);
    return hours > 0 ? `vence en ${hours}h${mins > 0 ? ` ${mins}m` : ''}` : `vence en ${mins}m`;
  }

  /**
   * Resuelve un comando del dueño. Devuelve `null` si `content` no matcheó
   * ningún comando (el caller debe dejar que el mensaje siga al flow normal,
   * D4). Si matcheó, SIEMPRE contesta algo al dueño y devuelve ese texto.
   */
  private async tryHandleOwnerCommand(
    tenantId: string,
    ownerPhone: string,
    content: string,
  ): Promise<string | null> {
    const match = this.matchOwnerResumeCommand(content);
    if (!match) return null;

    const reply = async (text: string): Promise<string> => {
      await this.notificationPort.sendMessage(tenantId, ownerPhone, text);
      return text;
    };

    const paused = await this.userRepository.listPaused(tenantId);

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

    await this.userRepository.setHumanHandoff(tenantId, target.phoneNumber, null);
    this.auditPort.log({
      actorLabel: `whatsapp:${ownerPhone}`,
      action: 'handoff.resume_via_whatsapp',
      targetType: 'bot_user',
      targetId: target.id,
      metadata: { tenantId, resumedPhone: target.phoneNumber },
    });
    this.logger.info(
      { tenantId, resumedPhone: target.phoneNumber },
      'Handoff reanudado por comando de WhatsApp del dueño',
    );
    return reply(`Listo, reanudé el bot para …${target.phoneNumber.slice(-4)}.`);
  }

  /**
   * Agrega al owner_alert (escrito a mano en el flow) un pie fijo con link
   * wa.me al cliente, hora, y el código para reanudarlo con #listo — sin
   * depender de que cada molde lo repita. P4.
   */
  private enrichOwnerAlert(alert: string, clientPhone: string): string {
    const digits = this.normalizeDigits(clientPhone);
    const code = clientPhone.slice(-4);
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return (
      `${alert}\n\n` +
      `💬 https://wa.me/${digits}\n` +
      `🕐 ${time}\n\n` +
      `Cuando termines: *#listo ${code}*`
    );
  }

  private generateId(): string {
    return randomUUID();
  }
}
