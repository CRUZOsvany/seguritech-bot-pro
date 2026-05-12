import type pino from 'pino';
import type { BotFlow } from '@/domain/entities/flow';
import type { BotFlowRepository } from '@/domain/ports/BotFlowRepository';
import type { TenantConfigPort } from '@/domain/ports';

/**
 * Asigna un Molde de Industria a un tenant.
 *
 * Pasos:
 *  1. Desactiva el flow activo actual (si existe) — evita el error de duplicado.
 *  2. Clona el template indicado en bot_flows del tenant.
 *  3. Invalida la caché de TenantConfig (por si tiene info relacionada al flow).
 *
 * ADVERTENCIA: Los pasos 1 y 2 no son transaccionales en esta versión.
 * Si el paso 2 falla, el tenant queda sin flow activo (degradará a FSM legacy).
 * Una migración futura puede envolver esto en una RPC de Postgres.
 */
export class AssignMoldeUseCase {
  constructor(
    private readonly botFlowRepository: BotFlowRepository,
    private readonly tenantConfigPort: TenantConfigPort,
    private readonly logger: pino.Logger,
  ) {}

  async execute(params: {
    tenantId: string;
    templateSlug: string;
  }): Promise<BotFlow> {
    const { tenantId, templateSlug } = params;

    this.logger.info(
      { tenantId, templateSlug },
      'AssignMoldeUseCase: iniciando asignación de molde',
    );

    // 1. Desactivar flow existente (no lanza si no hay ninguno)
    await this.botFlowRepository.deactivateForTenant(tenantId);

    // 2. Clonar el template al tenant
    const flow = await this.botFlowRepository.cloneFromTemplate(tenantId, templateSlug);

    // 3. Invalidar caché del tenant
    this.tenantConfigPort.invalidate(tenantId);

    this.logger.info(
      { tenantId, templateSlug },
      'AssignMoldeUseCase: molde asignado correctamente',
    );

    return flow;
  }
}
