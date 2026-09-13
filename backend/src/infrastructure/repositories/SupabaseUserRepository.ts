import { SupabaseClient } from '@supabase/supabase-js';
import pino from 'pino';
import { User, UserState } from '@/domain/entities';
import { UserRepository } from '@/domain/ports';

/**
 * Adaptador Supabase de UserRepository.
 * Persiste usuarios del bot en la tabla `bot_users` (schema 001 + 002).
 *
 * Aislamiento multi-tenant garantizado por filtros explícitos en cada query.
 *
 * Sprint 1.5: incluye mapeo de current_node_id y context (Sprint B). Los
 * usuarios nuevos arrancan con currentNodeId undefined; el FlowInterpreter
 * (Sprint 4) decidirá cómo poblarlos cuando se cablee al BotController.
 */
export class SupabaseUserRepository implements UserRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly logger: pino.Logger,
  ) {}

  async save(user: User): Promise<void> {
    const { error } = await this.supabase.from('bot_users').insert({
      id: user.id,
      tenant_id: user.tenantId,
      phone_number: user.phoneNumber,
      current_state: user.currentState,
      current_node_id: user.currentNodeId ?? null,
      context: user.context ?? {},
      human_paused_until: null,
    });

    if (error) {
      this.logger.error(
        { error, tenantId: user.tenantId, phone: user.phoneNumber },
        'SupabaseUserRepository.save failed',
      );
      throw new Error(`save failed: ${error.message}`);
    }

    this.logger.debug(
      { tenantId: user.tenantId, phone: user.phoneNumber },
      '[SupabaseUserRepository] usuario guardado',
    );
  }

  async findById(tenantId: string, id: string): Promise<User | null> {
    const { data, error } = await this.supabase
      .from('bot_users')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      this.logger.error({ error, tenantId, id }, 'findById failed');
      throw new Error(`findById failed: ${error.message}`);
    }
    return data ? this.mapRow(data) : null;
  }

  async findByPhoneNumber(tenantId: string, phoneNumber: string): Promise<User | null> {
    const { data, error } = await this.supabase
      .from('bot_users')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('phone_number', phoneNumber)
      .maybeSingle();

    if (error) {
      this.logger.error(
        { error, tenantId, phoneNumber },
        'findByPhoneNumber failed',
      );
      throw new Error(`findByPhoneNumber failed: ${error.message}`);
    }
    return data ? this.mapRow(data) : null;
  }

  async update(user: User): Promise<void> {
    const { error } = await this.supabase
      .from('bot_users')
      .update({
        current_state: user.currentState,
        current_node_id: user.currentNodeId ?? null,
        context: user.context ?? {},
        human_paused_until: user.humanPausedUntil ?? null,
      })
      .eq('tenant_id', user.tenantId)
      .eq('id', user.id);

    if (error) {
      this.logger.error(
        { error, tenantId: user.tenantId, id: user.id },
        'update failed',
      );
      throw new Error(`update failed: ${error.message}`);
    }

    this.logger.debug(
      { tenantId: user.tenantId, phone: user.phoneNumber, state: user.currentState },
      '[SupabaseUserRepository] usuario actualizado',
    );
  }

  async resetUserState(tenantId: string, phoneNumber: string): Promise<void> {
    const { error } = await this.supabase
      .from('bot_users')
      .update({
        current_state: 'initial',
        current_node_id: null,
        context: {},
      })
      .eq('tenant_id', tenantId)
      .eq('phone_number', phoneNumber);

    if (error) {
      this.logger.error(
        { error, tenantId, phoneNumber },
        'resetUserState failed',
      );
      throw new Error(`resetUserState failed: ${error.message}`);
    }
  }

  async setHumanHandoff(
    tenantId: string,
    phoneNumber: string,
    pausedUntil: Date | null,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('bot_users')
      .update({ human_paused_until: pausedUntil?.toISOString() ?? null })
      .eq('tenant_id', tenantId)
      .eq('phone_number', phoneNumber);

    if (error) {
      this.logger.error({ error, tenantId, phoneNumber }, 'setHumanHandoff failed');
      throw new Error(`setHumanHandoff failed: ${error.message}`);
    }

    this.logger.debug(
      { tenantId, phoneNumber, pausedUntil },
      '[SupabaseUserRepository] human handoff actualizado',
    );
  }

  async listPaused(tenantId: string): Promise<User[]> {
    const { data, error } = await this.supabase
      .from('bot_users')
      .select('*')
      .eq('tenant_id', tenantId)
      .not('human_paused_until', 'is', null)
      .gt('human_paused_until', new Date().toISOString())
      .order('human_paused_until', { ascending: true });

    if (error) {
      this.logger.error({ error, tenantId }, 'listPaused failed');
      throw new Error(`listPaused failed: ${error.message}`);
    }
    return (data ?? []).map((row) => this.mapRow(row));
  }

  async touchLastInbound(tenantId: string, phoneNumber: string, at: Date): Promise<void> {
    const { error } = await this.supabase
      .from('bot_users')
      .update({ last_inbound_at: at.toISOString() })
      .eq('tenant_id', tenantId)
      .eq('phone_number', phoneNumber);

    if (error) {
      this.logger.error({ error, tenantId, phoneNumber }, 'touchLastInbound failed');
      throw new Error(`touchLastInbound failed: ${error.message}`);
    }
  }

  async setOptOut(
    tenantId: string,
    phoneNumber: string,
    optedOutAt: Date | null,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('bot_users')
      .update({ opted_out_at: optedOutAt?.toISOString() ?? null })
      .eq('tenant_id', tenantId)
      .eq('phone_number', phoneNumber);

    if (error) {
      this.logger.error({ error, tenantId, phoneNumber }, 'setOptOut failed');
      throw new Error(`setOptOut failed: ${error.message}`);
    }

    this.logger.debug(
      { tenantId, phoneNumber, optedOutAt },
      '[SupabaseUserRepository] opt-out actualizado',
    );
  }

  async listAwaitingReply(tenantId: string, lastInboundFrom: Date, lastInboundTo: Date): Promise<User[]> {
    const { data, error } = await this.supabase
      .from('bot_users')
      .select('*')
      .eq('tenant_id', tenantId)
      .not('current_node_id', 'is', null)
      .neq('current_node_id', 'end')
      .is('opted_out_at', null)
      .gte('last_inbound_at', lastInboundFrom.toISOString())
      .lte('last_inbound_at', lastInboundTo.toISOString())
      .order('last_inbound_at', { ascending: true })
      .limit(500);

    if (error) {
      this.logger.error({ error, tenantId }, 'listAwaitingReply failed');
      throw new Error(`listAwaitingReply failed: ${error.message}`);
    }
    return (data ?? []).map((row) => this.mapRow(row));
  }

  async markInactivityReminder(tenantId: string, phoneNumber: string, lastInboundAt: Date, at: Date): Promise<boolean> {
    const since = lastInboundAt.toISOString();
    // UPDATE condicionado: si el cliente escribió (last_inbound_at cambió) o
    // ya se le recordó en este silencio, no toca ninguna fila.
    const { data, error } = await this.supabase
      .from('bot_users')
      .update({ inactivity_reminded_at: at.toISOString() })
      .eq('tenant_id', tenantId)
      .eq('phone_number', phoneNumber)
      .eq('last_inbound_at', since)
      .or(`inactivity_reminded_at.is.null,inactivity_reminded_at.lt."${since}"`)
      .select('id');

    if (error) {
      this.logger.error(
        { error, tenantId, phoneNumber },
        'markInactivityReminder failed (¿falta la migración 024?)',
      );
      throw new Error(`markInactivityReminder failed: ${error.message} (¿falta la migración 024?)`);
    }
    return (data ?? []).length > 0;
  }

  async closeInactiveSession(tenantId: string, phoneNumber: string, lastInboundAt: Date): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('bot_users')
      .update({ current_state: 'initial', current_node_id: null, context: {} })
      .eq('tenant_id', tenantId)
      .eq('phone_number', phoneNumber)
      .eq('last_inbound_at', lastInboundAt.toISOString())
      .not('current_node_id', 'is', null)
      .select('id');

    if (error) {
      this.logger.error({ error, tenantId, phoneNumber }, 'closeInactiveSession failed');
      throw new Error(`closeInactiveSession failed: ${error.message}`);
    }
    return (data ?? []).length > 0;
  }

  private mapRow(row: Record<string, any>): User {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      phoneNumber: row.phone_number,
      currentState: row.current_state as UserState,
      currentNodeId: row.current_node_id ?? undefined,
      context: (row.context as Record<string, unknown> | null) ?? undefined,
      humanPausedUntil: row.human_paused_until ? new Date(row.human_paused_until) : null,
      lastInboundAt: row.last_inbound_at ? new Date(row.last_inbound_at) : null,
      optedOutAt: row.opted_out_at ? new Date(row.opted_out_at) : null,
      inactivityRemindedAt: row.inactivity_reminded_at ? new Date(row.inactivity_reminded_at) : null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}