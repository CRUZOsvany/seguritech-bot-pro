import type pino from 'pino';
import type { TenantRepository, TenantStatus } from '@/domain/ports/TenantRepository';

/**
 * Status desde los que se permite borrar un tenant para siempre. Un tenant
 * `live` o `paused` tiene (o tuvo hace poco) clientes reales hablando con su
 * bot: primero se archiva, después se purga.
 */
export const HARD_DELETABLE_STATUSES: readonly TenantStatus[] = ['draft', 'sandbox', 'archived'];

export class TenantNotFoundError extends Error {
  constructor() {
    super('Tenant no encontrado');
    this.name = 'TenantNotFoundError';
  }
}

/** Una de las dos guardas no se cumplió. El mensaje se muestra tal cual en el panel. */
export class HardDeleteRejectedError extends Error {
  constructor(
    readonly reason: 'name_mismatch' | 'status_not_allowed',
    message: string,
  ) {
    super(message);
    this.name = 'HardDeleteRejectedError';
  }
}

/**
 * Borra un tenant para siempre — DELETE + cascade, sin vuelta atrás (ver
 * TenantRepository.hardDelete). Dos guardas, en este orden, y ninguna llega a
 * borrar si falla:
 *   1. El operador escribió el nombre del negocio exacto (case-sensitive).
 *   2. El tenant está en draft, sandbox o archived.
 *
 * Encuentra también tenants ya archivados con softDelete (deleted_at puesto):
 * purgarlos es justo lo que "Archiva este cliente primero" promete.
 */
export class HardDeleteTenantUseCase {
  constructor(
    private readonly tenantRepository: TenantRepository,
    private readonly logger: pino.Logger,
  ) {}

  async execute(params: {
    tenantId: string;
    confirmNombreNegocio: string;
  }): Promise<{ nombre_negocio: string; status: TenantStatus }> {
    const { tenantId, confirmNombreNegocio } = params;

    const tenant = await this.tenantRepository.findIncludingDeleted(tenantId);
    if (!tenant) throw new TenantNotFoundError();

    if (confirmNombreNegocio !== tenant.nombre_negocio) {
      throw new HardDeleteRejectedError('name_mismatch', 'El nombre no coincide');
    }
    if (!HARD_DELETABLE_STATUSES.includes(tenant.status)) {
      throw new HardDeleteRejectedError(
        'status_not_allowed',
        'Solo se pueden eliminar clientes en draft, sandbox o archivados. Archiva este cliente primero.',
      );
    }

    await this.tenantRepository.hardDelete(tenantId);

    this.logger.warn(
      { tenantId, nombre_negocio: tenant.nombre_negocio, status: tenant.status },
      'HardDeleteTenantUseCase: tenant borrado para siempre',
    );
    return { nombre_negocio: tenant.nombre_negocio, status: tenant.status };
  }
}
