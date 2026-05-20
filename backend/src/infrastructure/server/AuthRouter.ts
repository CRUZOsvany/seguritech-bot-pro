import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import type pino from 'pino';
import { config } from '@/config/env';
import { JwtService } from '@/infrastructure/auth/JwtService';
import type { AdminUsersRepository } from '@/domain/ports/AdminUsersRepository';
import type { AdminSessionsRepository } from '@/domain/ports/AdminSessionsRepository';
import type { LoginAttemptsRepository } from '@/domain/ports/LoginAttemptsRepository';
import type { AuditLogService } from '@/infrastructure/services/AuditLogService';

const LoginSchema = z.object({
  email: z.string().email().max(120),
  password: z.string().min(8).max(200),
  totpCode: z.string().regex(/^\d{6}$/).optional(),
});

/**
 * Cambio de contraseña: re-valida con currentPassword (no requiere cookie de
 * sesión, para poder cubrir el caso must_change_password=true del primer login).
 */
const ChangePasswordSchema = z.object({
  email: z.string().email().max(120),
  currentPassword: z.string().min(8).max(200),
  newPassword: z
    .string()
    .min(12)
    .max(200)
    .regex(/[A-Z]/, 'Falta mayúscula')
    .regex(/[a-z]/, 'Falta minúscula')
    .regex(/[0-9]/, 'Falta número'),
});

const DUMMY_BCRYPT_HASH = '$2a$12$' + 'x'.repeat(53);

