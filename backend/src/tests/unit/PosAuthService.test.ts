import bcrypt from 'bcryptjs';
import pino from 'pino';
import { PosAuthService } from '@/application/pos/PosAuthService';
import { PosAuthError } from '@/application/pos/PosAuthError';
import { JwtService } from '@/infrastructure/auth/JwtService';
import type { AuditLogService } from '@/infrastructure/services/AuditLogService';
import type { PosUserRepository } from '@/domain/ports/pos/PosUserRepository';
import type { TenantRepository } from '@/domain/ports/TenantRepository';
import type { PosUser } from '@/domain/entities/pos/PosUser';

const SECRET = 'a'.repeat(64);
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000002';

const silentLogger = pino({ level: 'silent' });

function makePinUser(overrides: Partial<PosUser> = {}): PosUser {
  return {
    id: USER_ID,
    tenantId: TENANT_ID,
    name: 'Demo Cajera',
    pinHash: bcrypt.hashSync('1234', 4), // cost bajo para velocidad de test
    role: 'pos_cashier',
    isActive: true,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

interface Mocks {
  posUsers: jest.Mocked<PosUserRepository>;
  tenants: jest.Mocked<TenantRepository>;
  audit: jest.Mocked<AuditLogService>;
}

function makeMocks(user: PosUser | null, posModuleEnabled = true): Mocks {
  return {
    posUsers: {
      findById: jest.fn().mockResolvedValue(null),
      findByTenantAndName: jest.fn().mockResolvedValue(user),
      recordFailedAttempt: jest.fn().mockResolvedValue(undefined),
      recordSuccessfulLogin: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PosUserRepository>,
    tenants: {
      findAll: jest.fn(),
      findById: jest.fn(),
      findFullDetail: jest.fn(),
      setStatus: jest.fn(),
      createAtomic: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      isModuleEnabled: jest.fn().mockResolvedValue(posModuleEnabled),
    } as unknown as jest.Mocked<TenantRepository>,
    audit: {
      log: jest.fn(),
    } as unknown as jest.Mocked<AuditLogService>,
  };
}

function makeSvc(mocks: Mocks): PosAuthService {
  const jwt = new JwtService(SECRET, 60);
  return new PosAuthService(mocks.posUsers, mocks.tenants, jwt, mocks.audit, 5, 15, silentLogger);
}

describe('PosAuthService', () => {
  it('login OK → devuelve token con scope=pos y registra audit success', async () => {
    const user = makePinUser();
    const mocks = makeMocks(user);
    const svc = makeSvc(mocks);

    const result = await svc.login({ tenantId: TENANT_ID, name: 'Demo Cajera', pin: '1234' });

    expect(result.token.split('.')).toHaveLength(3);
    expect(result.user).toEqual({
      id: USER_ID,
      displayName: 'Demo Cajera',
      role: 'pos_cashier',
      tenantId: TENANT_ID,
    });
    expect(mocks.posUsers.recordSuccessfulLogin).toHaveBeenCalledWith(USER_ID);
    expect(mocks.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'pos.auth.login.success',
        adminId: null,
        adminEmail: `pos:Demo Cajera@${TENANT_ID}`,
      }),
    );
  });

  it('module_disabled → 403 sin tocar bcrypt', async () => {
    const mocks = makeMocks(null, /* posModuleEnabled */ false);
    const svc = makeSvc(mocks);

    await expect(
      svc.login({ tenantId: TENANT_ID, name: 'X', pin: '1234' }),
    ).rejects.toMatchObject({ code: 'module_disabled' });
    expect(mocks.posUsers.findByTenantAndName).not.toHaveBeenCalled();
    expect(mocks.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'pos.auth.login.module_disabled' }),
    );
  });

  it('not_found → 401 timing-safe (gasta bcrypt aunque user no exista)', async () => {
    const mocks = makeMocks(null);
    const svc = makeSvc(mocks);

    await expect(
      svc.login({ tenantId: TENANT_ID, name: 'Ghost', pin: '1234' }),
    ).rejects.toBeInstanceOf(PosAuthError);
    expect(mocks.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'pos.auth.login.not_found' }),
    );
  });

  it('locked → 429 sin tocar bcrypt', async () => {
    const lockedUser = makePinUser({
      lockedUntil: new Date(Date.now() + 10 * 60_000),
    });
    const mocks = makeMocks(lockedUser);
    const svc = makeSvc(mocks);

    await expect(
      svc.login({ tenantId: TENANT_ID, name: 'Demo Cajera', pin: '1234' }),
    ).rejects.toMatchObject({ code: 'locked' });
    expect(mocks.posUsers.recordFailedAttempt).not.toHaveBeenCalled();
    expect(mocks.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'pos.auth.login.locked' }),
    );
  });

  it('inactive → PosAuthError code inactive', async () => {
    const inactive = makePinUser({ isActive: false });
    const mocks = makeMocks(inactive);
    const svc = makeSvc(mocks);

    await expect(
      svc.login({ tenantId: TENANT_ID, name: 'Demo Cajera', pin: '1234' }),
    ).rejects.toMatchObject({ code: 'inactive' });
  });

  it('PIN incorrecto → invalid_pin + incrementa failed_attempts sin lockout (intento 1 de 5)', async () => {
    const user = makePinUser({ failedAttempts: 0 });
    const mocks = makeMocks(user);
    const svc = makeSvc(mocks);

    await expect(
      svc.login({ tenantId: TENANT_ID, name: 'Demo Cajera', pin: '9999' }),
    ).rejects.toMatchObject({ code: 'invalid_pin' });

    expect(mocks.posUsers.recordFailedAttempt).toHaveBeenCalledWith(USER_ID, null);
    expect(mocks.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'pos.auth.login.fail' }),
    );
  });

  it('PIN incorrecto al 5° intento → activa lockout (locked_until ~now+15min)', async () => {
    const user = makePinUser({ failedAttempts: 4 });
    const mocks = makeMocks(user);
    const svc = makeSvc(mocks);

    const before = Date.now();
    await expect(
      svc.login({ tenantId: TENANT_ID, name: 'Demo Cajera', pin: '9999' }),
    ).rejects.toMatchObject({ code: 'invalid_pin' });

    expect(mocks.posUsers.recordFailedAttempt).toHaveBeenCalledTimes(1);
    const [, lockUntilArg] = mocks.posUsers.recordFailedAttempt.mock.calls[0];
    expect(lockUntilArg).toBeInstanceOf(Date);
    const lockMs = (lockUntilArg as Date).getTime() - before;
    // Tolerancia razonable: entre 14 y 16 minutos
    expect(lockMs).toBeGreaterThanOrEqual(14 * 60_000);
    expect(lockMs).toBeLessThanOrEqual(16 * 60_000);

    expect(mocks.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'pos.auth.login.locked' }),
    );
  });
});
