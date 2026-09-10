import { randomUUID } from 'crypto';
import { CloseCashSessionUseCase } from '@/application/pos/CloseCashSessionUseCase';
import { RegisterSaleUseCase } from '@/application/pos/RegisterSaleUseCase';
import { InMemoryPosStore, fakePosProduct } from '@/tests/utils/InMemoryPosStore';

const TENANT = '00000000-0000-0000-0000-000000000001';
const CASHIER = '00000000-0000-0000-0000-0000000000c1';
const OTHER_CASHIER = '00000000-0000-0000-0000-0000000000c2';

async function setupWithSales() {
  const store = new InMemoryPosStore();
  const sessions = store.sessionRepo();
  const register = new RegisterSaleUseCase(store.saleRepo(), sessions, store.productRepo());
  const useCase = new CloseCashSessionUseCase(sessions);
  const session = await sessions.open(TENANT, CASHIER, { clientId: randomUUID(), openingAmount: 500 });
  const lapiz = store.addProduct(fakePosProduct({ unitPrice: 5 }));

  const sell = (qty: number, paymentMethod: 'cash' | 'card' | 'transfer', amountPaid: number) =>
    register.execute({
      tenantId: TENANT,
      cashierId: CASHIER,
      input: {
        clientId: randomUUID(),
        cashSessionId: session.id,
        items: [{ productId: lapiz.id, quantity: qty }],
        paymentMethod,
        amountPaid,
      },
    });

  await sell(2, 'cash', 20); // total 10, cambio 10 — el cambio no afecta el arqueo
  await sell(4, 'cash', 20); // total 20
  await sell(6, 'card', 30); // total 30
  await sell(1, 'transfer', 5); // total 5

  return { useCase, session };
}

describe('CloseCashSessionUseCase', () => {
  it('esperado = apertura + ventas en efectivo; diferencia = contado − esperado', async () => {
    const { useCase, session } = await setupWithSales();

    const { session: closed, summary } = await useCase.execute({
      tenantId: TENANT,
      cashierId: CASHIER,
      sessionId: session.id,
      input: { closingAmount: 525 },
    });

    expect(closed.status).toBe('closed');
    expect(closed.closedAt).not.toBeNull();
    expect(closed.expectedAmount).toBe(530); // 500 + 10 + 20
    expect(closed.closingAmount).toBe(525);
    expect(closed.difference).toBe(-5);
    expect(summary).toEqual({
      totalSales: 65,
      saleCount: 4,
      byPaymentMethod: { cash: 30, card: 30, transfer: 5 },
    });
  });

  it('una caja sin ventas espera exactamente el monto de apertura', async () => {
    const store = new InMemoryPosStore();
    const sessions = store.sessionRepo();
    const session = await sessions.open(TENANT, CASHIER, { clientId: randomUUID(), openingAmount: 250 });

    const { session: closed } = await new CloseCashSessionUseCase(sessions).execute({
      tenantId: TENANT,
      cashierId: CASHIER,
      sessionId: session.id,
      input: { closingAmount: 250 },
    });

    expect(closed.expectedAmount).toBe(250);
    expect(closed.difference).toBe(0);
  });

  it('es idempotente: cerrar dos veces no recalcula ni cambia el arqueo', async () => {
    const { useCase, session } = await setupWithSales();
    const first = await useCase.execute({
      tenantId: TENANT,
      cashierId: CASHIER,
      sessionId: session.id,
      input: { closingAmount: 530 },
    });
    const retry = await useCase.execute({
      tenantId: TENANT,
      cashierId: CASHIER,
      sessionId: session.id,
      input: { closingAmount: 1 },
    });

    expect(retry.session.closingAmount).toBe(530);
    expect(retry.session.difference).toBe(0);
    expect(retry.session.closedAt).toEqual(first.session.closedAt);
  });

  it('rechaza sesión inexistente o de otro cajero', async () => {
    const { useCase, session } = await setupWithSales();

    await expect(
      useCase.execute({
        tenantId: TENANT,
        cashierId: CASHIER,
        sessionId: randomUUID(),
        input: { closingAmount: 0 },
      }),
    ).rejects.toMatchObject({ code: 'session_not_found' });
    await expect(
      useCase.execute({
        tenantId: TENANT,
        cashierId: OTHER_CASHIER,
        sessionId: session.id,
        input: { closingAmount: 0 },
      }),
    ).rejects.toMatchObject({ code: 'session_not_owned' });
  });
});
