import { Request, Response, NextFunction } from 'express';
import type pino from 'pino';
import type { JwtService, PosJwtPayload } from './JwtService';
import type { AdminSessionsRepository } from '@/domain/ports/AdminSessionsRepository';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      posUser?: PosJwtPayload;
    }
  }
}

interface PosAuthMiddlewareParams {
  jwt: JwtService;
  sessions: AdminSessionsRepository;
  posCookieName: string;
  logger: pino.Logger;
}

/**
 * Middleware de auth POS. Cookie-only — los cajeros siempre vienen del
 * navegador, no hay CF Access ni x-api-key.
 *
 * Verifica:
 *   1. Cookie POS presente
 *   2. JWT válido con scope='pos' (overload de JwtService.verify)
 *   3. jti NO está en denylist (admin_sessions_revoked — compartida con admin)
 *
 * Adjunta req.posUser con el payload. 401 si nada aplica.
 *
 * NOTA: el denylist es compartido con admin porque la revocación es por jti
 * independiente del scope (un jti revocado lo es para siempre).
 */
export function createPosAuthMiddleware(params: PosAuthMiddlewareParams) {
  const { jwt, sessions, posCookieName, logger } = params;

  return async function requirePosSession(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const cookieToken = parseCookie(req.headers.cookie, posCookieName);
    if (!cookieToken) {
      res.status(401).json({ error: 'Sesión POS requerida' });
      return;
    }

    try {
      const payload = jwt.verify(cookieToken, 'pos');
      const isRevoked = await sessions.isRevoked(payload.jti);
      if (isRevoked) {
        logger.warn(
          { jti: payload.jti, posUserId: payload.sub },
          'JWT POS revocado intentó usar',
        );
        res.status(401).json({ error: 'Sesión POS revocada' });
        return;
      }
      req.posUser = payload;
      next();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown';
      logger.debug({ err: msg }, 'JWT POS cookie inválido');
      res.status(401).json({ error: 'Sesión POS inválida' });
    }
  };
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
