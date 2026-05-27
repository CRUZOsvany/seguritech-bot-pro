import express, { Express, Request, Response, Router } from 'express';
import pino from 'pino';
import crypto from 'crypto';
import path from 'path';
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
 * Sprint 5.5 — Gate de tenants paused/archived/draft sobre el webhook.
 * Devuelve 'active' si el tenant procesa mensajes (status live/sandbox),
 * 'inactive' si el tenant existe pero está paused/archived/draft, o
 * 'not_found' si no existe (o está soft-deleted).
 */
export type TenantStatusChecker = (
  tenantId: string,
) => Promise<'active' | 'inactive' | 'not_found'>;

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
  private readonly tenantStatusChecker?: TenantStatusChecker;

  constructor(
    logger: pino.Logger,
    metaAdapter?: MetaWhatsAppAdapter,
    messageLogService?: MessageLogService,
    tenantStatusChecker?: TenantStatusChecker,
  ) {
    this.logger = logger;
    this.metaAdapter = metaAdapter;
    this.messageLogService = messageLogService;
    this.tenantStatusChecker = tenantStatusChecker;
    this.app = express();
    this.setupMiddleware();
  }

  /**
   * Sprint 5.5 — gate de tenant inactivo aplicado en ambas rutas webhook.
   * Si el tenant está paused/archived/draft o no existe, responde 200 OK con
   * `{skipped}` para que Meta no reintente, sin invocar processMessage ni
   * tocar messages/message_logs. Devuelve true si la respuesta ya fue enviada.
   */
  private async rejectIfTenantInactive(
    tenantId: string,
    res: Response,
  ): Promise<boolean> {
    if (!this.tenantStatusChecker) return false;
    const status = await this.tenantStatusChecker(tenantId);
    if (status === 'inactive') {
      this.logger.warn(
        { tenantId },
        '🚫 Webhook recibido para tenant inactivo (paused/archived/draft). Mensaje descartado.',
      );
      res.status(200).json({ success: true, skipped: 'tenant_inactive' });
      return true;
    }
    if (status === 'not_found') {
      this.logger.warn(
        { tenantId },
        '🚫 Webhook recibido para tenant inexistente. Mensaje descartado.',
      );
      res.status(200).json({ success: true, skipped: 'tenant_not_found' });
      return true;
    }
    return false;
  }

  private setupMiddleware(): void {
    // Confiar en el primer hop (Cloudflare en prod, ninguno en dev) para
    // obtener IP real del cliente. Necesario para que express-rate-limit
    // no rate-limitee a todo el CIDR de Cloudflare como un solo cliente.
    this.app.set('trust proxy', config.isProduction ? 1 : false);

    // CSP explícita. Permitimos 'unsafe-inline' en script/style porque el
    // panel HTML y el simulator inlinean su JS y CSS por diseño (sin build).
    // El riesgo de XSS está mitigado porque:
    //   - El JS construye DOM con createElement/textContent, no con innerHTML
    //     de datos del backend.
    //   - script-src-attr 'none' BLOQUEA event handlers inline (onclick=,
    //     onerror=, etc.) — los listeners deben registrarse con
    //     addEventListener desde <script>. Esto cierra el vector más común
    //     de XSS reflejado por atributos.
    this.app.use(
      helmet({
        contentSecurityPolicy: {
          useDefaults: true,
          directives: {
            'default-src': ["'self'"],
            'script-src': ["'self'", "'unsafe-inline'"],
            'script-src-attr': ["'none'"],
            'style-src': ["'self'", "'unsafe-inline'"],
            'img-src': ["'self'", 'data:', 'https:'],
            'connect-src': ["'self'"],
            'frame-ancestors': ["'none'"],
            'object-src': ["'none'"],
            'base-uri': ["'self'"],
            'form-action': ["'self'"],
          },
        },
        crossOriginEmbedderPolicy: false, // no usamos SharedArrayBuffer
      }),
    );

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

          // Sprint 5.5 — gate de tenant pausado/archivado/draft.
          if (await this.rejectIfTenantInactive(tenantId, res)) return;

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
        if (await this.rejectIfTenantInactive(tenantId, res)) return;
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

          // Sprint 5.5 — gate de tenant pausado/archivado/draft.
          if (await this.rejectIfTenantInactive(tenantId, res)) return;

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
   * Monta el router de administración interna bajo /api/admin.
   * Llamar después de setupRoutes() en Bootstrap.
   */
  setupAdminRoutes(adminRouter: Router): void {
    this.app.use('/api/admin', adminRouter);
  }

  /**
   * Monta el router de autenticación bajo /api/auth.
   * Debe llamarse ANTES que setupAdminRoutes para que /api/auth/login
   * sea accesible sin la cookie de sesión.
   */
  setupAuthRoutes(authRouter: Router): void {
    this.app.use('/api/auth', authRouter);
  }

  /**
   * Monta el router del módulo POS bajo /api/pos.
   * Llamar después de setupAdminRoutes. Cada ruta del PosRouter define su
   * propio nivel de auth (health público, resto behind requirePosSession).
   *
   * Sprint 5.1a.
   */
  setupPosRoutes(posRouter: Router): void {
    this.app.use('/api/pos', posRouter);
  }

  /**
   * Sirve assets estáticos del panel admin y del simulador WhatsApp.
   *
   * Estructura esperada en disco (poblada por FASE 6 y 7):
   *   backend/public/panel/      — index.html, new.html, tenant.html, etc.
   *   backend/public/simulator/  — index.html (lee tenantId del query string)
   *
   * Path resolution: __dirname al runtime es
   *   - dev (ts-node): backend/src/infrastructure/server
   *   - build:         backend/dist/infrastructure/server
   * 3 niveles arriba aterriza en backend/ en ambos casos.
   *
   * Para conveniencia, /simulator/:tenantId redirige a la SPA con tenantId en el
   * query string. Registrado DESPUÉS del static para que /simulator/index.html
   * y /simulator/*.css se sirvan tal cual.
   */
  setupStaticAssets(): void {
    const publicDir = path.resolve(__dirname, '..', '..', '..', 'public');
    const panelDir = path.join(publicDir, 'panel');
    const simulatorDir = path.join(publicDir, 'simulator');
    const appDir = path.join(publicDir, 'app');

    const noCache = (res: Response): void => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    };

    this.app.use(
      '/panel',
      express.static(panelDir, { index: 'index.html', setHeaders: noCache }),
    );
    this.app.use(
      '/simulator',
      express.static(simulatorDir, { index: false, setHeaders: noCache }),
    );

    // /app — SPA React (build de Vite del workspace frontend/). Sprint 6.
    // Los assets hasheados (index-XXX.js) se cachean; index.html no.
    this.app.use(
      '/app',
      express.static(appDir, { index: 'index.html', setHeaders: noCache }),
    );

    // /simulator/:tenantId  →  /simulator/index.html?tenantId=<uuid>
    this.app.get('/simulator/:tenantId', (req: Request, res: Response, next) => {
      const raw = String(req.params.tenantId ?? '');
      if (raw === 'index.html') {
        return next();
      }
      res.redirect(`/simulator/index.html?tenantId=${encodeURIComponent(raw)}`);
    });

    this.logger.info(
      { publicDir },
      '📂 Assets estáticos montados en /panel, /simulator y /app',
    );
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
    // Dev bindea solo a loopback (auth bypass del panel HTML depende de esto).
    // Prod bindea a 0.0.0.0 — Cloudflare Access debe estar enfrente.
    const HOST = config.isDevelopment ? '127.0.0.1' : '0.0.0.0';
    return new Promise((resolve) => {
      this.server = this.app.listen(PORT, HOST, () => {
        this.logger.info({ host: HOST, port: PORT }, `🚀 Express escuchando en ${HOST}:${PORT}`);
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