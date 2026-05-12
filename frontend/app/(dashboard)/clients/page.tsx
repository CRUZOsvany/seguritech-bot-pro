'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/hooks/useAuth';
import { TenantStatus } from '@/lib/types';
import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';

interface ClientRow {
  id: string;
  nombre_negocio: string;
  giro: string;
  status: TenantStatus;
  webhook_verified: boolean;
  has_active_flow: boolean;
  template_slug: string | null;
  monto_mensual: number;
  fecha_proximo_pago: string | null;
  messages_this_month: number;
}

const GIRO_ICONS: Record<string, string> = {
  ferreteria: '🔧', papeleria: '📚', cerrajeria: '🔐',
  pizzeria: '🍕', salon: '💇', medico: '🏥',
  refaccionaria: '🚗', farmacia: '💊', otro: '🏢',
};

const STATUS_CONFIG: Record<TenantStatus, { label: string; color: string }> = {
  [TenantStatus.ACTIVE]:       { label: 'Activo',         color: 'bg-green-100 text-green-700' },
  [TenantStatus.PAUSED]:       { label: 'Pausado',        color: 'bg-yellow-100 text-yellow-700' },
  [TenantStatus.UNCONFIGURED]: { label: 'Sin configurar', color: 'bg-gray-100 text-gray-600' },
};

export default function ClientsPage() {
  const { isLoading: authLoading } = useAuth();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchClients = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch('/api/clients');
      if (!res.ok) throw new Error('Error al cargar clientes');
      const data = await res.json();
      setClients(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading) fetchClients();
  }, [authLoading, fetchClients]);

  const toggleStatus = async (client: ClientRow) => {
    const newStatus = client.status === TenantStatus.ACTIVE ? 'paused' : 'active';
    if (!window.confirm(`¿${newStatus === 'paused' ? 'Pausar' : 'Activar'} el bot de ${client.nombre_negocio}?`)) return;
    setActionLoading(`status-${client.id}`);
    try {
      const res = await fetch(`/api/tenants/${client.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Error actualizando estado');
      await fetchClients();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    } finally {
      setActionLoading(null);
    }
  };

  if (authLoading || isLoading) {
    return <div className="flex items-center justify-center p-12"><p className="text-gray-500">⏳ Cargando clientes...</p></div>;
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-700">{error}</p>
        <Button variant="ghost" size="sm" onClick={fetchClients} className="mt-2">Reintentar</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Clientes</h1>
          <p className="text-gray-500 mt-1">{clients.length} negocios registrados</p>
        </div>
        <Link href="/clients/new">
          <Button variant="primary" size="lg">+ Nuevo Cliente</Button>
        </Link>
      </div>
      <Card>
        {clients.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-4xl mb-4">🏢</p>
            <p className="text-gray-500 mb-4">No hay clientes registrados aún</p>
            <Link href="/clients/new"><Button variant="primary">Crear Primer Cliente</Button></Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Negocio</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Estado</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Molde</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-700">Mensajes</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-700">Pago</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {clients.map((client) => {
                  const statusCfg = STATUS_CONFIG[client.status];
                  const isPaymentDue = client.fecha_proximo_pago
                    ? new Date(client.fecha_proximo_pago) <= new Date() : false;
                  return (
                    <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{GIRO_ICONS[client.giro] ?? '🏢'}</span>
                          <div>
                            <p className="font-semibold text-gray-900">{client.nombre_negocio}</p>
                            <p className="text-xs text-gray-500 capitalize">{client.giro}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusCfg.color}`}>
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {client.has_active_flow ? (
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                            ✅ {client.template_slug ?? 'Activo'}
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-semibold">
                            ⚠️ Sin molde
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700 font-semibold">{client.messages_this_month}</td>
                      <td className="px-4 py-3 text-center">
                        {client.fecha_proximo_pago ? (
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-gray-700">{new Date(client.fecha_proximo_pago).toLocaleDateString('es-MX')}</span>
                            {isPaymentDue && <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-xs font-bold">VENCIDO</span>}
                          </div>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant={client.status === TenantStatus.ACTIVE ? 'secondary' : 'primary'}
                            size="sm"
                            isLoading={actionLoading === `status-${client.id}`}
                            onClick={() => toggleStatus(client)}
                          >
                            {client.status === TenantStatus.ACTIVE ? 'Pausar' : 'Activar'}
                          </Button>
                          <Link href={`/clients/${client.id}`}>
                            <Button variant="ghost" size="sm">Ver →</Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
