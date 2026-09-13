import { Router } from 'express';
import type pino from 'pino';
import type { AssignMoldeUseCase } from '@/domain/use-cases/AssignMoldeUseCase';
import type { SetTenantStatusUseCase } from '@/domain/use-cases/SetTenantStatusUseCase';
import { HardDeleteTenantUseCase } from '@/domain/use-cases/HardDeleteTenantUseCase';
import type { SimulateConversationUseCase } from '@/domain/use-cases/SimulateConversationUseCase';
import type { CreateTenantUseCase } from '@/domain/use-cases/CreateTenantUseCase';
import type { TenantRepository } from '@/domain/ports/TenantRepository';
import type { TenantServiceRepository } from '@/domain/ports/TenantServiceRepository';
import type { BotFlowRepository } from '@/domain/ports/BotFlowRepository';
import type { MetaCredentialsRepository } from '@/domain/ports';
import type { MessagesRepository, UserRepository } from '@/domain/ports';
import type { WhatsAppFlowRepository } from '@/domain/ports/WhatsAppFlowRepository';
import type { PosProductRepository } from '@/domain/ports/pos/PosProductRepository';
import type { PosCategoryRepository } from '@/domain/ports/pos/PosCategoryRepository';
import type { ImportPosProductsUseCase } from '@/domain/use-cases/ImportPosProductsUseCase';
import type { ServiceDirectoryRepository } from '@/domain/ports';
import type { TenantConfigPort } from '@/domain/ports';
import type { AuditLogService } from '@/infrastructure/services/AuditLogService';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Mw } from './admin/helpers';
import { createTenantsRouter } from './admin/tenantsRouter';
import { createServicesRouter } from './admin/servicesRouter';
import { createMetaRouter } from './admin/metaRouter';
import { createFlowsRouter } from './admin/flowsRouter';
import { createBlocksRouter } from './admin/blocksRouter';
import { createWhatsappFlowsRouter } from './admin/whatsappFlowsRouter';
import { createPosCatalogRouter } from './admin/posCatalogRouter';
import { createServiceDirectoryRouter } from './admin/serviceDirectoryRouter';
import { createStudioRouter } from './admin/studioRouter';
import type { FlowTestCaseRepository } from '@/domain/ports/FlowTestCaseRepository';
import { PublishFlowUseCase } from '@/domain/use-cases/PublishFlowUseCase';
import { StudioFlowTestRunner } from '@/infrastructure/studio/StudioFlowTestRunner';

/**
 * Router de API admin interna del panel SegurITech.
 *
 * Orquestador delgado: aplica `requireAdmin` una vez y monta los sub-routers
 * por dominio (tenants, services, meta, flows). Cada sub-router define sus rutas
 * completas (`/tenants/:id/...`) y se monta en el mismo base, por lo que el árbol
 * de rutas resultante es idéntico al del router monolítico previo (F0-2).
 *
 * Auth: delegada a `requireAdmin` inyectado por Bootstrap (createAuthMiddleware).
 * Soporta tres caminos: cookie JWT (panel HTML), Cloudflare Access (prod), x-api-key (CLI).
 * El antiguo bypass loopback (dev + 127.0.0.1) fue REMOVIDO en Operación Búnker v2.
 *
 * Mutaciones se loguean en admin_audit_log (append-only) desde cada sub-router.
 */
