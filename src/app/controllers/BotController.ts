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

  async processMessage(from: string, content: string): Promise<string | null> {
    try {
      this.logger.info(`Mensaje recibido de ${from}: "${content}"`);

      // Crear objeto del dominio
      const message: Message = {
        id: this.generateId(),
        from,
        content,
        timestamp: new Date(),
      };

      // Ejecutar caso de uso
      const response: BotResponse = await this.handleMessageUseCase.execute(message);

      this.logger.info(`Respuesta generada para ${from}`);

      // Enviar respuesta via adaptador
      if (response.buttons && response.buttons.length > 0) {
        await this.notificationPort.sendButtons(from, response.message, response.buttons);
      } else {
        await this.notificationPort.sendMessage(from, response.message);
      }

      return response.message;
    } catch (error) {
      this.logger.error(`Error procesando mensaje de ${from}:`, error);
      throw error;
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
