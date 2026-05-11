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

  private mapRow(row: Record<string, any>): User {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      phoneNumber: row.phone_number,
      currentState: row.current_state as UserState,
      currentNodeId: row.current_node_id ?? undefined,
      context: (row.context as Record<string, unknown> | null) ?? undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}