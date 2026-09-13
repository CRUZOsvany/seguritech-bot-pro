import pino from 'pino';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BotController } from './controllers/BotController';
import {
  UserRepository,
  NotificationPort,
  TenantConfigPort,
  BotFlowRepository,
  TenantRepository,
  AuditPort,
} from '@/domain/ports';
import type { PosProductRepository } from '@/domain/ports/pos/PosProductRepository';
import { FlowInterpreter } from '@/domain/services/FlowInterpreter';
import { VariableResolver } from '@/domain/services/VariableResolver';
import { DynamicSectionResolver } from '@/domain/services/DynamicSectionResolver';
import { CarouselCardResolver } from '@/domain/services/CarouselCardResolver';
import { ServiceDirectoryMatcher } from '@/domain/services/ServiceDirectoryMatcher';
import { CatalogSearchService } from '@/domain/services/CatalogSearchService';
import { BusinessHoursService } from '@/domain/services/BusinessHoursService';
import { AssignMoldeUseCase } from '@/domain/use-cases/AssignMoldeUseCase';
import { SetTenantStatusUseCase } from '@/domain/use-cases/SetTenantStatusUseCase';
import { SimulateConversationUseCase } from '@/domain/use-cases/SimulateConversationUseCase';
import { InactivitySweeper } from '@/domain/conversation/InactivitySweeper';
import { NotificationPortMessenger } from '@/domain/conversation/NotificationPortMessenger';
import { systemClock } from '@/app/systemRuntime';
import { config } from '@/config/env';
import { CreateTenantUseCase } from '@/domain/use-cases/CreateTenantUseCase';

/**
 * Contenedor de inyección de dependencias.
 *
 * Sprint 3: agrega AssignMoldeUseCase y SetTenantStatusUseCase.
 * Los callers externos (Bootstrap → AdminRouter) acceden a los use cases
 * vía getters tipados.
 */
export class ApplicationContainer {
  private readonly botController: BotController;
  private readonly assignMoldeUseCase: AssignMoldeUseCase;
  private readonly setTenantStatusUseCase: SetTenantStatusUseCase;
  private readonly simulateConversationUseCase: SimulateConversationUseCase;
  private readonly createTenantUseCase: CreateTenantUseCase;
  private readonly inactivitySweeper: InactivitySweeper;

  constructor(
    userRepository: UserRepository,
    notificationPort: NotificationPort,
    tenantConfigPort: TenantConfigPort,
    botFlowRepository: BotFlowRepository,
    tenantRepository: TenantRepository,
    supabase: SupabaseClient,
    auditPort: AuditPort,
    posProductRepository: PosProductRepository,
    logger: pino.Logger,
  ) {
    const variableResolver = new VariableResolver(supabase, posProductRepository, logger);
    const dynamicSectionResolver = new DynamicSectionResolver(logger);
    const carouselCardResolver = new CarouselCardResolver(logger);
    const serviceDirectoryMatcher = new ServiceDirectoryMatcher();
    const catalogSearchService = new CatalogSearchService(posProductRepository);
    const businessHoursService = new BusinessHoursService();
    const flowInterpreter = new FlowInterpreter(
      variableResolver,
      dynamicSectionResolver,
      carouselCardResolver,
      serviceDirectoryMatcher,
      catalogSearchService,
      logger,
    );

    this.botController = new BotController(
      userRepository,
      notificationPort,
      tenantConfigPort,
      botFlowRepository,
      flowInterpreter,
      auditPort,
      businessHoursService,
      logger,
    );

    this.assignMoldeUseCase = new AssignMoldeUseCase(
      botFlowRepository,
      tenantConfigPort,
      logger,
    );

    this.setTenantStatusUseCase = new SetTenantStatusUseCase(
      tenantRepository,
      logger,
    );

    // Simulador del Studio: el MISMO FlowInterpreter que atiende a los
    // clientes, con sesiones, reloj y envío falsos.
    this.simulateConversationUseCase = new SimulateConversationUseCase(
      tenantConfigPort,
      flowInterpreter,
      businessHoursService,
      config.bot.handoffPauseMinutes * 60 * 1000,
      logger,
    );

    this.createTenantUseCase = new CreateTenantUseCase(tenantRepository, logger);

    // Inactividad (Fase 5): el mismo barrido que corre el simulador, con los
    // adaptadores de producción. Lo dispara InactivityScheduler cada minuto.
    this.inactivitySweeper = new InactivitySweeper({
      sessions: userRepository,
      messenger: new NotificationPortMessenger(notificationPort),
      tenantConfig: tenantConfigPort,
      flows: { findActive: (tenantId) => botFlowRepository.findActiveByTenant(tenantId) },
      businessHours: businessHoursService,
      clock: systemClock,
      logger,
    });
  }

  getBotController(): BotController {
    return this.botController;
  }

  getAssignMoldeUseCase(): AssignMoldeUseCase {
    return this.assignMoldeUseCase;
  }

  getSetTenantStatusUseCase(): SetTenantStatusUseCase {
    return this.setTenantStatusUseCase;
  }

  getSimulateConversationUseCase(): SimulateConversationUseCase {
    return this.simulateConversationUseCase;
  }

  getCreateTenantUseCase(): CreateTenantUseCase {
    return this.createTenantUseCase;
  }

  getInactivitySweeper(): InactivitySweeper {
    return this.inactivitySweeper;
  }
}
