/**
 * EJEMPLOS DE EXTENSIÓN
 *
 * Cómo agregar nuevas funcionalidades sin romper la arquitectura
 */

// ============================================================================
// EJEMPLO 1: Agregar Adaptador de Notificación por Email
// ============================================================================

/*
// src/infrastructure/adapters/EmailNotificationAdapter.ts

import nodemailer from 'nodemailer';
import { NotificationPort } from '@/domain/ports';
import pino from 'pino';

export class EmailNotificationAdapter implements NotificationPort {
  private transporter: nodemailer.Transporter;
  private logger: pino.Logger;

  constructor(logger: pino.Logger, emailConfig: any) {
    this.logger = logger;
    this.transporter = nodemailer.createTransport(emailConfig);
  }

  async sendMessage(email: string, message: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        to: email,
        subject: 'SegurITech Bot',
        html: `<p>${message}</p>`,
      });
      this.logger.info(`Email enviado a ${email}`);
    } catch (error) {
      this.logger.error(`Error enviando email a ${email}:`, error);
      throw error;
    }
  }

  async sendButtons(email: string, message: string, buttons: string[]): Promise<void> {
    try {
      const buttonsHtml = buttons
        .map((btn, idx) => `<button data-id="${idx}">${btn}</button>`)
        .join('');

      await this.transporter.sendMail({
        to: email,
        subject: 'SegurITech Bot',
        html: `<p>${message}</p><div>${buttonsHtml}</div>`,
      });
      this.logger.info(`Email con opciones enviado a ${email}`);
    } catch (error) {
      this.logger.error(`Error enviando email a ${email}:`, error);
      throw error;
    }
  }
}
*/

// Para usar en Bootstrap.ts:
/*
const emailAdapter = new EmailNotificationAdapter(logger, {
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const container = new ApplicationContainer(
  userRepository,
  emailAdapter,  // ← Cambiar de ConsoleNotificationAdapter a EmailNotificationAdapter
  logger,
);
*/

// ============================================================================
// EJEMPLO 2: Agregar Nuevo Caso de Uso - Obtener Historial de Pedidos
// ============================================================================

/*
// src/domain/use-cases/GetOrderHistoryUseCase.ts

import { Order } from '@/domain/entities';
import { OrderRepository } from '@/domain/ports';
import { UseCase } from '@/domain/interfaces/UseCase';

export class GetOrderHistoryUseCase implements UseCase<string, Order[]> {
  constructor(private orderRepository: OrderRepository) {}

  async execute(userId: string): Promise<Order[]> {
    const orders = await this.orderRepository.findByUserId(userId);
    return orders.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}
*/

// Integrar en BotController:
/*
// src/app/controllers/BotController.ts

export class BotController {
  private handleMessageUseCase: HandleMessageUseCase;
  private getOrderHistoryUseCase: GetOrderHistoryUseCase;

  async processMessage(from: string, content: string): Promise<void> {
    // ... código anterior ...

    if (content.toLowerCase() === 'mi historial') {
      const orders = await this.getOrderHistoryUseCase.execute(from);
      const historyText = orders
        .map((o) => `Pedido ${o.id}: ${o.productId} - ${o.totalPrice}€`)
        .join('\n');
      // Enviar respuesta
    }
  }
}
*/

// ============================================================================
// EJEMPLO 3: Agregar Repositorio de Base de Datos Real (MongoDB)
// ============================================================================

/*
// src/infrastructure/repositories/MongoUserRepository.ts

import { User } from '@/domain/entities';
import { UserRepository } from '@/domain/ports';
import { MongoClient, Db } from 'mongodb';

export class MongoUserRepository implements UserRepository {
  private db: Db;

  constructor(mongoClient: MongoClient) {
    this.db = mongoClient.db('seguritech_bot');
  }

  async save(user: User): Promise<void> {
    const collection = this.db.collection('users');
    await collection.insertOne(user);
  }

  async findById(id: string): Promise<User | null> {
    const collection = this.db.collection('users');
    return await collection.findOne({ id }) as User | null;
  }

  async findByPhoneNumber(phoneNumber: string): Promise<User | null> {
    const collection = this.db.collection('users');
    return await collection.findOne({ phoneNumber }) as User | null;
  }

  async update(user: User): Promise<void> {
    const collection = this.db.collection('users');
    await collection.updateOne({ id: user.id }, { $set: user });
  }
}
*/

