/**
 * Consultas de la inactividad (Fase 5) contra Supabase. Se fijan los filtros
 * exactos: el reclamo depende de ellos para no mandar un recordatorio dos
 * veces ni cerrar una conversación en la que el cliente acaba de escribir.
 */
import pino from 'pino';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseUserRepository } from '@/infrastructure/repositories/SupabaseUserRepository';
import { SupabaseTenantServiceRepository } from '@/infrastructure/repositories/SupabaseTenantServiceRepository';

const TENANT = '00000000-0000-0000-0000-000000000001';
const PHONE = '5217470000001';
const LAST = new Date('2026-09-10T17:00:00.000Z');
const AT = new Date('2026-09-10T17:15:00.000Z');
const logger = pino({ level: 'silent' });

/** Supabase mínimo: registra cada llamada de la cadena y resuelve con `result`. */
function recorder(result: { data?: unknown; error?: { code?: string; message: string } | null }) {
  const calls: unknown[][] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'update', 'eq', 'neq', 'not', 'is', 'gte', 'lte', 'or', 'order', 'limit']) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  }
  builder.then = (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) =>
    Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(ok, fail);
  const client = {
    from: (table: string) => {
      calls.push(['from', table]);
      return builder;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

const row = {
  id: 'u1',
  tenant_id: TENANT,
  phone_number: PHONE,
  current_state: 'initial',
  current_node_id: 'menu',
  context: {},
  human_paused_until: null,
  last_inbound_at: LAST.toISOString(),
  opted_out_at: null,
  inactivity_reminded_at: AT.toISOString(),
  created_at: LAST.toISOString(),
  updated_at: LAST.toISOString(),
};

describe('SupabaseUserRepository: inactividad', () => {
  it('listAwaitingReply pide, del tenant, solo conversaciones a medias y sin baja dentro del rango de tiempo', async () => {
    const { client, calls } = recorder({ data: [row] });
    const from = new Date('2026-09-10T15:00:00.000Z');

    const users = await new SupabaseUserRepository(client, logger).listAwaitingReply(TENANT, from, AT);

    expect(calls).toEqual([
      ['from', 'bot_users'],
      ['select', '*'],
      ['eq', 'tenant_id', TENANT],
      ['not', 'current_node_id', 'is', null],
      ['neq', 'current_node_id', 'end'],
      ['is', 'opted_out_at', null],
      ['gte', 'last_inbound_at', from.toISOString()],
      ['lte', 'last_inbound_at', AT.toISOString()],
      ['order', 'last_inbound_at', { ascending: true }],
      ['limit', 500],
    ]);
    expect(users[0]).toMatchObject({ phoneNumber: PHONE, currentNodeId: 'menu', lastInboundAt: LAST, inactivityRemindedAt: AT });
  });

  it('markInactivityReminder marca solo si el último mensaje no cambió y no hubo recordatorio en este silencio', async () => {
    const { client, calls } = recorder({ data: [{ id: 'u1' }] });

    const claimed = await new SupabaseUserRepository(client, logger).markInactivityReminder(TENANT, PHONE, LAST, AT);

    expect(claimed).toBe(true);
    expect(calls).toEqual([
      ['from', 'bot_users'],
      ['update', { inactivity_reminded_at: AT.toISOString() }],
      ['eq', 'tenant_id', TENANT],
      ['eq', 'phone_number', PHONE],
      ['eq', 'last_inbound_at', LAST.toISOString()],
      ['or', `inactivity_reminded_at.is.null,inactivity_reminded_at.lt."${LAST.toISOString()}"`],
      ['select', 'id'],
    ]);
  });

  it('si el UPDATE no tocó ninguna fila, no hay reclamo', async () => {
    const { client } = recorder({ data: [] });

    expect(await new SupabaseUserRepository(client, logger).markInactivityReminder(TENANT, PHONE, LAST, AT)).toBe(false);
  });

  it('si la columna no existe, falla diciendo que falta la migración 024', async () => {
    const { client } = recorder({ error: { code: '42703', message: 'column "inactivity_reminded_at" does not exist' } });

    await expect(new SupabaseUserRepository(client, logger).markInactivityReminder(TENANT, PHONE, LAST, AT)).rejects.toThrow(/migración 024/);
  });

  it('closeInactiveSession borra el paso y lo capturado solo si el cliente no escribió', async () => {
    const { client, calls } = recorder({ data: [{ id: 'u1' }] });

    const closed = await new SupabaseUserRepository(client, logger).closeInactiveSession(TENANT, PHONE, LAST);

    expect(closed).toBe(true);
    expect(calls).toEqual([
      ['from', 'bot_users'],
      ['update', { current_state: 'initial', current_node_id: null, context: {} }],
      ['eq', 'tenant_id', TENANT],
      ['eq', 'phone_number', PHONE],
      ['eq', 'last_inbound_at', LAST.toISOString()],
      ['not', 'current_node_id', 'is', null],
      ['select', 'id'],
    ]);
  });
});

describe('SupabaseTenantServiceRepository.listTenantIdsByStatus', () => {
  it('lista los tenants con el servicio en ese status', async () => {
    const { client, calls } = recorder({ data: [{ tenant_id: 'a' }, { tenant_id: 'b' }] });

    const ids = await new SupabaseTenantServiceRepository(client, logger).listTenantIdsByStatus('whatsapp_bot', 'active');

    expect(ids).toEqual(['a', 'b']);
    expect(calls).toEqual([
      ['from', 'tenant_services'],
      ['select', 'tenant_id'],
      ['eq', 'service_type', 'whatsapp_bot'],
      ['eq', 'status', 'active'],
    ]);
  });
});
