import express, { Express, Request, Response } from 'express';
import pino from 'pino';
import { config } from '@/config/env';

/**
 * Servidor Express con webhook para WhatsApp Cloud API
 * POST /webhook - Recibe mensajes de WhatsApp o pruebas locales
 */
export class ExpressServer {
  private app: Express;
  private logger: pino.Logger;
  private server: any;

  constructor(logger: pino.Logger) {
    this.logger = logger;
    this.app = express();
    this.setupMiddleware();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
  }

  setupRoutes(
    processMessage: (tenantId: string, phoneNumber: string, text: string) => Promise<string | null>
  ): void {
    // POST /webhook/:tenantId - Recibe mensajes de WhatsApp (Cloud API) para un tenant específico
    this.app.post('/webhook/:tenantId', async (req: Request, res: Response): Promise<void> => {
      try {
        const tenantId = String(req.params.tenantId);
        const { phoneNumber, message } = req.body;

        if (!tenantId || !phoneNumber || !message) {
          res.status(400).json({
            error: 'Missing tenantId (URL param), phoneNumber or message (body)',
          });
          return;
        }

        this.logger.info(
          { tenantId, phoneNumber, message },
          '📨 Mensaje recibido via webhook'
        );

        const response = await processMessage(tenantId, phoneNumber, message);

        res.json({
          success: true,
          tenantId,
          response: response || null,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        this.logger.error({ error }, '❌ Error en webhook');
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // POST /webhook - Compatibilidad con llamadas sin tenantId
    // NOTA: En producción, requerir siempre tenantId
    this.app.post('/webhook', async (req: Request, res: Response): Promise<void> => {
      try {
        const { tenantId, phoneNumber, message } = req.body;

        if (!tenantId || !phoneNumber || !message) {
          res.status(400).json({
            error: 'Missing tenantId, phoneNumber or message. Use POST /webhook/:tenantId',
          });
          return;
        }

        this.logger.info(
          { tenantId, phoneNumber, message },
          '📨 Mensaje recibido via webhook (body)'
        );

        const response = await processMessage(tenantId, phoneNumber, message);

        res.json({
          success: true,
          tenantId,
          response: response || null,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        this.logger.error({ error }, '❌ Error en webhook');
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // GET /health - Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // GET /webhook - Verificación de Webhook de Meta (requerido)
    // Soporta verificación tanto en /webhook como en /webhook/:tenantId
    this.app.get('/webhook', (req: Request, res: Response) => {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      // En producción, verificar contra variable de entorno
      if (mode === 'subscribe' && token === 'tu_token_secreto') {
        this.logger.info('✅ Webhook verificado por Meta');
        res.status(200).send(String(challenge));
      } else {
        this.logger.warn('❌ Token de verificación incorrecto');
        res.sendStatus(403);
      }
    });

    // GET /webhook/:tenantId - Verificación de Webhook de Meta (multi-tenant)
    this.app.get('/webhook/:tenantId', (req: Request, res: Response) => {
      const tenantId = String(req.params.tenantId);
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      // En producción, verificar contra variable de entorno
      if (mode === 'subscribe' && token === 'tu_token_secreto') {
        this.logger.info(`✅ Webhook verificado por Meta para tenant: ${tenantId}`);
        res.status(200).send(String(challenge));
      } else {
        this.logger.warn(`❌ Token de verificación incorrecto para tenant: ${tenantId}`);
        res.sendStatus(403);
      }
    });
  }

  async start(port?: number): Promise<void> {
    const PORT = port || parseInt(config.whatsapp.webhookPort || '3001', 10);

    return new Promise((resolve) => {
      this.server = this.app.listen(PORT, () => {
        this.logger.info(`🚀 Servidor Express escuchando en puerto ${PORT}`);
        this.logger.info(`📍 Webhooks disponibles:`);
        this.logger.info(`   POST http://localhost:${PORT}/webhook/:tenantId`);
        this.logger.info(`   POST http://localhost:${PORT}/webhook (con tenantId en body)`);
        this.logger.info(`   GET  http://localhost:${PORT}/health`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          this.logger.info('🛑 Servidor cerrado');
          resolve();
        });
      });
    }
  }

  getExpressApp(): Express {
    return this.app;
  }
}

