/**
 * Página principal del dashboard
 * Muestra tabla de clientes con estado, métricas y acciones
 */

'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/hooks/useAuth';
import { Tenant, TenantStatus } from '@/lib/types';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';

interface ClientWithMetrics extends Tenant {
  monto_mensual: number;
  fecha_proximo_pago: string | null;
  messages_this_month: number;
}

export default function DashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [clients, setClients] = useState<ClientWithMetrics[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    const fetchClients = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/clients');
        
        if (!response.ok) {
          throw new Error('Error al obtener clientes');
        }

        const data = await response.json();
        setClients(data.data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        setIsLoading(false);
      }
    };

    fetchClients();
  }, [authLoading]);

  const getStatusBadge = (status: TenantStatus) => {
    const badges = {
      [TenantStatus.ACTIVE]: { label: 'Activo', color: 'bg-green-100 text-green-700' },
      [TenantStatus.PAUSED]: { label: 'Pausado', color: 'bg-yellow-100 text-yellow-700' },
      [TenantStatus.UNCONFIGURED]: { label: 'Sin configurar', color: 'bg-gray-100 text-gray-700' },
    };
    const badge = badges[status];
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${badge.color}`}>
        {badge.label}
      </span>
    );
  };

  const isPaymentDue = (date: string | null) => {
    if (!date) return false;
    const paymentDate = new Date(date);
    const today = new Date();
    return paymentDate <= today;
  };

  const totalRevenue = clients.reduce((sum, c) => sum + c.monto_mensual, 0);
  const totalMessages = clients.reduce((sum, c) => sum + c.messages_this_month, 0);
  const activeClients = clients.filter((c) => c.status === TenantStatus.ACTIVE).length;

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-gray-500">⏳ Cargando...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">Bienvenido, {user?.name}</p>
        </div>
        <Link href="/clients/new">
          <Button variant="primary" size="lg">
            + Nuevo Cliente
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <div className="text-center">
            <p className="text-gray-600 text-sm">Clientes Activos</p>
            <p className="text-4xl font-bold text-blue-600 mt-2">{activeClients}</p>
            <p className="text-xs text-gray-500 mt-1">de {clients.length} totales</p>
          </div>
        </Card>

        <Card>
          <div className="text-center">
            <p className="text-gray-600 text-sm">Mensajes Este Mes</p>
            <p className="text-4xl font-bold text-green-600 mt-2">{totalMessages}</p>
            <p className="text-xs text-gray-500 mt-1">conversaciones procesadas</p>
          </div>
        </Card>

        <Card>
          <div className="text-center">
            <p className="text-gray-600 text-sm">Ingresos Proyectados</p>
            <p className="text-3xl font-bold text-purple-600 mt-2">${totalRevenue.toFixed(2)}</p>
            <p className="text-xs text-gray-500 mt-1">este mes</p>
          </div>
        </Card>
      </div>

      {/* Clients Table */}
      <Card>
        <h2 className="text-xl font-bold text-gray-900 mb-4">Clientes</h2>

        {clients.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">No hay clientes aún</p>
            <Link href="/clients/new">
              <Button variant="primary">Crear Primer Cliente</Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-gray-700">Nombre</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-700">Estado</th>
                  <th className="px-6 py-3 text-center font-semibold text-gray-700">Mensajes/Mes</th>
                  <th className="px-6 py-3 text-center font-semibold text-gray-700">Próximo Pago</th>
                  <th className="px-6 py-3 text-right font-semibold text-gray-700">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {clients.map((client) => (
                  <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-semibold text-gray-900">{client.nombre_negocio}</p>
                        <p className="text-xs text-gray-500">{client.giro}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(client.status)}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="font-semibold text-gray-900">{client.messages_this_month}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {client.fecha_proximo_pago && (
                          <>
                            <span className="text-gray-900">
                              {new Date(client.fecha_proximo_pago).toLocaleDateString('es-MX')}
                            </span>
                            {isPaymentDue(client.fecha_proximo_pago) && (
                              <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold">
                                VENCIDO
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link href={`/clients/${client.id}`}>
                        <Button variant="ghost" size="sm">
                          Editar
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

