import { Request, Response, NextFunction } from 'express';

/** Middleware genérico (sync o async). */
export type Mw = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

/** Contexto de auditoría derivado de la sesión admin de la request. */
export interface AdminAuditContext {
  adminId: string | null;
  adminEmail: string;
  ip: string;
  userAgent: string;
}

/**
 * Extrae el contexto de auditoría (quién, desde dónde) de una request admin.
 * Compartido por todos los sub-routers para loguear en admin_audit_log.
 */
export const ctx = (req: Request): AdminAuditContext => ({
  adminId: req.admin?.sub || null,
  adminEmail: req.admin?.email || 'unknown',
  ip: String(req.ip ?? ''),
  userAgent: String(req.headers['user-agent'] ?? ''),
});

/** Normaliza un error desconocido a string para respuestas/logs. */
export const errMsg = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);
