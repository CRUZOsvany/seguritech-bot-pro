/**
 * El temporizador del barrido de inactividad (Fase 5): una pasada por minuto,
 * una a la vez, y un tenant que falla no frena a los demás.
 */
import pino from 'pino';
import type { InactivityOutcome } from '@/domain/conversation/InactivitySweeper';
import { InactivityScheduler } from '@/infrastructure/scheduling/InactivityScheduler';

const logger = pino({ level: 'silent' });

const outcome = (action: 'reminder' | 'close', to: string, text?: string): InactivityOutcome => ({
  to,
  action,
  trace: [],
  outbound: text ? [{ to, audience: 'customer', content: { kind: 'text', text } }] : [],
});

describe('InactivityScheduler', () => {
  afterEach(() => jest.useRealTimers());

  it('una pasada barre cada tenant, cuenta y registra en messages lo que salió', async () => {
    const sweepTenant = jest.fn(async (tenantId: string) =>
      tenantId === 't1' ? [outcome('reminder', 'a', '¿Sigues ahí?'), outcome('close', 'b')] : [outcome('close', 'c', 'Cerramos.')],
    );
    const logOutbound = jest.fn().mockResolvedValue(undefined);
    const scheduler = new InactivityScheduler({ sweeper: { sweepTenant }, listTenants: async () => ['t1', 't2'], logOutbound, logger });

    expect(await scheduler.runOnce()).toEqual({ reminders: 1, closes: 2 });
    expect(sweepTenant.mock.calls).toEqual([['t1'], ['t2']]);
    expect(logOutbound.mock.calls).toEqual([
      ['t1', 'a', '¿Sigues ahí?'],
      ['t2', 'c', 'Cerramos.'],
    ]);
  });

  it('un tenant que falla no frena a los demás', async () => {
    const sweepTenant = jest.fn(async (tenantId: string) => {
      if (tenantId === 't1') throw new Error('Supabase caído');
      return [outcome('reminder', 'x', 'hola')];
    });
    const scheduler = new InactivityScheduler({ sweeper: { sweepTenant }, listTenants: async () => ['t1', 't2'], logger });

    expect(await scheduler.runOnce()).toEqual({ reminders: 1, closes: 0 });
  });

  it('si no se pueden listar los tenants, la pasada termina sin lanzar', async () => {
    const sweepTenant = jest.fn();
    const scheduler = new InactivityScheduler({
      sweeper: { sweepTenant },
      listTenants: async () => {
        throw new Error('Supabase caído');
      },
      logger,
    });

    expect(await scheduler.runOnce()).toEqual({ reminders: 0, closes: 0 });
    expect(sweepTenant).not.toHaveBeenCalled();
  });

  it('una pasada a la vez: si la anterior sigue corriendo, esta se salta', async () => {
    let release: () => void = () => undefined;
    const sweepTenant = jest.fn(
      () => new Promise<InactivityOutcome[]>((resolve) => {
        release = () => resolve([]);
      }),
    );
    const scheduler = new InactivityScheduler({ sweeper: { sweepTenant }, listTenants: async () => ['t1'], logger });

    const first = scheduler.runOnce();
    while (sweepTenant.mock.calls.length === 0) await Promise.resolve();

    expect(await scheduler.runOnce()).toBeNull();
    release();
    expect(await first).toEqual({ reminders: 0, closes: 0 });
  });

  it('start corre una pasada por intervalo y stop la detiene', async () => {
    jest.useFakeTimers();
    const sweepTenant = jest.fn(async () => [] as InactivityOutcome[]);
    const scheduler = new InactivityScheduler({ sweeper: { sweepTenant }, listTenants: async () => ['t1'], intervalMs: 60_000, logger });

    scheduler.start();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(sweepTenant).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(sweepTenant).toHaveBeenCalledTimes(2);

    scheduler.stop();
    await jest.advanceTimersByTimeAsync(180_000);
    expect(sweepTenant).toHaveBeenCalledTimes(2);
  });
});
