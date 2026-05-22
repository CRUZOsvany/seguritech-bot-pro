import crypto from 'crypto';
import pino from 'pino';
import { config, validateConfig } from '@/config/env';
import { createLogger } from '@/config/logger';
import { ApplicationContainer } from '@/app/ApplicationContainer';
import { SupabaseUserRepository } from '@/infrastructure/repositories/SupabaseUserRepository';
import { SupabaseBotFlowRepository } from '@/infrastructure/repositories/SupabaseBotFlowRepository';
import { SupabaseTenantRepository } from '@/infrastructure/repositories/SupabaseTenantRepository';
import { SupabaseMetaCredentialsRepository } from '@/infrastructure/repositories/SupabaseMetaCredentialsRepository';
import { SupabaseMessagesRepository } from '@/infrastructure/repositories/SupabaseMessagesRepository';
import { SupabaseAdminUsersRepository } from '@/infrastructure/repositories/SupabaseAdminUsersRepository';
import { SupabaseAdminSessionsRepository } from '@/infrastructure/repositories/SupabaseAdminSessionsRepository';
import { SupabaseLoginAttemptsRepository } from '@/infrastructure/repositories/SupabaseLoginAttemptsRepository';
import { createAdminRouter } from '@/infrastructure/server/AdminRouter';
import { createAuthRouter } from '@/infrastructure/server/AuthRouter';
import { createPosRouter } from '@/infrastructure/server/PosRouter';
import { SupabasePosProductRepository } from '@/infrastructure/repositories/pos/SupabasePosProductRepository';
import { SupabasePosCategoryRepository } from '@/infrastructure/repositories/pos/SupabasePosCategoryRepository';
import { SupabasePosTenantConfigRepository } from '@/infrastructure/repositories/pos/SupabasePosTenantConfigRepository';
import { SupabasePosUserRepository } from '@/infrastructure/repositories/pos/SupabasePosUserRepository';
import { PosAuthService } from '@/application/pos/PosAuthService';
import { createPosAuthMiddleware } from '@/infrastructure/auth/PosAuthMiddleware';
import { createRequireModule } from '@/infrastructure/auth/ModuleGuard';
import { ConsoleNotificationAdapter } from '@/infrastructure/adapters/ConsoleNotificationAdapter';
import { MetaWhatsAppAdapter } from '@/infrastructure/adapters/MetaWhatsAppAdapter';
import { ReadlineAdapter } from '@/infrastructure/adapters/ReadlineAdapter';
import { ExpressServer } from '@/infrastructure/server/ExpressServer';
import { getSupabaseClient } from '@/infrastructure/services/SupabaseClientFactory';
import { SupabaseTenantConfigService } from '@/infrastructure/services/SupabaseTenantConfigService';
import { MessageLogService } from '@/infrastructure/services/MessageLogService';
import { TokenCrypto } from '@/infrastructure/services/TokenCrypto';
import { AuditLogService } from '@/infrastructure/services/AuditLogService';
import { JwtService } from '@/infrastructure/auth/JwtService';
import { createAuthMiddleware } from '@/infrastructure/auth/AuthMiddleware';
import { NotificationPort } from '@/domain/ports';

/**
 * Bootstrap — Operación Búnker v2 (Sprint F).
 *
 * Cambios clave:
 *   - Wire de AuthRouter + AuthMiddleware con cookie JWT HTTPOnly.
 *   - Bypass loopback REMOVIDO. Dev ahora también requiere login real.
 *   - AuditLogService inyectado en AuthRouter y AdminRouter.
 *   - En dev, si ADMIN_JWT_SECRET está vacío, se genera uno efímero por proceso
 *     (las sesiones no sobreviven a restarts). En prod, validateConfig() exige
 *     la variable; nunca generamos uno random en prod.
 */
export class Bootstrap {
  private logger!: pino.Logger;
  private container: ApplicationContainer | null = null;
  private expressServer: ExpressServer | null = null;
  private readlineAdapter: ReadlineAdapter | null = null;

