/**
 * Hook personalizado para obtener sesión del usuario
 * Agrega tipo seguro y manejo de estados
 */

'use client';

import { useSession } from 'next-auth/react';
import { AuthUser, UserRole } from '@/lib/types';

export function useAuth() {
  const { data: session, status, update } = useSession();

  const user = session?.user as AuthUser | null;
  const isLoading = status === 'loading';
  const isAuthenticated = status === 'authenticated';

  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;
  const isAdminOperator = user?.role === UserRole.ADMIN_OPERATOR;

  return {
    user,
    isLoading,
    isAuthenticated,
    isSuperAdmin,
    isAdminOperator,
    update,
    status,
  };
}

