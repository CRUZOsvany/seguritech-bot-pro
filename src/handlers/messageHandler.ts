import { WAMessage } from '@whiskeysockets/baileys';
import logger from '@/config/logger';

export interface MessageHandler {
  handle(message: WAMessage, senderJid: string): Promise<string | null>;
}

/**
 * Handler principal para procesar mensajes
 * Evalúa el contenido del mensaje y determina la respuesta
 */
export class DefaultMessageHandler implements MessageHandler {
  async handle(message: WAMessage, senderJid: string): Promise<string | null> {
    try {
      const messageBody = message.message?.conversation ||
                         message.message?.extendedTextMessage?.text || '';

      logger.info({ senderJid, messageBody }, 'Mensaje recibido');

      // Respuestas básicas
      if (messageBody.toLowerCase().includes('hola')) {
        return this.getMainMenu();
      }

      if (messageBody.toLowerCase().includes('1')) {
        return '🛍️ *Productos disponibles:*\n\n1. Sistema de Seguridad SegurITech\n2. Cuadernos Paperay\n3. Paquetes Premium';
      }

      if (messageBody.toLowerCase().includes('2')) {
        return '💰 *Precios:*\n\nSistema Seguridad: $5,000\nCuadernos (pack 10): $25\nPaquete Premium: Consultenos';
      }

      if (messageBody.toLowerCase().includes('3')) {
        return '📋 Para hacer un pedido, escriba:\n\n*Nombre*: Tu nombre\n*Producto*: Qué deseas\n*Cantidad*: Cuántas unidades';
      }

      // Respuesta por defecto
      return this.getMainMenu();
    } catch (error) {
      logger.error({ error, senderJid }, 'Error procesando mensaje');
      return 'Lo siento, hubo un error. Intenta de nuevo.';
    }
  }

  private getMainMenu(): string {
    return `🤖 *¡Bienvenido a SegurITech!*

Selecciona una opción:

1️⃣ Ver productos
2️⃣ Ver precios
3️⃣ Hacer un pedido
4️⃣ Hablar con un agente

Escribe el número de la opción que deseas.`;
  }
}

