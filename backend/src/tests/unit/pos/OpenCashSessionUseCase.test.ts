import { randomUUID } from 'crypto';
import { OpenCashSessionUseCase } from '@/application/pos/OpenCashSessionUseCase';
import { InMemoryPosStore } from '@/tests/utils/InMemoryPosStore';

const TENANT = '00000000-0000-0000-0000-000000000001';
const CASHIER = '00000000-0000-0000-0000-0000000000c1';
const OTHER_CASHIER = '00000000-0000-0000-0000-0000000000c2';

function setup() {
  const store = new InMemoryPosStore();
  return { store, useCase: new OpenCashSessionUseCase(store.sessionRepo()) };
}

describe('OpenCashSessionUseCase', () => {
  it('abre una caja con el monto inicial', async () => {
    const { useCase } = setup();

    const { session, created } = await useCase.execute({
      tenantId: TENANT,
      cashierId: CASHIER,
      input: { clientId: randomUUID(), openingAmount: 500 },
    });

    expect(created).toBe(true);
    expect(session).toMatchObject({
      tenantId: TENANT,
      cashierId: CASHIER,
      openingAmount: 500,
      status: 'open',
    });
  });

  it('un reintento con el mismo clientId devuelve la misma caja, no "ya tienes una caja abierta"', async () => {
    const { store, useCase } = setup();
    const input = { clientId: randomUUID(), openingAmount: 500 };

    const first = await useCase.execute({ tenantId: TENANT, cashierId: CASHIER, input });
    const retry = await useCase.execute({ tenantId: TENANT, cashierId: CASHIER, input });

    expect(retry.created).toBe(false);
    expect(retry.session.id).toBe(first.session.id);
    expect(store.sessions.size).toBe(1);
  });

  it('rechaza una segunda apertura del mismo cajero', async () => {
    const { useCase } = setup();
    await useCase.execute({
      tenantId: TENANT,
      cashierId: CASHIER,
      input: { clientId: randomUUID(), openingAmount: 500 },
    });

    await expect(
      useCase.execute({
        tenantId: TENANT,
        cashierId: CASHIER,
        input: { clientId: randomUUID(), openingAmount: 100 },
      }),
    ).rejects.toMatchObject({ code: 'session_already_open' });
  });

  it('permite cajas abiertas simultáneas de cajeros distintos', async () => {
    const { useCase } = setup();
    await useCase.execute({
      tenantId: TENANT,
      cashierId: CASHIER,
      input: { clientId: randomUUID(), openingAmount: 500 },
    });
    const other = await useCase.execute({
      tenantId: TENANT,
      cashierId: OTHER_CASHIER,
      input: { clientId: randomUUID(), openingAmount: 300 },
    });
    expect(other.created).toBe(true);
  });

  it('no deja a otro cajero reclamar la caja por su clientId', async () => {
    const { useCase } = setup();
    const input = { clientId: randomUUID(), openingAmount: 500 };
    await useCase.execute({ tenantId: TENANT, cashierId: CASHIER, input });

    await expect(
      useCase.execute({ tenantId: TENANT, cashierId: OTHER_CASHIER, input }),
    ).rejects.toMatchObject({ code: 'session_not_owned' });
  });
});
