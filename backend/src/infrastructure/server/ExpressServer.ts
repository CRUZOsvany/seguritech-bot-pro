import express, { Express, Request, Response } from 'express';
import pino from 'pino';
import crypto from 'crypto';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from '@/config/env';
import { MetaWhatsAppAdapter } from '@/infrastructure/adapters/MetaWhatsAppAdapter';
import { tenantLookupService } from '@/infrastructure/services/TenantLookupService';
import { MessageLogService } from '@/infrastructure/services/MessageLogService';

type ProcessMessage = (
  tenantId: string,
  phoneNumber: string,
  text: string,
  metaMessageId?: string,
) => Promise<string | null>;

/**
 * Verificar firma HMAC-SHA256 de Meta sobre el rawBody del webhook.
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
  const expected = `sha256=${hash}`;

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Servidor Express con webhook para WhatsApp Cloud API.
 * Sprint 2: integra MessageLogService para idempotencia + log estructurado.
 */
export class ExpressServer {
  private readonly app: Express;
  private readonly logger: pino.Logger;
  private server: any;
  private readonly metaAdapter?: MetaWhatsAppAdapter;
  private readonly messageLogService?: MessageLogService;

  constructor(
    logger: pino.Logger,
    metaAdapter?: MetaWhatsAppAdapter,
    messageLogService?: MessageLogService,
  ) {
    this.logger = logger;
    this.metaAdapter = metaAdapter;
    this.messageLogService = messageLogService;
    this.app = express();
    this.setupMiddleware();
  }

  private setupMiddleware(): void {
    this.app.use(helmet());

    const allowedOrigins = config.cors.allowedOrigins.split(',').map((o) => o.trim());
    this.app.use(
      cors({
        origin: allowedOrigins,
        credentials: true,
        optionsSuccessStatus: 200,
      }),
    );

    this.app.use(
      rateLimit({
        windowMs: 60 * 1000,
        max: 100,
        message: 'Demasiadas solicitudes, intenta más tarde',
        standardHeaders: true,
        legacyHeaders: false,
      }),
    );

    this.app.use(
      rateLimit({
        windowMs: 60 * 1000,
        max: 1000,
        skip: (req) => !req.path.startsWith('/webhook'),
      }),
    );

    // Capturar rawBody ANTES de parsear JSON (para HMAC).
    this.app.use(
      express.raw({ type: 'application/json', limit: '64kb' }),
      (req: Request, _res: Response, next) => {
        (req as any).rawBody = req.body;
        if (req.body && req.body.length > 0) {
          try {
            (req as any).body = JSON.parse(req.body.toString());
          } catch {
            // body no es JSON válido — se deja como Buffer
          }
        }
        next();
      },
    );

    this.app.use(express.json({ limit: '64kb' }));
    this.app.use(express.urlencoded({ extended: true }));

    this.app.use((req: Request, res: Response, next) => {
      req.setTimeout(15000, () => {
        res.status(504).json({ error: 'Gateway timeout' });
      });
      next();
    });
  }

  setupRoutes(processMessage: ProcessMessage): void {
    // POST /webhook/:tenantId — webhook con tenant explícito en el path
    this.app.post('/webhook/:tenantId', async (req: Request, res: Response) => {
      try {
        const tenantId = String(req.params.tenantId);

        // Caso A: payload de Meta
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
            await this.handleParsed(tenantId, parsed, processMessage, res);
            return;
          }
        }

        // Caso B: payload simple (curl, tests)
        const { phoneNumber, message } = req.body;
        if (!tenantId || !phoneNumber || !message) {
          res.status(400).json({ error: 'Missing parameters' });
          return;
        }
        const response = await processMessage(tenantId, phoneNumber, message);
        res.json({ success: true, tenantId, response, timestamp: new Date().toISOString() });
      } catch (error) {
        this.logger.error({ err: error }, '❌ Error en webhook /webhook/:tenantId');
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // POST /webhook — webhook sin tenant en path (Meta apunta aquí cuando hay un solo número)
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

          // Resolver tenantId por número de negocio
          const tenantId = await tenantLookupService.lookupTenantByPhone(parsed.businessNumber);
          if (!tenantId) {
            this.logger.warn(
              { businessNumber: parsed.businessNumber },
              'No se encontró tenant para este número de negocio',
            );
            res.json({ success: true });
            return;
          }

          await this.handleParsed(tenantId, parsed, processMessage, res);
          return;
        }

        // Payload simple
        const { tenantId, phoneNumber, message } = req.body;
        if (!tenantId || !phoneNumber || !message) {
          res.status(400).json({ error: 'Missing parameters' });
          return;
        }
        const response = await processMessage(tenantId, phoneNumber, message);
        res.json({ success: true, tenantId, response, timestamp: new Date().toISOString() });
      } catch (error) {
        this.logger.error({ err: error }, '❌ Error en webhook /webhook');
        res.json({ success: false });
      }
    });

    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    this.app.get('/webhook', (req: Request, res: Response) => {
      this.metaAdapter?.verifyWebhook(req, res) ?? res.sendStatus(503);
    });

    this.app.get('/webhook/:tenantId', (req: Request, res: Response) => {
      this.metaAdapter?.verifyWebhook(req, res) ?? res.sendStatus(503);
    });
  }

  /**
   * Procesa un mensaje parseado: idempotencia, log inbound, ejecutar, log outbound.
   */
  private async handleParsed(
    tenantId: string,
    parsed: { from: string; content: string; messageId?: string },
    processMessage: ProcessMessage,
    res: Response,
  ): Promise<void> {
    // Idempotencia: ¿ya procesamos este meta_message_id?
    if (this.messageLogService) {
      const isDup = await this.messageLogService.isProcessed(parsed.messageId);
      if (isDup) {
        this.logger.info(
          { tenantId, messageId: parsed.messageId },
          '🔁 Webhook duplicado, ignorando',
        );
        res.json({ success: true, duplicate: true });
        return;
      }
    }

    // Log inbound
    if (this.messageLogService) {
      await this.messageLogService.logInbound({
        tenantId,
        fromPhone: parsed.from,
        content: parsed.content,
        metaMessageId: parsed.messageId,
      });
    }

    const response = await processMessage(
      tenantId,
      parsed.from,
      parsed.content,
      parsed.messageId,
    );

    // Log outbound
    if (this.messageLogService && response) {
      await this.messageLogService.logOutbound({
        tenantId,
        toPhone: parsed.from,
        content: response,
      });
    }

    res.json({
      success: true,
      tenantId,
      response,
      timestamp: new Date().toISOString(),
    });
  }

  async start(port?: number): Promise<void> {
    const PORT = port ?? parseInt(config.webhook.port || '3001', 10);
    return new Promise((resolve) => {
      this.server = this.app.listen(PORT, () => {
        this.logger.info(`🚀 Express escuchando en puerto ${PORT}`);
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