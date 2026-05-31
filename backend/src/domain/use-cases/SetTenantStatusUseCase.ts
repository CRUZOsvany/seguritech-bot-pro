import type pino from 'pino';
import type { TenantRepository, TenantStatus } from '@/domain/ports/TenantRepository';

/**
 * Cambia el estado FSM operacional de un tenant.
 *
 * Estados válidos (migration 006):
 *   - 'draft':    creado, sin configuración completa
 *   - 'sandbox':  pruebas internas, bot procesa mensajes
 *   - 'live':     producción, bot procesa mensajes
 *   - 'paused':   suspensión temporal (mora/pago), bot NO responde
 *   - 'archived': retirado del servicio, bot NO responde
 *
 * NOTA (DEC-D): el gating del webhook NO mira tenant.status, mira el status del
 * servicio whatsapp_bot en tenant_services. tenant.status es estado COMERCIAL.
 * El cascade tenant→servicios (paused/archived) vive en el endpoint PATCH
 * /tenants/:id/status del AdminRouter, no aquí.
 *
 * Este use case persiste el estado; el caller (AdminRouter) es responsable
 * de validar el valor recibido del cliente HTTP. Las transiciones permitidas
 * no se enforzan aquí — eso lo hace la capa de presentación si es necesario.
 */
export class SetTenantStatusUseCase {
  constructor(
    private readonly tenantRepository: TenantRepository,
    private readonly logger: pino.Logger,
  ) {}

  async execute(params: {
    tenantId: string;
    status: TenantStatus;
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
