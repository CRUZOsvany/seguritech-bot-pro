import { Router } from 'express';
import type pino from 'pino';
import type { AssignMoldeUseCase } from '@/domain/use-cases/AssignMoldeUseCase';
import type { SetTenantStatusUseCase } from '@/domain/use-cases/SetTenantStatusUseCase';
import type { SimulateMessageUseCase } from '@/domain/use-cases/SimulateMessageUseCase';
import type { CreateTenantUseCase } from '@/domain/use-cases/CreateTenantUseCase';
import type { TenantRepository } from '@/domain/ports/TenantRepository';
import type { TenantServiceRepository } from '@/domain/ports/TenantServiceRepository';
import type { BotFlowRepository } from '@/domain/ports/BotFlowRepository';
import type { MetaCredentialsRepository } from '@/domain/ports';
import type { MessagesRepository } from '@/domain/ports';
import type { AuditLogService } from '@/infrastructure/services/AuditLogService';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Mw } from './admin/helpers';
import { createTenantsRouter } from './admin/tenantsRouter';
import { createServicesRouter } from './admin/servicesRouter';
import { createMetaRouter } from './admin/metaRouter';
import { createFlowsRouter } from './admin/flowsRouter';

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
  simulateMessageUseCase: SimulateMessageUseCase;
  createTenantUseCase: CreateTenantUseCase;
  tenantRepository: TenantRepository;
  tenantServiceRepository: TenantServiceRepository;
  botFlowRepository: BotFlowRepository;
  messagesRepository: MessagesRepository;
  /** Opcional: solo presente cuando META_TOKEN_ENCRYPTION_KEY está configurada. */
  metaCredentialsRepository?: MetaCredentialsRepository;
  audit: AuditLogService;
  supabase: SupabaseClient;
  logger: pino.Logger;
}): Router {
  const {
    requireAdmin,
    assignMoldeUseCase,
    setTenantStatusUseCase,
    simulateMessageUseCase,
    createTenantUseCase,
    tenantRepository,
    tenantServiceRepository,
    botFlowRepository,
    messagesRepository,
    metaCredentialsRepository,
    audit,
    supabase,
    logger,
  } = params;

  const router = Router();

  // Auth admin una sola vez para todo el árbol /api/admin/*.
  router.use(requireAdmin);

  // Sub-routers por dominio. Las rutas son disjuntas (no hay shadowing entre
  // `/tenants/:id` y `/tenants/:id/{services,flows,meta-credentials}`), así que
  // el orden de montaje no altera el matching.
  router.use(
    createFlowsRouter({ botFlowRepository, audit, logger }),
  );
  router.use(
    createServicesRouter({ tenantServiceRepository, audit, logger }),
  );
  router.use(
    createMetaRouter({ metaCredentialsRepository, audit, logger }),
  );
  router.use(
    createTenantsRouter({
      assignMoldeUseCase,
      setTenantStatusUseCase,
      simulateMessageUseCase,
      createTenantUseCase,
      tenantRepository,
      tenantServiceRepository,
      botFlowRepository,
      messagesRepository,
      audit,
      supabase,
      logger,
    }),
  );

  return router;
}
