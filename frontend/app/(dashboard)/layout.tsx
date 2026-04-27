/**
 * Layout para dashboard
 * Incluye Header y Sidebar
 * Se aplica a todas las rutas bajo (dashboard)
 */

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import React from 'react';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}

