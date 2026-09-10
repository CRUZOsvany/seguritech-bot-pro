import { randomUUID } from 'crypto';
import { RegisterSaleUseCase } from '@/application/pos/RegisterSaleUseCase';
import { PosOperationError } from '@/application/pos/PosOperationError';
import type { NewPosSale } from '@/domain/entities/pos/Sale';
import { InMemoryPosStore, fakePosProduct } from '@/tests/utils/InMemoryPosStore';

const TENANT = '00000000-0000-0000-0000-000000000001';
const OTHER_TENANT = '00000000-0000-0000-0000-000000000002';
const CASHIER = '00000000-0000-0000-0000-0000000000c1';
const OTHER_CASHIER = '00000000-0000-0000-0000-0000000000c2';

async function setup() {
  const store = new InMemoryPosStore();
  const sessions = store.sessionRepo();
  const useCase = new RegisterSaleUseCase(store.saleRepo(), sessions, store.productRepo());
  const session = await sessions.open(TENANT, CASHIER, { clientId: randomUUID(), openingAmount: 500 });
  const lapiz = store.addProduct(fakePosProduct({ unitPrice: 5, stockQty: 10 }));
  const impresion = store.addProduct(
    fakePosProduct({
      sku: 'SRV-IMP',
      name: 'Impresión B/N',
      unitPrice: 2,
      unitType: 'service',
      trackStock: false,
      stockQty: 0,
    }),
  );
  const sale = (over: Partial<NewPosSale> = {}): NewPosSale => ({
    clientId: randomUUID(),
    cashSessionId: session.id,
    items: [{ productId: lapiz.id, quantity: 2 }],
    paymentMethod: 'cash',
    amountPaid: 20,
    ...over,
  });
  return { store, sessions, useCase, session, lapiz, impresion, sale };
}

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toBeInstanceOf(PosOperationError);
  await expect(p).rejects.toMatchObject({ code });
}

