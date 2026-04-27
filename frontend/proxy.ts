/**
 * Proxy/Middleware de autenticación y autorización (Next.js 16)
 * Protege rutas según rol del usuario y tenantId
 * 
 * Aplicable a los grupos de rutas:
 * - (dashboard)/dashboard/*
 * - (dashboard)/admin/*
 * - (dashboard)/clients/*
 */

import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@/lib/types';

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Rutas públicas (no requieren autenticación)
  const publicRoutes = ['/auth/login', '/auth/error', '/'];
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));

  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Obtener token de sesión
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // Usuario no autenticado
  if (!token) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Protección por rol
  
  // Rutas solo para SuperAdmin
  if (pathname.startsWith('/admin')) {
    if (token.role !== UserRole.SUPER_ADMIN) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // Rutas de dashboard requieren admin_operator o super_admin
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/clients')) {
    if (
      token.role !== UserRole.ADMIN_OPERATOR &&
      token.role !== UserRole.SUPER_ADMIN
    ) {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }
  }

  // Protección por tenantId en rutas específicas
  // Si la ruta contiene /clients/[tenantId], validar acceso
  const clientMatch = pathname.match(/\/clients\/([a-f0-9-]+)/);
  if (clientMatch) {
    const requestedTenantId = clientMatch[1];
    
    // SuperAdmin puede acceder a cualquier tenant
    if (token.role === UserRole.SUPER_ADMIN) {
      return NextResponse.next();
    }

    // AdminOperador solo puede acceder a sus tenants
    if (
      token.role === UserRole.ADMIN_OPERATOR &&
      token.tenantId !== requestedTenantId
    ) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // Pasar al siguiente middleware o ruta
  return NextResponse.next();
}

/**
 * Configurar qué rutas usar el middleware
 */
export const config = {
  matcher: [
    // Incluir todas las rutas protegidas
    '/dashboard/:path*',
    '/clients/:path*',
    '/admin/:path*',
    // Excluir archivos estáticos y API
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};

