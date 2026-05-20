import type { SupabaseClient } from '@supabase/supabase-js';
import type pino from 'pino';
import type {
  MetaCredentials,
  MetaCredentialsRepository,
  UpsertMetaCredentialsInput,
} from '@/domain/ports';
import { TokenCrypto } from '@/infrastructure/services/TokenCrypto';

/**
 * Implementación Supabase del repositorio de credenciales Meta.
 *
 * Caché en memoria con TTL de 5 minutos. Se invalida explícitamente desde
 * el panel admin cuando se rota un token. La caché es por proceso; si corres
 * varias instancias del backend, cada una tiene su propia caché.
 */

interface CacheEntry {
  creds: MetaCredentials | null;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

export class SupabaseMetaCredentialsRepository implements MetaCredentialsRepository {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly crypto: TokenCrypto,
    private readonly logger: pino.Logger,
  ) {}

  async findByTenantId(tenantId: string): Promise<MetaCredentials | null> {
    const now = Date.now();
    const cached = this.cache.get(tenantId);
    if (cached && cached.expiresAt > now) {
      return cached.creds;
    }

    const { data, error } = await this.supabase
      .from('tenant_meta_credentials')
      .select(
        'tenant_id, phone_number_id, waba_id, display_phone_number, access_token_ciphertext, is_active',
      )
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      this.logger.error(
        { err: error, tenantId },
        '❌ Error consultando tenant_meta_credentials',
      );
      return null;
    }

    if (!data) {
      this.cache.set(tenantId, { creds: null, expiresAt: now + CACHE_TTL_MS });
      return null;
    }

    let accessToken: string;
    try {
      accessToken = this.crypto.decrypt(data.access_token_ciphertext);
    } catch (err) {
      this.logger.error(
        { err, tenantId },
        '❌ No se pudo descifrar access_token. ¿Cambiaste META_TOKEN_ENCRYPTION_KEY?',
      );
      return null;
    }

    const creds: MetaCredentials = {
      tenantId: data.tenant_id,
      wabaId: data.waba_id,
      phoneNumberId: data.phone_number_id,
      displayPhoneNumber: data.display_phone_number,
      accessToken,
      isActive: data.is_active,
    };

    this.cache.set(tenantId, { creds, expiresAt: now + CACHE_TTL_MS });
    return creds;
  }

  async upsert(input: UpsertMetaCredentialsInput): Promise<void> {
    const ciphertext = this.crypto.encrypt(input.accessToken);

    // ¿Existe registro previo? -> update; si no -> insert.
    // No usamos onConflict porque queremos resetear is_active y rotated_at sólo
    // cuando es update real, no en cada upsert.
    const { data: existing, error: selErr } = await this.supabase
      .from('tenant_meta_credentials')
      .select('id')
      .eq('tenant_id', input.tenantId)
      .maybeSingle();

    if (selErr) {
      this.logger.error(
        { err: selErr, tenantId: input.tenantId },
        '❌ upsert meta_creds select previo falló',
      );
      throw new Error(`upsert meta_creds select: ${selErr.message}`);
    }

    if (existing?.id) {
      const { error } = await this.supabase
        .from('tenant_meta_credentials')
        .update({
          phone_number_id: input.phoneNumberId,
          waba_id: input.wabaId,
          display_phone_number: input.displayPhoneNumber,
          access_token_ciphertext: ciphertext,
          is_active: true,
          rotated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      if (error) throw new Error(`upsert meta_creds update: ${error.message}`);
    } else {
      const { error } = await this.supabase.from('tenant_meta_credentials').insert({
        tenant_id: input.tenantId,
        phone_number_id: input.phoneNumberId,
        waba_id: input.wabaId,
        display_phone_number: input.displayPhoneNumber,
        access_token_ciphertext: ciphertext,
        is_active: true,
      });
      if (error) throw new Error(`upsert meta_creds insert: ${error.message}`);
    }

    this.invalidate(input.tenantId);
    this.logger.info(
      { tenantId: input.tenantId, rotated: !!existing?.id },
      '🔐 Credenciales Meta upserted (cifradas)',
    );
  }

  async revoke(tenantId: string): Promise<void> {
    const { error } = await this.supabase
      .from('tenant_meta_credentials')
      .update({ is_active: false })
      .eq('tenant_id', tenantId);
    if (error) throw new Error(`revoke meta_creds: ${error.message}`);

    this.invalidate(tenantId);
    this.logger.warn({ tenantId }, '⚠️  Credenciales Meta revocadas (is_active=false)');
  }

  invalidate(tenantId: string): void {
    this.cache.delete(tenantId);
    this.logger.info({ tenantId }, '🔄 Caché de credenciales Meta invalidada');
  }
}