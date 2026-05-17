import pino from 'pino';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BotController } from './controllers/BotController';
import {
  UserRepository,
  NotificationPort,
  TenantConfigPort,
  BotFlowRepository,
  TenantRepository,
} from '@/domain/ports';
import { FlowInterpreter } from '@/domain/services/FlowInterpreter';
import { VariableResolver } from '@/domain/services/VariableResolver';
import { DynamicSectionResolver } from '@/domain/services/DynamicSectionResolver';
import { AssignMoldeUseCase } from '@/domain/use-cases/AssignMoldeUseCase';
import { SetTenantStatusUseCase } from '@/domain/use-cases/SetTenantStatusUseCase';
import { SimulateMessageUseCase } from '@/domain/use-cases/SimulateMessageUseCase';

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
  private readonly simulateMessageUseCase: SimulateMessageUseCase;

  constructor(
    userRepository: UserRepository,
    notificationPort: NotificationPort,
    tenantConfigPort: TenantConfigPort,
    botFlowRepository: BotFlowRepository,
    tenantRepository: TenantRepository,
    supabase: SupabaseClient,
    logger: pino.Logger,
  ) {
    const variableResolver = new VariableResolver(supabase, logger);
    const dynamicSectionResolver = new DynamicSectionResolver(logger);
    const flowInterpreter = new FlowInterpreter(
      variableResolver,
      dynamicSectionResolver,
      logger,
    );

    this.botController = new BotController(
      userRepository,
      notificationPort,
      tenantConfigPort,
      botFlowRepository,
      flowInterpreter,
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

    this.simulateMessageUseCase = new SimulateMessageUseCase(
      userRepository,
      tenantConfigPort,
      botFlowRepository,
      flowInterpreter,
      logger,
    );
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

  getSimulateMessageUseCase(): SimulateMessageUseCase {
    return this.simulateMessageUseCase;
  }
}
