/**
 * Página de error de autenticación
 */

'use client';

import { Button } from '@/components/ui/Button';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { Suspense } from 'react';

function AuthErrorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get('error') || 'Ocurrió un error';

  return (
    <div className="w-full max-w-md p-4">
      <div className="bg-white rounded-lg shadow-xl p-8">
        {/* Icon */}
        <div className="text-center mb-8">
          <div className="text-red-500 mb-4" style={{ fontSize: '3rem' }}>
            ⚠️
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Error de Autenticación</h1>
          <p className="text-gray-600">{error}</p>
        </div>

        {/* Button */}
        <Button
          onClick={() => router.push('/auth/login')}
          variant="primary"
          size="lg"
          className="w-full"
        >
          Volver al Login
        </Button>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <AuthErrorContent />
    </Suspense>
  );
}

