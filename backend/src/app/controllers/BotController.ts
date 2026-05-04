import pino from 'pino';
import { Message, BotResponse } from '@/domain/entities';
import { HandleMessageUseCase } from '@/domain/use-cases/HandleMessageUseCase';
import { NotificationPort, UserRepository, TenantConfigPort } from '@/domain/ports';

/**
 * Controlador del bot.
 * Orquesta los casos de uso y adapta entre infraestructura y dominio.
 *
 * Responsabilidades:
 * - Cargar configuración del tenant
 * - Convertir mensaje a entidad de dominio
 * - Ejecutar caso de uso
 * - Enviar respuesta via NotificationPort
 */
export class BotController {
  private readonly handleMessageUseCase: HandleMessageUseCase;

  constructor(
    private readonly userRepository: UserRepository,
    private readonly notificationPort: NotificationPort,
    private readonly tenantConfigPort: TenantConfigPort,
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

      // 3. Ejecutar caso de uso (lógica de negocio pura)
      const response: BotResponse = await this.handleMessageUseCase.execute(
        message,
        config,
      );

      this.logger.info(
        { tenantId, from, hasButtons: !!response.buttons?.length },
        'Respuesta generada',
      );

      // 4. Enviar respuesta
      if (response.buttons && response.buttons.length > 0) {
        await this.notificationPort.sendButtons(
          from,
          response.message,
          response.buttons,
        );
      } else {
        await this.notificationPort.sendMessage(from, response.message);
      }

      return response.message;
    } catch (error) {
      this.logger.error(
        { error, tenantId, from },
        'Error procesando mensaje',
      );
      throw error;
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
}