// En Bootstrap.ts:
/*
import { MongoClient } from 'mongodb';

const mongoClient = new MongoClient(process.env.DATABASE_URL!);
await mongoClient.connect();

const userRepository = new MongoUserRepository(mongoClient);
// const userRepository = new InMemoryUserRepository();  // ← Cambiar esta línea

const container = new ApplicationContainer(
  userRepository,
  notificationPort,
  logger,
);
*/

// ============================================================================
// EJEMPLO 4: Agregar Validación de Negocio Avanzada
// ============================================================================

/*
// src/domain/services/OrderValidationService.ts

import { Order, User, Product } from '@/domain/entities';
import { OrderStatus } from '@/domain/entities';

export class OrderValidationService {
  // Validar si el usuario puede hacer pedidos (ej: límite de compras/día)
  async canMakeOrder(user: User, maxOrdersPerDay: number = 5): Promise<boolean> {
    // En realidad, consultaría un repositorio
    return true;
  }

  // Validar si hay stock del producto
  async hasStock(product: Product, quantity: number): Promise<boolean> {
    return product.available && quantity > 0;
  }

  // Validar si el pedido es válido
  validateOrder(order: Order): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!order.userId) errors.push('Usuario no especificado');
    if (!order.productId) errors.push('Producto no especificado');
    if (order.quantity <= 0) errors.push('Cantidad debe ser mayor a 0');
    if (order.totalPrice <= 0) errors.push('Precio debe ser mayor a 0');

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

// Usar en caso de uso:
export class CreateOrderUseCase {
  constructor(
    private orderRepository: OrderRepository,
    private validationService: OrderValidationService,
  ) {}

  async execute(order: Order): Promise<void> {
    const validation = this.validationService.validateOrder(order);
    if (!validation.isValid) {
      throw new Error(`Orden inválida: ${validation.errors.join(', ')}`);
    }
    await this.orderRepository.save(order);
  }
}
*/

// ============================================================================
// EJEMPLO 5: Agregar Adaptador de Telegram
// ============================================================================

/*
// src/infrastructure/adapters/TelegramNotificationAdapter.ts

import { Telegraf } from 'telegraf';
import { NotificationPort } from '@/domain/ports';
import pino from 'pino';

export class TelegramNotificationAdapter implements NotificationPort {
  private bot: Telegraf;
  private logger: pino.Logger;

  constructor(logger: pino.Logger, botToken: string) {
    this.logger = logger;
    this.bot = new Telegraf(botToken);
  }

  async sendMessage(chatId: string, message: string): Promise<void> {
    try {
      await this.bot.telegram.sendMessage(chatId, message);
      this.logger.info(`Mensaje enviado a Telegram ${chatId}`);
    } catch (error) {
      this.logger.error(`Error enviando mensaje a Telegram ${chatId}:`, error);
      throw error;
    }
  }

  async sendButtons(chatId: string, message: string, buttons: string[]): Promise<void> {
    try {
      const keyboard = {
        inline_keyboard: buttons.map((btn, idx) => [
          { text: btn, callback_data: `btn_${idx}` },
        ]),
      };

      await this.bot.telegram.sendMessage(chatId, message, {
        reply_markup: keyboard,
      });
      this.logger.info(`Mensaje con botones enviado a Telegram ${chatId}`);
    } catch (error) {
      this.logger.error(`Error enviando botones a Telegram ${chatId}:`, error);
      throw error;
    }
  }

  async initialize(): Promise<void> {
    this.bot.launch();
    this.logger.info('Telegram bot iniciado');
  }
}
*/

// ============================================================================
// EJEMPLO 6: Agregar Análisis de Sentimiento
// ============================================================================

