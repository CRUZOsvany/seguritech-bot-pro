import { randomUUID } from 'crypto';
import { GetCashSessionSummaryUseCase } from '@/application/pos/GetCashSessionSummaryUseCase';
import { InMemoryPosStore } from '@/tests/utils/InMemoryPosStore';

const TENANT = '00000000-0000-0000-0000-000000000001';
const OTHER_TENANT = '00000000-0000-0000-0000-000000000002';
const CASHIER = '00000000-0000-0000-0000-0000000000c1';
const OTHER_CASHIER = '00000000-0000-0000-0000-0000000000c2';

async function setup() {
  const store = new InMemoryPosStore();
  const sessions = store.sessionRepo();
  const session = await sessions.open(TENANT, CASHIER, { clientId: randomUUID(), openingAmount: 100 });
  return { session, useCase: new GetCashSessionSummaryUseCase(sessions) };
}

describe('GetCashSessionSummaryUseCase', () => {
  it('devuelve la sesión y su resumen', async () => {
    const { session, useCase } = await setup();

    const result = await useCase.execute({ tenantId: TENANT, cashierId: CASHIER, sessionId: session.id });

    expect(result.session.id).toBe(session.id);
    expect(result.summary).toEqual({ totalSales: 0, saleCount: 0, byPaymentMethod: {} });
  });

  it('no expone la sesión a otro cajero ni a otro tenant', async () => {
    const { session, useCase } = await setup();

    await expect(
      useCase.execute({ tenantId: TENANT, cashierId: OTHER_CASHIER, sessionId: session.id }),
    ).rejects.toMatchObject({ code: 'session_not_owned' });
    await expect(
      useCase.execute({ tenantId: OTHER_TENANT, cashierId: CASHIER, sessionId: session.id }),
    ).rejects.toMatchObject({ code: 'session_not_found' });
  });
});