export function createAdminRouter(params: {
  requireAdmin: Mw;
  assignMoldeUseCase: AssignMoldeUseCase;
  setTenantStatusUseCase: SetTenantStatusUseCase;
  /** Simulador del Studio (Fase 1): el motor real con adaptadores falsos. */
  simulateConversationUseCase: SimulateConversationUseCase;
  createTenantUseCase: CreateTenantUseCase;
  tenantRepository: TenantRepository;
  tenantServiceRepository: TenantServiceRepository;
  botFlowRepository: BotFlowRepository;
  messagesRepository: MessagesRepository;
  userRepository: UserRepository;
  /** Opcional: solo presente cuando META_TOKEN_ENCRYPTION_KEY está configurada. */
  metaCredentialsRepository?: MetaCredentialsRepository;
  whatsappFlowRepository: WhatsAppFlowRepository;
  posProductRepository: PosProductRepository;
  posCategoryRepository: PosCategoryRepository;
  importPosProductsUseCase: ImportPosProductsUseCase;
  serviceDirectoryRepository: ServiceDirectoryRepository;
  /** Casos de prueba del Studio (flow_test_cases, migración 023). */
  flowTestCaseRepository: FlowTestCaseRepository;
  /**
   * D-01 (auditoría 2026-08-26): opcional para no romper wiring/tests
   * existentes, pero SIEMPRE presente en Bootstrap real. Cuando está, se
   * invalida la caché in-process de TenantConfig (node-cache, TTL 5 min en
   * SupabaseTenantConfigService) tras cada PATCH del tenant y cada mutación
   * del directorio de servicios — sin esto, el panel "guardaba" cambios
   * que el bot seguía sin ver hasta que expirara el TTL.
   */
  tenantConfigPort?: TenantConfigPort;
  audit: AuditLogService;
  supabase: SupabaseClient;
  logger: pino.Logger;
}): Router {
  const {
    requireAdmin,
    assignMoldeUseCase,
    setTenantStatusUseCase,
    simulateConversationUseCase,
    createTenantUseCase,
    tenantRepository,
    tenantServiceRepository,
    botFlowRepository,
    messagesRepository,
    userRepository,
    metaCredentialsRepository,
    whatsappFlowRepository,
    posProductRepository,
    posCategoryRepository,
    importPosProductsUseCase,
    serviceDirectoryRepository,
    flowTestCaseRepository,
    tenantConfigPort,
    audit,
    supabase,
    logger,
  } = params;

  // Publicar pasa por la compuerta del Studio (Fase 4): validador + pruebas
  // guardadas corridas con el motor real + publicación atómica.
  const publishFlow = new PublishFlowUseCase(
    botFlowRepository,
    flowTestCaseRepository,
    new StudioFlowTestRunner(simulateConversationUseCase, logger),
    logger,
  );
  // Borrado permanente: las dos guardas (nombre exacto, status) viven aquí.
  const hardDeleteTenantUseCase = new HardDeleteTenantUseCase(tenantRepository, logger);

  const router = Router();

  // Auth admin una sola vez para todo el árbol /api/admin/*.
  router.use(requireAdmin);

  // Sub-routers por dominio. Las rutas son disjuntas (no hay shadowing entre
  // `/tenants/:id` y `/tenants/:id/{services,flows,meta-credentials}`), así que
  // el orden de montaje no altera el matching.
  router.use(
    createFlowsRouter({ botFlowRepository, publishFlow, audit, logger }),
  );
  // Bloques compuestos (F1-a): expandir y ensamblar. No persiste nada — el
  // Designer carga el resultado en el canvas y guarda por la ruta de siempre.
  router.use(
    createBlocksRouter({ logger }),
  );
  // Studio: simulación con el motor real, validación, límites y asistente.
  router.use(
    createStudioRouter({
      botFlowRepository,
      simulateConversation: simulateConversationUseCase,
      testCases: flowTestCaseRepository,
      audit,
      logger,
    }),
  );
  router.use(
    createServicesRouter({ tenantServiceRepository, audit, logger }),
  );
  router.use(
    createMetaRouter({ metaCredentialsRepository, audit, logger }),
  );
  router.use(
    createWhatsappFlowsRouter({ whatsappFlowRepository, audit, logger }),
  );
  router.use(
    createPosCatalogRouter({
      posProductRepository,
      posCategoryRepository,
      importPosProductsUseCase,
      audit,
      logger,
    }),
  );
  router.use(
    createServiceDirectoryRouter({ serviceDirectoryRepository, tenantConfigPort, audit, logger }),
  );
  router.use(
    createTenantsRouter({
      assignMoldeUseCase,
      setTenantStatusUseCase,
      createTenantUseCase,
      hardDeleteTenantUseCase,
      tenantRepository,
      tenantServiceRepository,
      botFlowRepository,
      messagesRepository,
      userRepository,
      tenantConfigPort,
      audit,
      supabase,
      logger,
    }),
  );

  return router;
}