/*
// src/domain/services/SentimentAnalysisService.ts

export enum Sentiment {
  POSITIVE = 'positive',
  NEUTRAL = 'neutral',
  NEGATIVE = 'negative',
}

export class SentimentAnalysisService {
  private positiveWords = ['hola', 'gracias', 'bueno', 'perfecto', 'excelente'];
  private negativeWords = ['malo', 'horrible', 'problema', 'error', 'reclamo'];

  analyze(text: string): Sentiment {
    const lowerText = text.toLowerCase();
    const positiveCount = this.positiveWords.filter((w) => lowerText.includes(w))
      .length;
    const negativeCount = this.negativeWords.filter((w) => lowerText.includes(w))
      .length;

    if (positiveCount > negativeCount) return Sentiment.POSITIVE;
    if (negativeCount > positiveCount) return Sentiment.NEGATIVE;
    return Sentiment.NEUTRAL;
  }
}

// Usar en caso de uso:
export class HandleMessageUseCase {
  constructor(
    // ... otras dependencias ...
    private sentimentService: SentimentAnalysisService,
  ) {}

  async execute(message: Message): Promise<BotResponse> {
    const sentiment = this.sentimentService.analyze(message.content);

    if (sentiment === Sentiment.NEGATIVE) {
      return {
        message: 'Lamentamos oír eso. Un agente se pondrá en contacto pronto.',
        nextState: UserState.SUPPORT,
      };
    }

    // ... resto de la lógica ...
  }
}
*/

// ============================================================================
// EJEMPLO 7: Agregar Caché con Redis
// ============================================================================

/*
// src/infrastructure/adapters/RedisUserRepositoryCache.ts

import Redis from 'ioredis';
import { User } from '@/domain/entities';
import { UserRepository } from '@/domain/ports';

export class RedisUserRepositoryCache implements UserRepository {
  private redis: Redis;
  private baseRepository: UserRepository;
  private cacheTTL = 3600; // 1 hora

  constructor(baseRepository: UserRepository, redisUrl: string) {
    this.baseRepository = baseRepository;
    this.redis = new Redis(redisUrl);
  }

  async save(user: User): Promise<void> {
    await this.baseRepository.save(user);
    await this.redis.setex(`user:${user.id}`, this.cacheTTL, JSON.stringify(user));
  }

  async findById(id: string): Promise<User | null> {
    // Intentar obtener del caché
    const cached = await this.redis.get(`user:${id}`);
    if (cached) {
      return JSON.parse(cached);
    }

    // Si no está en caché, obtener de base de datos
    const user = await this.baseRepository.findById(id);
    if (user) {
      await this.redis.setex(`user:${id}`, this.cacheTTL, JSON.stringify(user));
    }
    return user;
  }

  // ... otros métodos ...
}
*/

// ============================================================================
// EJEMPLO 8: Agregar REST API
// ============================================================================

/*
// src/infrastructure/api/ExpressAdapter.ts

import express, { Express, Request, Response } from 'express';
import { BotController } from '@/app/controllers/BotController';

export class ExpressAPIAdapter {
  private app: Express;

  constructor(private botController: BotController) {
    this.app = express();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Enviar mensaje
    this.app.post('/api/messages', async (req: Request, res: Response) => {
      const { from, content } = req.body;
      try {
        await this.botController.processMessage(from, content);
        res.json({ success: true });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    // Webhook para WhatsApp
    this.app.post('/api/webhooks/whatsapp', async (req: Request, res: Response) => {
      // Procesar webhook de WhatsApp
      res.json({ success: true });
    });
  }

  start(port: number): void {
    this.app.listen(port, () => {
      console.log(`API escuchando en puerto ${port}`);
    });
  }
}
*/

// ============================================================================
// RESUMEN DE EXTENSIONES
// ============================================================================

/*
Para agregar cualquier nueva funcionalidad:

1. ¿Es lógica de negocio?
   → Crear en src/domain/

2. ¿Es una integración externa (WhatsApp, Email, etc)?
   → Crear adaptador en src/infrastructure/adapters/

3. ¿Es almacenamiento de datos?
   → Crear repositorio en src/infrastructure/repositories/

4. ¿Es orquestación?
   → Actualizar BotController en src/app/controllers/

5. ¿Es configuración?
   → Agregar a src/config/env.ts

NUNCA:
  ❌ Mezclar capas
  ❌ Usar any types
  ❌ Código duplicado
  ❌ Lógica en adaptadores
  ❌ Cambiar el dominio innecesariamente

SIEMPRE:
  ✅ Respetar arquitectura hexagonal
  ✅ Usar interfaces (puertos)
  ✅ Inyectar dependencias
  ✅ Mantener dominio puro
  ✅ Escribir código limpio
*/

export {};
