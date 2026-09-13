/**
 * Borrado permanente de un tenant: las dos guardas (nombre exacto, status) se
 * evalúan en orden y ninguna deja pasar a hardDelete si falla.
 */
import pino from 'pino';
import type { TenantRepository, TenantStatus } from '@/domain/ports/TenantRepository';
import {
  HardDeleteRejectedError,
  HardDeleteTenantUseCase,
  TenantNotFoundError,
} from '@/domain/use-cases/HardDeleteTenantUseCase';

const TENANT = '00000000-0000-0000-0000-0000000000aa';
const NOMBRE = 'Cerrajería Tony';
const logger = pino({ level: 'silent' });

function build(found: { status: TenantStatus } | null) {
  const findIncludingDeleted = jest
    .fn()
    .mockResolvedValue(found ? { id: TENANT, nombre_negocio: NOMBRE, status: found.status } : null);
  const hardDelete = jest.fn().mockResolvedValue(undefined);
  const repo = { findIncludingDeleted, hardDelete } as unknown as TenantRepository;
  return { useCase: new HardDeleteTenantUseCase(repo, logger), findIncludingDeleted, hardDelete };
}

describe('HardDeleteTenantUseCase', () => {
  it.each<TenantStatus>(['draft', 'sandbox', 'archived'])(
    'borra un tenant en %s cuando el nombre coincide exacto',
    async (status) => {
      const { useCase, hardDelete } = build({ status });

      const result = await useCase.execute({ tenantId: TENANT, confirmNombreNegocio: NOMBRE });

      expect(hardDelete).toHaveBeenCalledWith(TENANT);
      expect(result).toEqual({ nombre_negocio: NOMBRE, status });
    },
  );

  it('busca incluyendo soft-deleted: lo archivado se puede purgar', async () => {
    const { useCase, findIncludingDeleted } = build({ status: 'archived' });

    await useCase.execute({ tenantId: TENANT, confirmNombreNegocio: NOMBRE });

    expect(findIncludingDeleted).toHaveBeenCalledWith(TENANT);
  });

  it.each(['cerrajería tony', 'Cerrajeria Tony', ` ${NOMBRE}`, ''])(
    'rechaza un nombre que no es idéntico (%j) sin borrar nada',
    async (typed) => {
      const { useCase, hardDelete } = build({ status: 'draft' });

      const err = await useCase
        .execute({ tenantId: TENANT, confirmNombreNegocio: typed })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HardDeleteRejectedError);
      expect(err).toMatchObject({ reason: 'name_mismatch', message: 'El nombre no coincide' });
      expect(hardDelete).not.toHaveBeenCalled();
    },
  );

  it.each<TenantStatus>(['live', 'paused'])('rechaza un tenant en %s aunque el nombre coincida', async (status) => {
    const { useCase, hardDelete } = build({ status });

    const err = await useCase
      .execute({ tenantId: TENANT, confirmNombreNegocio: NOMBRE })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HardDeleteRejectedError);
    expect(err).toMatchObject({ reason: 'status_not_allowed' });
    expect((err as Error).message).toMatch(/Archiva este cliente primero/);
    expect(hardDelete).not.toHaveBeenCalled();
  });

  it('el nombre se revisa antes que el status', async () => {
    const { useCase } = build({ status: 'live' });

    await expect(
      useCase.execute({ tenantId: TENANT, confirmNombreNegocio: 'otro' }),
    ).rejects.toMatchObject({ reason: 'name_mismatch' });
  });

  it('un tenant que no existe da TenantNotFoundError', async () => {
    const { useCase, hardDelete } = build(null);

    await expect(
      useCase.execute({ tenantId: TENANT, confirmNombreNegocio: NOMBRE }),
    ).rejects.toBeInstanceOf(TenantNotFoundError);
    expect(hardDelete).not.toHaveBeenCalled();
  });
});
