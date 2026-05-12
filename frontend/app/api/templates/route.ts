import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authConfig } from '@/lib/auth';
import { backendAdmin } from '@/lib/backend-admin';

export async function GET() {
  const session = await getServerSession(authConfig) as any;
  if (!session?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  const templates = await backendAdmin.getTemplates();
  return NextResponse.json({ templates });
}
