import express, { Express, Request, Response } from 'express';
import pino from 'pino';
import { config } from '@/config/env';
import { MetaWhatsAppAdapter } from '@/infrastructure/adapters/MetaWhatsAppAdapter';

/**
 * Servidor Express con webhook para WhatsApp Cloud API
 * POST /webhook - Recibe mensajes de WhatsApp o pruebas locales
 *
 * Integración con MetaWhatsAppAdapter:
 * - Verifywebhook (GET) → Handshake con Meta
 * - parseIncomingMessage (POST) → Traducir payload de Meta a formato interno
 */
export class ExpressServer {
  private app: Express;
  private logger: pino.Logger;
  private server: any;
  private metaAdapter?: MetaWhatsAppAdapter;

  constructor(logger: pino.Logger, metaAdapter?: MetaWhatsAppAdapter) {
    this.logger = logger;
    this.app = express();
    this.metaAdapter = metaAdapter;
    this.setupMiddleware();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
  }

  /**
   * Inyectar MetaWhatsAppAdapter después de la construcción
   * Útil si se crea ExpressServer antes de tener el adaptador disponible
   */
  setMetaAdapter(adapter: MetaWhatsAppAdapter): void {
    this.metaAdapter = adapter;
    this.logger.info('✅ MetaWhatsAppAdapter inyectado en ExpressServer');
  }

  setupRoutes(
    processMessage: (tenantId: string, phoneNumber: string, text: string) => Promise<string | null>
  ): void {
    // POST /webhook/:tenantId - Recibe mensajes de WhatsApp (Cloud API) para un tenant específico
    this.app.post('/webhook/:tenantId', async (req: Request, res: Response): Promise<void> => {
      try {
        const tenantId = String(req.params.tenantId);

        // Si hay un metadata de Meta, parsear usando MetaWhatsAppAdapter
        if (this.metaAdapter && req.body.entry) {
          const parsed = this.metaAdapter.parseIncomingMessage(req.body);
          if (!parsed) {
            this.logger.debug({ tenantId }, 'ℹ️  Webhook de Meta recibido pero sin mensajes (probablemente delivery receipt)');
            res.json({ success: true, message: 'Webhook recibido' });
            return;
          }

          const { from, content } = parsed;
          const response = await processMessage(tenantId, from, content);

          res.json({
            success: true,
            tenantId,
            response: response || null,
            timestamp: new Date().toISOString(),
          });
          return;
        }

        // Fallback: formato simplificado para pruebas locales
        const { phoneNumber, message } = req.body;

        if (!tenantId || !phoneNumber || !message) {
          res.status(400).json({
            error: 'Missing tenantId (URL param), phoneNumber or message (body)',
          });
          return;
        }

        this.logger.info(
          { tenantId, phoneNumber, message },
          '📨 Mensaje recibido via webhook (formato local)'
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
        // Si hay metadata de Meta, parsear usando MetaWhatsAppAdapter
        if (this.metaAdapter && req.body.entry) {
          const parsed = this.metaAdapter.parseIncomingMessage(req.body);
          if (!parsed) {
            this.logger.debug('ℹ️  Webhook de Meta recibido pero sin mensajes (probablemente delivery receipt)');
            res.json({ success: true, message: 'Webhook recibido' });
            return;
          }

          const { from, content } = parsed;
          // Sin tenantId explícito, retornar error
          res.status(400).json({
            error: 'Webhook de Meta recibido pero sin tenantId. Use POST /webhook/:tenantId',
          });
          return;
        }

        // Fallback: formato simplificado para pruebas locales
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

    // GET /webhook - Verificación de Webhook de Meta (Handshake)
    // Delegado a MetaWhatsAppAdapter.verifyWebhook()
    this.app.get('/webhook', (req: Request, res: Response) => {
      if (this.metaAdapter) {
        this.metaAdapter.verifyWebhook(req, res);
      } else {
        this.logger.warn('⚠️  MetaWhatsAppAdapter no inyectado. Verificación fallará.');
        res.sendStatus(503);
      }
    });

    // GET /webhook/:tenantId - Verificación de Webhook de Meta (multi-tenant)
    // Nota: Meta no envía tenantId en el handshake, así que lo ignoramos
    this.app.get('/webhook/:tenantId', (req: Request, res: Response) => {
      const tenantId = String(req.params.tenantId);
      if (this.metaAdapter) {
        this.logger.debug({ tenantId }, 'ℹ️  Handshake recibido en /webhook/:tenantId (Meta ignora tenantId)');
        this.metaAdapter.verifyWebhook(req, res);
      } else {
        this.logger.warn('⚠️  MetaWhatsAppAdapter no inyectado. Verificación fallará.');
        res.sendStatus(503);
      }
    });
  }

  async start(port?: number): Promise<void> {
    const PORT = port || parseInt(config.whatsapp.webhookPort || '3001', 10);

    return new Promise((resolve) => {
      this.server = this.app.listen(PORT, () => {
        this.logger.info(`🚀 Servidor Express escuchando en puerto ${PORT}`);
        this.logger.info('📍 Webhooks disponibles:');
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

