import crypto from 'crypto';

/**
 * JWT propio HS256. Sin librerías porque ~80 líneas auditables a ojo cubren el
 * 100% del caso del panel admin. Si necesitas más algoritmos (RS256, EdDSA),
 * cambia a `jose`.
 *
 * El payload incluye `jti` (JWT ID) para permitir revocación server-side
 * vía denylist (admin_sessions_revoked).
 *
 * Sprint 5.1a: agregada unión discriminada por `scope` para soportar dos tipos
 * de sesión sobre el mismo JwtService:
 *   - scope='admin' (o undefined, retrocompat): panel admin con email+role
 *   - scope='pos'  : cajero POS con displayName+role pos_*
 *
 * verify() está sobrecargado: pasa el scope esperado para que TS narrow al
 * tipo concreto (AdminJwtPayload o PosJwtPayload). Sin argumento devuelve la
 * unión y debes narrow tú con `payload.scope`.
 */

const b64url = {
  encode(buf: Buffer | string): string {
    const b = typeof buf === 'string' ? Buffer.from(buf) : buf;
    return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(s: string): Buffer {
    const pad = 4 - (s.length % 4 || 4);
    const padded = s + '='.repeat(pad === 4 ? 0 : pad);
    return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  },
};

export interface AdminJwtPayload {
  sub: string; // admin_user.id
  email: string;
  role: 'super_admin' | 'admin_operator';
  tenantId: string | null; // null para super_admin
  /** Marca el scope. Opcional por retrocompat — tokens viejos no tienen este claim. */
  scope?: 'admin';
  jti: string; // JWT ID para revocación
  iat: number;
  exp: number;
}

export interface PosJwtPayload {
  sub: string; // pos_users.id
  /** Cajeros no tienen email; se loguea displayName en auditoría. */
  displayName: string;
  role: 'pos_cashier' | 'pos_manager';
  /** Siempre presente — un cajero pertenece a un tenant específico. */
  tenantId: string;
  scope: 'pos';
  jti: string;
  iat: number;
  exp: number;
}

export type SessionJwtPayload = AdminJwtPayload | PosJwtPayload;

type SignableAdminPayload = Omit<AdminJwtPayload, 'iat' | 'exp' | 'jti'>;
type SignablePosPayload = Omit<PosJwtPayload, 'iat' | 'exp' | 'jti'>;
type SignablePayload = SignableAdminPayload | SignablePosPayload;

export class JwtService {
  private readonly secret: Buffer;
  private readonly ttlSeconds: number;

  constructor(secret: string, ttlSeconds: number) {
    if (!secret || secret.length < 64) {
      throw new Error('ADMIN_JWT_SECRET requerido (>=64 chars)');
    }
    this.secret = Buffer.from(secret, 'utf8');
    this.ttlSeconds = ttlSeconds;
  }

  sign(payload: SignablePayload): {
    token: string;
    jti: string;
    exp: number;
  } {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + this.ttlSeconds;
    const jti = crypto.randomBytes(16).toString('hex');
    const full = { ...payload, iat: now, exp, jti } as SessionJwtPayload;

    const header = b64url.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = b64url.encode(JSON.stringify(full));
    const signingInput = `${header}.${body}`;
    const sig = crypto.createHmac('sha256', this.secret).update(signingInput).digest();
    return { token: `${signingInput}.${b64url.encode(sig)}`, jti, exp };
  }

  /**
   * Verifica firma + exp. NO consulta la denylist (eso lo hace el middleware
   * para no acoplar esta clase a Supabase).
   *
   * Sobrecargas:
   * - verify(token): devuelve SessionJwtPayload (unión). Narrow tú con .scope.
   * - verify(token, 'admin'): devuelve AdminJwtPayload. Lanza si el token es pos.
   * - verify(token, 'pos'):   devuelve PosJwtPayload.   Lanza si el token es admin.
   */
  verify(token: string): SessionJwtPayload;
  verify(token: string, expectedScope: 'admin'): AdminJwtPayload;
  verify(token: string, expectedScope: 'pos'): PosJwtPayload;
  verify(token: string, expectedScope?: 'admin' | 'pos'): SessionJwtPayload {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('JWT malformado');
    const [h, b, s] = parts;

    const expectedSig = crypto.createHmac('sha256', this.secret).update(`${h}.${b}`).digest();
    const providedSig = b64url.decode(s);
    if (
      expectedSig.length !== providedSig.length ||
      !crypto.timingSafeEqual(expectedSig, providedSig)
    ) {
      throw new Error('Firma inválida');
    }

    const payload = JSON.parse(b64url.decode(b).toString('utf8')) as SessionJwtPayload;
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) throw new Error('JWT expirado');

    if (expectedScope) {
      const actual = payload.scope ?? 'admin';
      if (actual !== expectedScope) {
        throw new Error(`Scope inválido: esperado ${expectedScope}, recibido ${actual}`);
      }
    }
    return payload;
  }
}
