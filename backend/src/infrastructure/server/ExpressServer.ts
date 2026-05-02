import express, { Express, Request, Response } from 'express';
import pino from 'pino';
import crypto from 'crypto';
import { config } from '@/config/env';
import { MetaWhatsAppAdapter } from '@/infrastructure/adapters/MetaWhatsAppAdapter';
import { tenantLookupService } from '@/infrastructure/services/TenantLookupService';

/**
 * Verificar firma HMAC-SHA256 de Meta
 */
function verifyMetaSignature(req: Request): boolean {
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  const appSecret = config.meta.appSecret;

  if (!appSecret || !signature || !signature.startsWith('sha256=')) {
    return !appSecret;
  }

  const rawBody = (req as any).rawBody as string | undefined;
  if (!rawBody) return false;

  const hash = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const expectedSignature = `sha256=${hash}`;

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  } catch (_err) {
    return false;
  }
}

/**
 * Servidor Express con webhook para WhatsApp Cloud API
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
    this.app.use(express.raw({ type: 'application/json', limit: '64kb' }), (req: Request, res: Response, next) => {
      (req as any).rawBody = req.body;
      if (req.body && req.body.length > 0) {
        try {
          (req as any).body = JSON.parse(req.body.toString());
        } catch (_err) {
          // Body no es JSON válido
        }
      }
      next();
    });

    this.app.use(express.json({ limit: '64kb' }));
    this.app.use(express.urlencoded({ extended: true }));
  }

  setMetaAdapter(adapter: MetaWhatsAppAdapter): void {
    this.metaAdapter = adapter;
    this.logger.info('✅ MetaWhatsAppAdapter inyectado');
  }

  setupRoutes(processMessage: (tenantId: string, phoneNumber: string, text: string) => Promise<string | null>): void {
    this.app.post('/webhook/:tenantId', async (req: Request, res: Response) => {
      try {
        const tenantId = String(req.params.tenantId);

        if (req.body && req.body.entry) {
          if (!verifyMetaSignature(req)) {
            this.logger.warn({ tenantId }, '🔐 Firma HMAC inválida');
            if (config.isProduction) {
              res.status(401).json({ error: 'Invalid signature' });
              return;
            }
          }

          if (this.metaAdapter) {
            const parsed = this.metaAdapter.parseIncomingMessage(req.body);
            if (!parsed) {
              res.json({ success: true });
              return;
            }
            const { from, content } = parsed;
            const response = await processMessage(tenantId, from, content);
            res.json({ success: true, tenantId, response, timestamp: new Date().toISOString() });
            return;
          }
        }

        const { phoneNumber, message } = req.body;
        if (!tenantId || !phoneNumber || !message) {
          res.status(400).json({ error: 'Missing parameters' });
          return;
        }

        const response = await processMessage(tenantId, phoneNumber, message);
        res.json({ success: true, tenantId, response, timestamp: new Date().toISOString() });
      } catch (error) {
        this.logger.error({ error }, '❌ Error en webhook');
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    this.app.post('/webhook', async (req: Request, res: Response) => {
      try {
        if (req.body && req.body.entry && this.metaAdapter) {
          if (!verifyMetaSignature(req)) {
            this.logger.warn('🔐 Firma HMAC inválida');
            if (config.isProduction) {
              res.json({ success: false });
              return;
            }
          }

          const parsed = this.metaAdapter.parseIncomingMessage(req.body);
          if (!parsed) {
            res.json({ success: true });
            return;
          }

          const { from, content } = parsed;
          const tenantId = await tenantLookupService.lookupTenantByPhone(from);
          if (!tenantId) {
            res.json({ success: true });
            return;
          }

          const response = await processMessage(tenantId, from, content);
          res.json({ success: true, tenantId, response, timestamp: new Date().toISOString() });
          return;
        }

        const { tenantId, phoneNumber, message } = req.body;
        if (!tenantId || !phoneNumber || !message) {
          res.status(400).json({ error: 'Missing parameters' });
          return;
        }

        const response = await processMessage(tenantId, phoneNumber, message);
        res.json({ success: true, tenantId, response, timestamp: new Date().toISOString() });
      } catch (error) {
        this.logger.error({ error }, '❌ Error');
        res.json({ success: false });
      }
    });

    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    this.app.get('/webhook', (req: Request, res: Response) => {
      this.metaAdapter?.verifyWebhook(req, res) || res.sendStatus(503);
    });

    this.app.get('/webhook/:tenantId', (req: Request, res: Response) => {
      this.metaAdapter?.verifyWebhook(req, res) || res.sendStatus(503);
    });
  }

  async start(port?: number): Promise<void> {
    const PORT = port || parseInt(config.webhook.port || '3001', 10);
    return new Promise((resolve) => {
      this.server = this.app.listen(PORT, () => {
        this.logger.info(`🚀 Express escuchando puerto ${PORT}`);
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

