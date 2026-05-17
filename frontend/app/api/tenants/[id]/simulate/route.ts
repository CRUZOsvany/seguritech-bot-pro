/**
 * API Route: simulador del bot para un tenant.
 * POST /api/tenants/:id/simulate          → ejecuta un turno simulado
 * POST /api/tenants/:id/simulate/reset    → resetea el estado del user simulado
 *
 * Auth: requiere sesión NextAuth (super_admin o admin_operator del tenant).
 */

import { getServerSession } from 'next-auth';
import { authConfig } from '@/lib/auth';
import { backendAdmin } from '@/lib/backend-admin';
import { UserRole } from '@/lib/types';
import { NextRequest, NextResponse } from 'next/server';

async function authorize(request: NextRequest, tenantId: string) {
  const session = (await getServerSession(authConfig)) as
    | { user?: { role?: UserRole; tenantId?: string } }
    | null;

  if (!session?.user) {
    return { error: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) };
  }

  const role = session.user.role;
  if (role === UserRole.SUPER_ADMIN) return { session };

  if (role === UserRole.ADMIN_OPERATOR && session.user.tenantId === tenantId) {
    return { session };
  }

  return {
    error: NextResponse.json({ error: 'Sin permisos para este tenant' }, { status: 403 }),
  };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: tenantId } = await context.params;
  const url = new URL(request.url);
  const isReset = url.pathname.endsWith('/reset');

  const auth = await authorize(request, tenantId);
  if ('error' in auth) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));

    if (isReset) {
      const phoneNumber = String(body.phoneNumber ?? '');
      if (!phoneNumber) {
        return NextResponse.json({ error: 'phoneNumber requerido' }, { status: 400 });
      }
      const res = await backendAdmin.simulateReset({ tenantId, phoneNumber });
      if (res.error) {
        return NextResponse.json({ error: res.error }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    const phoneNumber = String(body.phoneNumber ?? '');
    const content = String(body.content ?? '');
    const persist = body.persist === true;

    if (!phoneNumber || !content) {
      return NextResponse.json(
        { error: 'phoneNumber y content son requeridos' },
        { status: 400 },
      );
    }

    const res = await backendAdmin.simulate({ tenantId, phoneNumber, content, persist });
    if (res.error || !res.data) {
      return NextResponse.json({ error: res.error ?? 'Sin datos' }, { status: 500 });
    }
    return NextResponse.json(res.data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