describe('RegisterSaleUseCase', () => {
  it('resuelve precio y nombre desde el catálogo, calcula totales, cambio y ticket 001', async () => {
    const { useCase, sale, lapiz } = await setup();

    const { sale: result, created } = await useCase.execute({
      tenantId: TENANT,
      cashierId: CASHIER,
      input: sale(),
    });

    expect(created).toBe(true);
    expect(result.ticketNumber).toBe('001');
    expect(result.subtotal).toBe(10);
    expect(result.taxTotal).toBe(0);
    expect(result.total).toBe(10);
    expect(result.changeGiven).toBe(10);
    expect(result.cashierId).toBe(CASHIER);
    expect(result.items).toEqual([
      expect.objectContaining({
        productId: lapiz.id,
        quantity: 2,
        unitPrice: 5,
        subtotal: 10,
        productName: 'Lápiz Mirado',
        productSku: 'LAP-001',
      }),
    ]);
  });

  it('numera los tickets de forma secuencial dentro de la sesión', async () => {
    const { useCase, sale } = await setup();
    await useCase.execute({ tenantId: TENANT, cashierId: CASHIER, input: sale() });
    const second = await useCase.execute({ tenantId: TENANT, cashierId: CASHIER, input: sale() });
    expect(second.sale.ticketNumber).toBe('002');
  });

  it('suma el impuesto aditivo cuando el producto tiene tax_rate', async () => {
    const { store, useCase, sale } = await setup();
    const cuaderno = store.addProduct(fakePosProduct({ sku: 'CUA-1', unitPrice: 50, taxRate: 16 }));

    const { sale: result } = await useCase.execute({
      tenantId: TENANT,
      cashierId: CASHIER,
      input: sale({ items: [{ productId: cuaderno.id, quantity: 3 }], amountPaid: 200 }),
    });

    expect(result.subtotal).toBe(150);
    expect(result.taxTotal).toBe(24);
    expect(result.total).toBe(174);
    expect(result.changeGiven).toBe(26);
  });

  it('agrupa líneas del mismo producto y valida stock sobre la cantidad total', async () => {
    const { useCase, sale, lapiz } = await setup();

    await expectCode(
      useCase.execute({
        tenantId: TENANT,
        cashierId: CASHIER,
        input: sale({
          items: [
            { productId: lapiz.id, quantity: 6 },
            { productId: lapiz.id, quantity: 6 },
          ],
          amountPaid: 100,
        }),
      }),
      'insufficient_stock',
    );

    const ok = await useCase.execute({
      tenantId: TENANT,
      cashierId: CASHIER,
      input: sale({
        items: [
          { productId: lapiz.id, quantity: 4 },
          { productId: lapiz.id, quantity: 6 },
        ],
        amountPaid: 50,
      }),
    });
    expect(ok.sale.items).toHaveLength(1);
    expect(ok.sale.items[0].quantity).toBe(10);
  });

  it('no valida stock de servicios (track_stock=false)', async () => {
    const { useCase, sale, impresion } = await setup();
    const { sale: result } = await useCase.execute({
      tenantId: TENANT,
      cashierId: CASHIER,
      input: sale({ items: [{ productId: impresion.id, quantity: 40 }], amountPaid: 80 }),
    });
    expect(result.total).toBe(80);
  });

  it('no descuenta stock a mano: el único descuento es el del trigger', async () => {
    const { store, useCase, sale, lapiz } = await setup();
    await useCase.execute({ tenantId: TENANT, cashierId: CASHIER, input: sale() });
    expect(store.products.get(lapiz.id)!.stockQty).toBe(8);
  });

  it('un reintento con el mismo clientId devuelve la venta sin duplicarla ni descontar stock otra vez', async () => {
    const { store, useCase, sale, lapiz } = await setup();
    // La venta se lleva las 10 piezas: si el reintento validara stock, fallaría.
    const input = sale({ items: [{ productId: lapiz.id, quantity: 10 }], amountPaid: 50 });

    const first = await useCase.execute({ tenantId: TENANT, cashierId: CASHIER, input });
    const retry = await useCase.execute({ tenantId: TENANT, cashierId: CASHIER, input });

    expect(retry.created).toBe(false);
    expect(retry.sale.id).toBe(first.sale.id);
    expect(store.sales.size).toBe(1);
    expect(store.products.get(lapiz.id)!.stockQty).toBe(0);
  });

  it('otro cajero no puede leer una venta ajena reenviando su clientId', async () => {
    const { useCase, sale } = await setup();
    const input = sale();
    await useCase.execute({ tenantId: TENANT, cashierId: CASHIER, input });

    await expectCode(
      useCase.execute({ tenantId: TENANT, cashierId: OTHER_CASHIER, input }),
      'session_not_owned',
    );
  });

  it('rechaza producto inexistente, inactivo o de otro tenant', async () => {
    const { store, useCase, sale } = await setup();
    const inactivo = store.addProduct(fakePosProduct({ sku: 'OLD', isActive: false }));
    const ajeno = store.addProduct(fakePosProduct({ sku: 'AJ', tenantId: OTHER_TENANT }));

    for (const productId of [randomUUID(), inactivo.id, ajeno.id]) {
      await expectCode(
        useCase.execute({
          tenantId: TENANT,
          cashierId: CASHIER,
          input: sale({ items: [{ productId, quantity: 1 }] }),
        }),
        'product_not_found',
      );
    }
  });

  it('no vende sin sesión de caja abierta y propia', async () => {
    const { sessions, useCase, sale, session } = await setup();

    await expectCode(
      useCase.execute({
        tenantId: TENANT,
        cashierId: CASHIER,
        input: sale({ cashSessionId: randomUUID() }),
      }),
      'session_not_found',
    );
    await expectCode(
      useCase.execute({ tenantId: TENANT, cashierId: OTHER_CASHIER, input: sale() }),
      'session_not_owned',
    );
    await expectCode(
      useCase.execute({ tenantId: OTHER_TENANT, cashierId: CASHIER, input: sale() }),
      'session_not_found',
    );

    await sessions.close(TENANT, session.id, { closingAmount: 500, expectedAmount: 500, difference: 0 });
    await expectCode(
      useCase.execute({ tenantId: TENANT, cashierId: CASHIER, input: sale() }),
      'session_closed',
    );
  });

  it('rechaza carrito vacío', async () => {
    const { useCase, sale } = await setup();
    await expectCode(
      useCase.execute({ tenantId: TENANT, cashierId: CASHIER, input: sale({ items: [] }) }),
      'empty_cart',
    );
  });

  it('en efectivo exige que el pago cubra el total', async () => {
    const { useCase, sale } = await setup();
    await expectCode(
      useCase.execute({ tenantId: TENANT, cashierId: CASHIER, input: sale({ amountPaid: 9.99 }) }),
      'insufficient_payment',
    );
  });

  it('con tarjeta o transferencia exige pago exacto y no da cambio', async () => {
    const { useCase, sale } = await setup();
    await expectCode(
      useCase.execute({
        tenantId: TENANT,
        cashierId: CASHIER,
        input: sale({ paymentMethod: 'card', amountPaid: 20 }),
      }),
      'invalid_payment',
    );
    const { sale: result } = await useCase.execute({
      tenantId: TENANT,
      cashierId: CASHIER,
      input: sale({ paymentMethod: 'transfer', amountPaid: 10 }),
    });
    expect(result.changeGiven).toBe(0);
  });

  it('redondea a centavos', async () => {
    const { store, useCase, sale } = await setup();
    const clip = store.addProduct(fakePosProduct({ sku: 'CLIP', unitPrice: 0.1, stockQty: 1000 }));
    const { sale: result } = await useCase.execute({
      tenantId: TENANT,
      cashierId: CASHIER,
      input: sale({ items: [{ productId: clip.id, quantity: 3 }], amountPaid: 0.3 }),
    });
    expect(result.total).toBe(0.3);
    expect(result.changeGiven).toBe(0);
  });
});
