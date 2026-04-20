import pino from 'pino';
import { Message, BotResponse } from '@/domain/entities';
import { HandleMessageUseCase } from '@/domain/use-cases/HandleMessageUseCase';
import { NotificationPort } from '@/domain/ports';

/**
 * Controlador del bot
 * Orquesta los casos de uso y adapta entre infraestructura y dominio
 *
 * Responsabilidades:
 * - Recibir eventos de WhatsApp
 * - Convertir a objetos del dominio
 * - Ejecutar casos de uso
 * - Enviar respuestas
 */
export class BotController {
  private handleMessageUseCase: HandleMessageUseCase;
  private logger: pino.Logger;
  private notificationPort: NotificationPort;

  constructor(
    userRepository: any,
    notificationPort: NotificationPort,
    logger: pino.Logger,
  ) {
    this.handleMessageUseCase = new HandleMessageUseCase(
      userRepository,
      notificationPort,
    );
    this.logger = logger;
    this.notificationPort = notificationPort;
  }

  async processMessage(tenantId: string, from: string, content: string): Promise<string | null> {
    try {
      this.logger.info(`[Tenant: ${tenantId}] Mensaje recibido de ${from}: "${content}"`);

      // Crear objeto del dominio con tenantId
      const message: Message = {
        id: this.generateId(),
        tenantId, // IMPORTANTE: Incluir tenantId en el mensaje
        from,
        content,
        timestamp: new Date(),
      };

      // Ejecutar caso de uso
      const response: BotResponse = await this.handleMessageUseCase.execute(message);

      this.logger.info(`[Tenant: ${tenantId}] Respuesta generada para ${from}`);

      // Enviar respuesta via adaptador
      if (response.buttons && response.buttons.length > 0) {
        await this.notificationPort.sendButtons(from, response.message, response.buttons);
      } else {
        await this.notificationPort.sendMessage(from, response.message);
      }

      return response.message;
    } catch (error) {
      this.logger.error(`[Tenant: ${tenantId}] Error procesando mensaje de ${from}:`, error);
      throw error;
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
