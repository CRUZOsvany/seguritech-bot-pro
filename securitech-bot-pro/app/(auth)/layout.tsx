/**
 * Layout para páginas de autenticación
 * Proporciona un contenedor sin la barra lateral del dashboard
 */

import React from 'react';

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-800">
      {children}
    </div>
  );
}