  async run(): Promise<void> {
    try {
      validateConfig();
      this.logger = createLogger();
      this.logger.info('🚀 SegurITech Bot Pro');
      this.logger.info(`Entorno: ${config.environment}\n`);

      const supabase = getSupabaseClient();
      const userRepository = new SupabaseUserRepository(supabase, this.logger);
      const tenantConfigService = new SupabaseTenantConfigService(supabase, this.logger);
      const messageLogService = new MessageLogService(supabase, this.logger);
      const botFlowRepository = new SupabaseBotFlowRepository(supabase, this.logger);
      const tenantRepository = new SupabaseTenantRepository(supabase, this.logger);
      const messagesRepository = new SupabaseMessagesRepository(supabase, this.logger);

      // === Notification port: Meta (si hay clave de cifrado) o Console ===
      let notificationPort: NotificationPort;
      let metaAdapter: MetaWhatsAppAdapter | undefined;
      let metaCredentialsRepository: SupabaseMetaCredentialsRepository | undefined;
      let tokenCrypto: TokenCrypto | null = null;

      if (config.meta.tokenEncryptionKey) {
        tokenCrypto = new TokenCrypto(config.meta.tokenEncryptionKey);
        metaCredentialsRepository = new SupabaseMetaCredentialsRepository(
          supabase,
          tokenCrypto,
          this.logger,
        );
        metaAdapter = new MetaWhatsAppAdapter(
          this.logger,
          metaCredentialsRepository,
          config.meta.apiUrl,
        );
        notificationPort = metaAdapter;
        this.logger.info('✅ MetaWhatsAppAdapter activo (multi-tenant)');
      } else {
        this.logger.warn(
          '⚠️  META_TOKEN_ENCRYPTION_KEY no configurada. ' +
            'Usando ConsoleNotificationAdapter (dev mode).',
        );
        notificationPort = new ConsoleNotificationAdapter();
      }

      this.container = new ApplicationContainer(
        userRepository,
        notificationPort,
        tenantConfigService,
        botFlowRepository,
        tenantRepository,
        supabase,
        this.logger,
      );
      this.logger.info('✅ Contenedor DI listo');

      // === Sesiones admin (Operación Búnker v2) ===
      const jwtSecret = this.resolveJwtSecret();
      const jwtService = new JwtService(jwtSecret, config.admin.jwtTtlSeconds);
      const adminUsersRepository = new SupabaseAdminUsersRepository(
        supabase,
        tokenCrypto,
        this.logger,
      );
      const adminSessionsRepository = new SupabaseAdminSessionsRepository(supabase, this.logger);
      const loginAttemptsRepository = new SupabaseLoginAttemptsRepository(supabase, this.logger);
      const auditLog = new AuditLogService(supabase, this.logger);

      const requireAdmin = createAuthMiddleware({
        jwt: jwtService,
        sessions: adminSessionsRepository,
        cookieName: config.admin.cookieName,
        apiKey: config.admin.apiKey,
        cloudflareAllowedDomain: config.admin.cloudflareAllowedDomain,
        logger: this.logger,
      });

      // === POS (Sprint 5.1a) — fuera del ApplicationContainer ===
      const posProductRepository = new SupabasePosProductRepository(supabase, this.logger);
      const posCategoryRepository = new SupabasePosCategoryRepository(supabase, this.logger);
      const posTenantConfigRepository = new SupabasePosTenantConfigRepository(
        supabase,
        this.logger,
      );
      const posUserRepository = new SupabasePosUserRepository(supabase, this.logger);

      const posAuthService = new PosAuthService(
        posUserRepository,
        tenantRepository,
        jwtService,
        auditLog,
        config.admin.loginMaxAttempts,
        config.admin.loginLockoutMinutes,
        this.logger,
      );

      const requirePosSession = createPosAuthMiddleware({
        jwt: jwtService,
        sessions: adminSessionsRepository,
        posCookieName: config.admin.posCookieName,
        logger: this.logger,
      });
      const requirePosModule = createRequireModule(tenantRepository, 'pos', this.logger);

      this.expressServer = new ExpressServer(this.logger, metaAdapter, messageLogService);
      const botController = this.container.getBotController();
      this.expressServer.setupRoutes(
        async (tenantId, phoneNumber, text, metaMessageId) =>
          botController.processMessage(tenantId, phoneNumber, text, metaMessageId),
      );

      const authRouter = createAuthRouter({
        jwt: jwtService,
        adminUsers: adminUsersRepository,
        sessions: adminSessionsRepository,
        attempts: loginAttemptsRepository,
        audit: auditLog,
        requireAdmin,
        posAuthService,
        requirePosSession,
        posCookieName: config.admin.posCookieName,
        logger: this.logger,
      });
      this.expressServer.setupAuthRoutes(authRouter);
      this.logger.info('✅ API Auth montada en /api/auth');

      const adminRouter = createAdminRouter({
        requireAdmin,
        assignMoldeUseCase: this.container.getAssignMoldeUseCase(),
        setTenantStatusUseCase: this.container.getSetTenantStatusUseCase(),
        simulateMessageUseCase: this.container.getSimulateMessageUseCase(),
        createTenantUseCase: this.container.getCreateTenantUseCase(),
        tenantRepository,
        botFlowRepository,
        messagesRepository,
        metaCredentialsRepository,
        audit: auditLog,
        supabase,
        logger: this.logger,
      });
      this.expressServer.setupAdminRoutes(adminRouter);
      this.logger.info('✅ API Admin montada en /api/admin');

      const posRouter = createPosRouter({
        requirePosSession,
        requireModule: requirePosModule,
        posProducts: posProductRepository,
        posCategories: posCategoryRepository,
        posConfig: posTenantConfigRepository,
        logger: this.logger,
      });
      this.expressServer.setupPosRoutes(posRouter);
      this.logger.info('✅ API POS montada en /api/pos (Sprint 5.1a)');

      this.expressServer.setupStaticAssets();

      await this.expressServer.start();

      // CLI multi-tenant SOLO en desarrollo. En prod no hay stdin real.
      if (config.isDevelopment) {
        this.readlineAdapter = new ReadlineAdapter(this.logger);
        this.logger.info('✅ Bot iniciado (modo dev con CLI interactivo)\n');
        await this.readlineAdapter.start(async (tenantId, phoneNumber, text) =>
          botController.processMessage(tenantId, phoneNumber, text),
        );
      } else {
        this.logger.info('✅ Bot iniciado (modo producción, sin CLI)\n');
        // En prod el proceso se mantiene vivo por el servidor Express,
        // no por readline. PM2 lo respawnea si muere.
      }
    } catch (error) {
      if (this.logger) {
        this.logger.error({ err: error }, '❌ Error en bootstrap');
      } else {
        console.error('❌ Error en bootstrap:', error);
      }
      process.exit(1);
    }
  }

  /**
   * Devuelve el secreto JWT. En prod debe venir de ADMIN_JWT_SECRET (validado
   * por validateConfig()). En dev, si no existe, generamos uno efímero por
   * proceso para no romper el flow de login (las cookies se invalidan en cada
   * restart, lo cual es aceptable en dev).
   */
  private resolveJwtSecret(): string {
    if (config.admin.jwtSecret && config.admin.jwtSecret.length >= 64) {
      return config.admin.jwtSecret;
    }
    if (config.isProduction) {
      throw new Error('ADMIN_JWT_SECRET inválido en producción');
    }
    const ephemeral = crypto.randomBytes(64).toString('hex');
    this.logger.warn(
      '⚠️  ADMIN_JWT_SECRET no configurado. Generado un secret efímero para este proceso. ' +
        'Las sesiones se invalidarán en cada restart.',
    );
    return ephemeral;
  }

  getContainer(): ApplicationContainer {
    if (!this.container) {
      throw new Error('Container no inicializado');
    }
    return this.container;
  }
}
