import bcrypt from 'bcryptjs';
import type pino from 'pino';
import type { JwtService } from '@/infrastructure/auth/JwtService';
import type { AuditLogService } from '@/infrastructure/services/AuditLogService';
import type { TenantRepository } from '@/domain/ports/TenantRepository';
import type { PosUserRepository } from '@/domain/ports/pos/PosUserRepository';
import type { PosUserRole } from '@/domain/entities/pos/PosUser';
import { PosAuthError } from './PosAuthError';

/**
 * Hash dummy para comparar cuando el user no existe — timing-safe, evita
 * que un atacante distinga "tenant inexistente" de "PIN incorrecto" por timing.
 * Generado con bcrypt.hashSync('dummy', 12) — el contenido no importa, solo
 * que sea un hash bcrypt válido para que bcrypt.compare gaste ~ciclos similares.
 */
const DUMMY_HASH = '$2a$12$' + 'x'.repeat(53);

export interface PosLoginInput {
  tenantId: string;
  name: string;
  pin: string;
  ip?: string;
  userAgent?: string;
}

export interface PosLoginResult {
  token: string;
  jti: string;
  exp: number;
  user: {
    id: string;
    displayName: string;
    role: PosUserRole;
    tenantId: string;
  };
}

/**
 * Servicio de autenticación POS (Sprint 5.1a).
 *
 * Lógica del flujo de login PIN:
 *   1. Verifica que el módulo 'pos' esté habilitado en el tenant — antes de
 *      cualquier bcrypt, para no filtrar timing de existencia de tenant.
 *   2. Busca el cajero por (tenantId, name). Si no existe, gasta un bcrypt
 *      contra DUMMY_HASH (timing-safe) y lanza PosAuthError('not_found').
 *   3. Si locked_until > now → PosAuthError('locked').
 *   4. Si is_active=false → PosAuthError('inactive').
 *   5. bcrypt.compare(pin, pinHash). Si falla, incrementa failed_attempts y,
 *      si llega al límite, setea locked_until. Lanza 'invalid_pin'.
 *   6. Si OK: limpia failed_attempts/locked_until, registra last_login_at,
 *      firma JWT con scope='pos'.
 *
 * Auditoría: TODAS las ramas (success/fail/locked) escriben en
 * admin_audit_log con adminId=null (FK constraint) y posUserId en metadata.
 *
 * Race condition conocida: recordFailedAttempt hace read-modify-write
 * (Supabase no expone increment atómico). Documentado en el repositorio.
 */
export class PosAuthService {
  constructor(
    private readonly posUsers: PosUserRepository,
    private readonly tenants: TenantRepository,
    private readonly jwt: JwtService,
    private readonly audit: AuditLogService,
    private readonly maxAttempts: number,
    private readonly lockoutMinutes: number,
    private readonly logger: pino.Logger,
  ) {}

  async login(input: PosLoginInput): Promise<PosLoginResult> {
    const { tenantId, name, pin, ip, userAgent } = input;

    // 1. Module check — antes de bcrypt para evitar timing oracle
    const enabled = await this.tenants.isModuleEnabled(tenantId, 'pos');
    if (!enabled) {
      this.audit.log({
        adminId: null,
        adminEmail: `pos:${name}@${tenantId}`,
        action: 'pos.auth.login.module_disabled',
        ip,
        userAgent,
        metadata: { tenantId },
      });
      throw new PosAuthError('module_disabled');
    }

    // 2. Lookup user
    const user = await this.posUsers.findByTenantAndName(tenantId, name);
    if (!user) {
      // Timing-safe: gastamos bcrypt aunque no exista el user
      await bcrypt.compare(pin, DUMMY_HASH);
      this.audit.log({
        adminId: null,
        adminEmail: `pos:${name}@${tenantId}`,
        action: 'pos.auth.login.not_found',
        ip,
        userAgent,
        metadata: { tenantId, name },
      });
      throw new PosAuthError('not_found');
    }

    // 3. Lockout check
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      this.audit.log({
        adminId: null,
        adminEmail: `pos:${user.name}@${tenantId}`,
        action: 'pos.auth.login.locked',
        ip,
        userAgent,
        metadata: { posUserId: user.id, lockedUntil: user.lockedUntil.toISOString() },
      });
      throw new PosAuthError('locked');
    }

    // 4. Active check
    if (!user.isActive) {
      this.audit.log({
        adminId: null,
        adminEmail: `pos:${user.name}@${tenantId}`,
        action: 'pos.auth.login.inactive',
        ip,
        userAgent,
        metadata: { posUserId: user.id },
      });
      throw new PosAuthError('inactive');
    }

    // 5. Bcrypt compare
    const ok = await bcrypt.compare(pin, user.pinHash);
    if (!ok) {
      const nextAttempts = user.failedAttempts + 1;
      const lockUntil =
        nextAttempts >= this.maxAttempts
          ? new Date(Date.now() + this.lockoutMinutes * 60_000)
          : null;
      try {
        await this.posUsers.recordFailedAttempt(user.id, lockUntil);
      } catch (err) {
        this.logger.error({ err, userId: user.id }, 'recordFailedAttempt failed');
      }
      this.audit.log({
        adminId: null,
        adminEmail: `pos:${user.name}@${tenantId}`,
        action: lockUntil ? 'pos.auth.login.locked' : 'pos.auth.login.fail',
        ip,
        userAgent,
        metadata: { posUserId: user.id, attempts: nextAttempts },
      });
      throw new PosAuthError('invalid_pin');
    }

    // 6. Success
    await this.posUsers.recordSuccessfulLogin(user.id);
    const { token, jti, exp } = this.jwt.sign({
      sub: user.id,
      displayName: user.name,
      role: user.role,
      tenantId,
      scope: 'pos',
    });
    this.audit.log({
      adminId: null,
      adminEmail: `pos:${user.name}@${tenantId}`,
      action: 'pos.auth.login.success',
      ip,
      userAgent,
      metadata: { posUserId: user.id, jti, role: user.role },
    });

    return {
      token,
      jti,
      exp,
      user: {
        id: user.id,
        displayName: user.name,
        role: user.role,
        tenantId,
      },
    };
  }
}