export function createAuthRouter(params: {
  jwt: JwtService;
  adminUsers: AdminUsersRepository;
  sessions: AdminSessionsRepository;
  attempts: LoginAttemptsRepository;
  audit: AuditLogService;
  requireAdmin: (req: Request, res: Response, next: NextFunction) => void | Promise<void>;
  logger: pino.Logger;
}): Router {
  const { jwt, adminUsers, sessions, attempts, audit, requireAdmin, logger } = params;
  const router = Router();

  // Rate limit estricto: 5 intentos por IP cada 15 min. Suma con el lockout
  // por cuenta (5 fallos en 15 min → 429 incluso en una IP fresca).
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: config.admin.loginMaxAttempts,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados intentos. Intenta en 15 minutos.' },
  });

  // ----------------------------------------------------------------------
  // POST /api/auth/login
  // ----------------------------------------------------------------------
  router.post('/login', loginLimiter, async (req: Request, res: Response) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Email y password requeridos' });
      return;
    }
    const { email, password, totpCode } = parsed.data;
    const ip = String(req.ip ?? '');
    const userAgent = String(req.headers['user-agent'] ?? '');

    // Lockout por cuenta
    const recentFails = await attempts.countFailed(email, config.admin.loginLockoutMinutes);
    if (recentFails >= config.admin.loginMaxAttempts) {
      await attempts.record({ email, ip, success: false });
      logger.warn({ email, ip }, '🔒 Login bloqueado por lockout');
      audit.log({
        adminEmail: email,
        action: 'auth.login.locked',
        ip,
        userAgent,
      });
      res.status(429).json({
        error: `Cuenta bloqueada temporalmente. Espera ${config.admin.loginLockoutMinutes} minutos.`,
      });
      return;
    }

    const user = await adminUsers.findByEmail(email);
    if (!user) {
      // Timing-safe: gastamos bcrypt aunque no exista el user.
      await bcrypt.compare(password, DUMMY_BCRYPT_HASH);
      await attempts.record({ email, ip, success: false });
      audit.log({ adminEmail: email, action: 'auth.login.fail', ip, userAgent });
      res.status(401).json({ error: 'Credenciales inválidas' });
      return;
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      await attempts.record({ email, ip, success: false });
      audit.log({
        adminId: user.id,
        adminEmail: email,
        action: 'auth.login.fail',
        ip,
        userAgent,
      });
      res.status(401).json({ error: 'Credenciales inválidas' });
      return;
    }

    // 2FA (si está habilitado — V2.1 backlog, totp_enabled=false en seed)
    if (user.totp_enabled) {
      if (!totpCode) {
        res.status(401).json({ error: '2FA_REQUIRED' });
        return;
      }
      // TODO V2.1: implementar verificación TOTP real con totp_secret_decrypted.
      // Por ahora rechazamos si totp_enabled=true para forzar la implementación
      // antes de habilitar 2FA en producción.
      logger.error({ email }, '2FA enabled pero verificación no implementada');
      res.status(501).json({ error: '2FA no implementado todavía (backlog V2.1)' });
      return;
    }

    await attempts.record({ email, ip, success: true });

    if (user.must_change_password) {
      audit.log({
        adminId: user.id,
        adminEmail: email,
        action: 'auth.login.must_change_password',
        ip,
        userAgent,
      });
      res.status(200).json({ mustChangePassword: true });
      return;
    }

    const { token, jti, exp } = jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenant_id,
    });

    res.cookie(config.admin.cookieName, token, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'strict',
      path: '/',
      maxAge: (exp - Math.floor(Date.now() / 1000)) * 1000,
    });

    audit.log({
      adminId: user.id,
      adminEmail: email,
      action: 'auth.login.success',
      ip,
      userAgent,
      metadata: { jti, role: user.role },
    });

    res.json({
      ok: true,
      user: { email: user.email, name: user.name, role: user.role },
    });
  });

  // ----------------------------------------------------------------------
  // POST /api/auth/logout
  // ----------------------------------------------------------------------
  router.post('/logout', requireAdmin, async (req: Request, res: Response) => {
    if (req.admin?.jti) {
      const exp = new Date((req.admin.exp ?? 0) * 1000);
      try {
        await sessions.revoke(req.admin.jti, req.admin.sub || null, exp);
      } catch (err) {
        logger.error({ err, jti: req.admin.jti }, 'logout revoke failed');
      }
      audit.log({
        adminId: req.admin.sub,
        adminEmail: req.admin.email,
        action: 'auth.logout',
        ip: String(req.ip ?? ''),
      });
    }
    res.clearCookie(config.admin.cookieName, { path: '/' });
    res.json({ ok: true });
  });

  // ----------------------------------------------------------------------
  // GET /api/auth/me
  // ----------------------------------------------------------------------
  router.get('/me', requireAdmin, (req: Request, res: Response) => {
    if (!req.admin) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    res.json({
      email: req.admin.email,
      role: req.admin.role,
      tenantId: req.admin.tenantId,
    });
  });

  // ----------------------------------------------------------------------
  // POST /api/auth/change-password
  // Re-valida currentPassword (no requiere cookie). Cubre must_change_password.
  // Rate limited igual que /login.
  // ----------------------------------------------------------------------
  router.post('/change-password', loginLimiter, async (req: Request, res: Response) => {
    const parsed = ChangePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      res.status(400).json({ error: `${first.path.join('.')}: ${first.message}` });
      return;
    }
    const { email, currentPassword, newPassword } = parsed.data;
    const ip = String(req.ip ?? '');
    const userAgent = String(req.headers['user-agent'] ?? '');

    const user = await adminUsers.findByEmail(email);
    if (!user) {
      await bcrypt.compare(currentPassword, DUMMY_BCRYPT_HASH);
      res.status(401).json({ error: 'Credenciales inválidas' });
      return;
    }
    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) {
      await attempts.record({ email, ip, success: false });
      audit.log({
        adminId: user.id,
        adminEmail: email,
        action: 'auth.password.change.fail',
        ip,
        userAgent,
      });
      res.status(401).json({ error: 'Credenciales inválidas' });
      return;
    }

    if (currentPassword === newPassword) {
      res.status(400).json({ error: 'La nueva contraseña debe ser distinta' });
      return;
    }

    const newHash = await bcrypt.hash(newPassword, config.admin.bcryptCost);
    await adminUsers.updatePassword(user.id, newHash);
    audit.log({
      adminId: user.id,
      adminEmail: email,
      action: 'auth.password.change.success',
      ip,
      userAgent,
    });

    res.json({ ok: true });
  });

  return router;
}
