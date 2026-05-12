import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authConfig } from '@/lib/auth';
import { backendAdmin } from '@/lib/backend-admin';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authConfig) as any;
  if (!session?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  const { id } = await params;
  const { status } = await request.json();
  if (!['active', 'paused'].includes(status)) {
    return NextResponse.json(
      { error: 'status debe ser "active" o "paused"' },
      { status: 400 },
    );
  }
  const result = await backendAdmin.setStatus(id, status);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
