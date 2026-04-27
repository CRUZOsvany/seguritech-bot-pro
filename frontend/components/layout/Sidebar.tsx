/**
 * Sidebar de navegación con rutas según rol
 */

'use client';

import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@/lib/types';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React from 'react';

interface NavItem {
  label: string;
  href: string;
  icon: string;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: '📊',
    roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN_OPERATOR],
  },
  {
    label: 'Clientes',
    href: '/clients',
    icon: '👥',
    roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN_OPERATOR],
  },
  {
    label: 'Facturaciónción',
    href: '/admin/billing',
    icon: '💳',
    roles: [UserRole.SUPER_ADMIN],
  },
  {
    label: 'Administradores',
    href: '/admin/users',
    icon: '🔑',
    roles: [UserRole.SUPER_ADMIN],
  },
  {
    label: 'Auditoría',
    href: '/admin/audit',
    icon: '📋',
    roles: [UserRole.SUPER_ADMIN],
  },
];

export const Sidebar: React.FC = () => {
  const { user, isSuperAdmin, isAdminOperator } = useAuth();
  const pathname = usePathname();

  // Filtrar items según rol del usuario
  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(user?.role as UserRole));

  return (
    <aside className="w-64 bg-gray-900 text-gray-100 min-h-screen border-r border-gray-800 flex flex-col sticky top-0">
      <nav className="flex-1 px-4 py-6">
        <div className="space-y-1">
          {visibleItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="px-4 py-6 border-t border-gray-800">
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-400 mb-2">Versión del Panel</p>
          <p className="text-sm font-semibold text-gray-200">1.0.0</p>
        </div>
      </div>
    </aside>
  );
};

