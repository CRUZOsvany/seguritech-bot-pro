/**
 * Borrado permanente de un tenant: las tres guardas (nombre, status,
 * operadores asignados) se evalúan en orden y ninguna deja pasar a hardDelete
 * si falla.
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

function build(
  found: { status: TenantStatus; nombre?: string } | null,
  operators = 0,
) {
  const findIncludingDeleted = jest.fn().mockResolvedValue(
    found ? { id: TENANT, nombre_negocio: found.nombre ?? NOMBRE, status: found.status } : null,
  );
  const countAdminOperators = jest.fn().mockResolvedValue(operators);
  const hardDelete = jest.fn().mockResolvedValue(undefined);
  const repo = { findIncludingDeleted, countAdminOperators, hardDelete } as unknown as TenantRepository;
  return {
    useCase: new HardDeleteTenantUseCase(repo, logger),
    findIncludingDeleted,
    countAdminOperators,
    hardDelete,
  };
}

describe('HardDeleteTenantUseCase', () => {
  it.each<TenantStatus>(['draft', 'sandbox', 'archived'])(
    'borra un tenant en %s cuando el nombre coincide y no tiene operadores',
    async (status) => {
      const { useCase, hardDelete, countAdminOperators } = build({ status });

      const result = await useCase.execute({ tenantId: TENANT, confirmNombreNegocio: NOMBRE });

      expect(countAdminOperators).toHaveBeenCalledWith(TENANT);
      expect(hardDelete).toHaveBeenCalledWith(TENANT);
      expect(result).toEqual({ nombre_negocio: NOMBRE, status });
    },
  );

  it('busca incluyendo soft-deleted: lo archivado se puede purgar', async () => {
    const { useCase, findIncludingDeleted } = build({ status: 'archived' });

    await useCase.execute({ tenantId: TENANT, confirmNombreNegocio: NOMBRE });

    expect(findIncludingDeleted).toHaveBeenCalledWith(TENANT);
  });

  it.each([
    ['nombre guardado con espacio al final, escrito sin él', 'Cerrajeria Tony ', 'Cerrajeria Tony'],
    ['escrito con espacios en las orillas', NOMBRE, `  ${NOMBRE} `],
  ])('los espacios de las orillas no cuentan: %s', async (_caso, guardado, escrito) => {
    const { useCase, hardDelete } = build({ status: 'draft', nombre: guardado });

    await useCase.execute({ tenantId: TENANT, confirmNombreNegocio: escrito });

    expect(hardDelete).toHaveBeenCalledWith(TENANT);
  });

  it.each(['cerrajería tony', 'Cerrajeria Tony', 'Cerrajería  Tony', '', '   '])(
    'rechaza un nombre distinto (%j): mayúsculas, acentos y espacios de en medio cuentan',
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

  it('distingue la ñ', async () => {
    const { useCase, hardDelete } = build({ status: 'draft', nombre: 'Papelería Ñandú' });

    await expect(
      useCase.execute({ tenantId: TENANT, confirmNombreNegocio: 'Papelería Nandú' }),
    ).rejects.toMatchObject({ reason: 'name_mismatch' });
    expect(hardDelete).not.toHaveBeenCalled();
  });

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

  it('rechaza un tenant con un admin_operator asignado, con el motivo', async () => {
    const { useCase, hardDelete } = build({ status: 'draft' }, 1);

    const err = await useCase
      .execute({ tenantId: TENANT, confirmNombreNegocio: NOMBRE })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HardDeleteRejectedError);
    expect(err).toMatchObject({ reason: 'has_admin_operator' });
    expect((err as Error).message).toMatch(/operador del panel/);
    expect(hardDelete).not.toHaveBeenCalled();
  });

  it('si no se pudo contar a los operadores, no borra', async () => {
    const { useCase, hardDelete, countAdminOperators } = build({ status: 'draft' });
    countAdminOperators.mockRejectedValue(new Error('countAdminOperators failed: down'));

    await expect(
      useCase.execute({ tenantId: TENANT, confirmNombreNegocio: NOMBRE }),
    ).rejects.toThrow('down');
    expect(hardDelete).not.toHaveBeenCalled();
  });

  it('orden: nombre, luego status, luego operadores', async () => {
    const liveConOperador = build({ status: 'live' }, 3);
    await expect(
      liveConOperador.useCase.execute({ tenantId: TENANT, confirmNombreNegocio: 'otro' }),
    ).rejects.toMatchObject({ reason: 'name_mismatch' });
    await expect(
      liveConOperador.useCase.execute({ tenantId: TENANT, confirmNombreNegocio: NOMBRE }),
    ).rejects.toMatchObject({ reason: 'status_not_allowed' });
    expect(liveConOperador.countAdminOperators).not.toHaveBeenCalled();
  });

  it('un tenant que no existe da TenantNotFoundError', async () => {
    const { useCase, hardDelete } = build(null);

    await expect(
      useCase.execute({ tenantId: TENANT, confirmNombreNegocio: NOMBRE }),
    ).rejects.toBeInstanceOf(TenantNotFoundError);
    expect(hardDelete).not.toHaveBeenCalled();
  });
});
