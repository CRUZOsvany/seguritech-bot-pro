import type pino from 'pino';
import type { TenantRepository } from '@/domain/ports/TenantRepository';

/**
 * Cambia el status operacional de un tenant (active / paused).
 *
 * - 'active': el bot procesa mensajes normalmente.
 * - 'paused': el bot NO responde (control de pago/mora).
 *
 * NOTA: ExpressServer no verifica tenants.status todavía.
 * La verificación de status se agrega en Sprint 5 como middleware del webhook.
 * Por ahora este use case persiste el estado; el enforcement se agrega luego.
 */
export class SetTenantStatusUseCase {
  constructor(
    private readonly tenantRepository: TenantRepository,
    private readonly logger: pino.Logger,
  ) {}

  async execute(params: {
    tenantId: string;
    status: 'active' | 'paused';
  }): Promise<void> {
    const { tenantId, status } = params;

    this.logger.info(
      { tenantId, status },
      'SetTenantStatusUseCase: actualizando status de tenant',
    );

    await this.tenantRepository.setStatus(tenantId, status);

    this.logger.info(
      { tenantId, status },
      'SetTenantStatusUseCase: status actualizado',
    );
  }
}
