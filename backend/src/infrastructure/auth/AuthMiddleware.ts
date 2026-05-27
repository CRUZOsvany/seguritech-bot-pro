import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import type pino from 'pino';
import { JwtService, AdminJwtPayload } from './JwtService';
import type { AdminSessionsRepository } from '@/domain/ports/AdminSessionsRepository';

declare global {
   
  namespace Express {
    interface Request {
      admin?: AdminJwtPayload;
    }
  }
}

interface AuthMiddlewareParams {
  jwt: JwtService;
  sessions: AdminSessionsRepository;
  cookieName: string;
  /** Si vacío, deshabilita el camino x-api-key. */
  apiKey: string;
  /** Si vacío, deshabilita el camino Cloudflare Access. */
  cloudflareAllowedDomain: string;
  logger: pino.Logger;
}

/**
 * Valida sesión admin. 3 caminos en orden de preferencia:
 *   1) Cookie con JWT firmado por NOSOTROS (camino principal del panel)
 *   2) Cloudflare Access (Cf-Access-Authenticated-User-Email) — en prod
 *   3) x-api-key — para CLI/curl/scripts
 *
 * Adjunta req.admin con el payload del JWT.
 * 401 si nada aplica.
 *
 * NOTA: el bypass loopback (NODE_ENV=development + 127.0.0.1) fue removido
 * en Sprint F. Ahora dev también necesita login real.
 */
export function createAuthMiddleware(params: AuthMiddlewareParams) {
  const { jwt, sessions, cookieName, apiKey, cloudflareAllowedDomain, logger } = params;

  return async function requireAdmin(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    // 1) Cookie JWT (sólo scope=admin; tokens con scope=pos los rechaza
    //    el overload con un throw y caen al siguiente camino auth)
    const cookieToken = parseCookie(req.headers.cookie, cookieName);
    if (cookieToken) {
      try {
        const payload = jwt.verify(cookieToken, 'admin');
        const isRevoked = await sessions.isRevoked(payload.jti);
        if (isRevoked) {
          logger.warn(
            { jti: payload.jti, email: payload.email },
            'JWT revocado intentó usar',
          );
          res.status(401).json({ error: 'Sesión revocada' });
          return;
        }
        req.admin = payload;
        return next();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.debug({ err: msg }, 'JWT cookie inválido');
        // Damos chance a CF Access / API key
      }
    }

    // 2) Cloudflare Access (en prod, detrás de CF)
    const cfEmail = req.headers['cf-access-authenticated-user-email'];
    if (typeof cfEmail === 'string' && cloudflareAllowedDomain) {
      const suffix = '@' + cloudflareAllowedDomain.toLowerCase();
      if (cfEmail.toLowerCase().endsWith(suffix)) {
        req.admin = {
          sub: '',
          email: cfEmail,
          role: 'super_admin',
          tenantId: null,
          jti: '',
          iat: 0,
          exp: 0,
        };
        return next();
      }
    }

    // 3) x-api-key (CLI). Timing-safe equal.
    const provided = req.headers['x-api-key'];
    if (apiKey && typeof provided === 'string' && provided.length === apiKey.length) {
      const a = Buffer.from(provided);
      const b = Buffer.from(apiKey);
      if (crypto.timingSafeEqual(a, b)) {
        req.admin = {
          sub: 'cli',
          email: 'cli@seguritech',
          role: 'super_admin',
          tenantId: null,
          jti: '',
          iat: 0,
          exp: 0,
        };
        return next();
      }
    }

    res.status(401).json({ error: 'Unauthorized' });
  };
}

/**
 * RBAC: exige rol específico. Usar después de requireAdmin.
 */
export function requireRole(role: 'super_admin' | 'admin_operator') {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.admin) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (role === 'super_admin' && req.admin.role !== 'super_admin') {
      res.status(403).json({ error: 'Requiere super_admin' });
      return;
    }
    next();
  };
}

/**
 * Si el admin es operator, solo puede tocar SU tenant.
 * Aplicar en routes con :id.
 */
export function requireTenantScope(req: Request, res: Response, next: NextFunction): void {
  if (!req.admin) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (req.admin.role === 'super_admin') {
    next();
    return;
  }
  const requested = String(req.params.id ?? '');
  if (!req.admin.tenantId || req.admin.tenantId !== requested) {
    res.status(403).json({ error: 'No autorizado para este tenant' });
    return;
  }
  next();
}

/**
 * Requiere que la sesión venga por cookie JWT (no x-api-key ni CF Access).
 * Útil para endpoints sensibles como rotar credenciales Meta.
 */
export function requireCookieSession(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.admin || !req.admin.jti) {
    res.status(403).json({ error: 'Requiere sesión cookie (no API key ni CF Access)' });
    return;
  }
  next();
}

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (k === name) return decodeURIComponent(part.slice(idx + 1));
  }
  return null;
}
