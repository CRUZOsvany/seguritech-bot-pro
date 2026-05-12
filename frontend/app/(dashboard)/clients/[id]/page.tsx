'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Form';
import { TenantStatus } from '@/lib/types';
import { useParams, useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useState } from 'react';

interface TemplateSummary { slug: string; giro: string; nombre: string; descripcion: string | null; }
interface ClientDetail {
  id: string; nombre_negocio: string; giro: string;
  status: TenantStatus; webhook_verified: boolean;
  has_active_flow: boolean; template_slug: string | null;
  monto_mensual: number; fecha_proximo_pago: string | null;
  nombre_dueno: string; whatsapp_dueno: string;
  messages_this_month: number;
}

const STATUS_LABELS: Record<TenantStatus, string> = {
  [TenantStatus.ACTIVE]: '🟢 Activo',
  [TenantStatus.PAUSED]: '🟡 Pausado',
  [TenantStatus.UNCONFIGURED]: '⚪ Sin configurar',
};

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tenantId = String(params.id);
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [selectedSlug, setSelectedSlug] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const fetchClient = useCallback(async () => {
    try {
      setIsLoading(true);
      const [clientsRes, templatesRes] = await Promise.all([fetch('/api/clients'), fetch('/api/templates')]);
      const clientsData = await clientsRes.json();
      const templatesData = await templatesRes.json();
      const found = (clientsData.data || []).find((c: ClientDetail) => c.id === tenantId);
      if (found) { setClient(found); setSelectedSlug(found.template_slug ?? ''); }
      setTemplates(templatesData.templates ?? []);
    } catch { showMsg('error', 'Error cargando datos del cliente'); }
    finally { setIsLoading(false); }
  }, [tenantId]);

  useEffect(() => { fetchClient(); }, [fetchClient]);

  const assignMolde = async () => {
    if (!selectedSlug) { showMsg('error', 'Selecciona un molde'); return; }
    setActionLoading('molde');
    try {
      const res = await fetch(`/api/tenants/${tenantId}/molde`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateSlug: selectedSlug }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      showMsg('success', 'Molde asignado correctamente');
      await fetchClient();
    } catch (err) { showMsg('error', err instanceof Error ? err.message : 'Error asignando molde'); }
    finally { setActionLoading(null); }
  };

  const removeMolde = async () => {
    if (!window.confirm('¿Quitar el molde? El bot usará la FSM genérica hasta que asignes uno nuevo.')) return;
    setActionLoading('remove-molde');
    try {
      const res = await fetch(`/api/tenants/${tenantId}/molde`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error quitando molde');
      showMsg('success', 'Molde removido');
      await fetchClient();
    } catch (err) { showMsg('error', err instanceof Error ? err.message : 'Error'); }
    finally { setActionLoading(null); }
  };

  const toggleStatus = async () => {
    if (!client) return;
    const newStatus = client.status === TenantStatus.ACTIVE ? 'paused' : 'active';
    if (!window.confirm(`¿Deseas ${newStatus === 'paused' ? 'pausar' : 'activar'} el bot de ${client.nombre_negocio}?`)) return;
    setActionLoading('status');
    try {
      const res = await fetch(`/api/tenants/${tenantId}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Error actualizando estado');
      showMsg('success', `Bot ${newStatus === 'paused' ? 'pausado' : 'activado'} correctamente`);
      await fetchClient();
    } catch (err) { showMsg('error', err instanceof Error ? err.message : 'Error'); }
    finally { setActionLoading(null); }
  };

  if (isLoading) return <div className="p-12 text-center text-gray-500">⏳ Cargando...</div>;
  if (!client) return (
    <div className="p-8 text-center">
      <p className="text-gray-500 mb-4">Cliente no encontrado</p>
      <Button variant="ghost" onClick={() => router.push('/clients')}>← Volver</Button>
    </div>
  );

  const templateOptions = [
    { value: '', label: '— Seleccionar molde —' },
    ...templates.map((t) => ({ value: t.slug, label: `${t.nombre} (${t.giro})` })),
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/clients')}>← Clientes</Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{client.nombre_negocio}</h1>
          <p className="text-gray-500 capitalize text-sm">{client.giro} • {STATUS_LABELS[client.status]}</p>
        </div>
      </div>
      {message && (
        <div className={`p-4 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.text}
        </div>
      )}
      <Card>
        <h2 className="text-lg font-bold text-gray-900 mb-4">📋 Información General</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><p className="text-gray-500">Dueño</p><p className="font-semibold">{client.nombre_dueno || '—'}</p></div>
          <div><p className="text-gray-500">WhatsApp</p><p className="font-semibold">{client.whatsapp_dueno || '—'}</p></div>
          <div><p className="text-gray-500">Monto mensual</p><p className="font-semibold">${client.monto_mensual?.toFixed(2) ?? '0.00'}</p></div>
          <div>
            <p className="text-gray-500">Próximo pago</p>
            <p className={`font-semibold ${client.fecha_proximo_pago && new Date(client.fecha_proximo_pago) <= new Date() ? 'text-red-600' : ''}`}>
              {client.fecha_proximo_pago ? new Date(client.fecha_proximo_pago).toLocaleDateString('es-MX') : '—'}
              {client.fecha_proximo_pago && new Date(client.fecha_proximo_pago) <= new Date() && ' ⚠️ VENCIDO'}
            </p>
          </div>
          <div><p className="text-gray-500">Mensajes este mes</p><p className="font-semibold">{client.messages_this_month}</p></div>
          <div><p className="text-gray-500">Webhook</p><p className="font-semibold">{client.webhook_verified ? '✅ Verificado' : '❌ Sin verificar'}</p></div>
        </div>
      </Card>
      <Card>
        <h2 className="text-lg font-bold text-gray-900 mb-2">🎭 Molde del Bot</h2>
        <p className="text-sm text-gray-500 mb-4">El molde define el flujo conversacional. Puedes cambiarlo en cualquier momento — el bot lo adoptará en el siguiente mensaje.</p>
        {client.has_active_flow ? (
          <div className="flex items-center gap-3 mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <span className="text-2xl">✅</span>
            <div>
              <p className="font-semibold text-blue-900">Molde activo: {client.template_slug ?? 'personalizado'}</p>
              <p className="text-sm text-blue-600">El bot está usando un flow configurado</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-semibold text-orange-900">Sin molde asignado</p>
              <p className="text-sm text-orange-600">El bot usa respuestas genéricas</p>
            </div>
          </div>
        )}
        <div className="flex gap-3">
          <div className="flex-1">
            <Select
              label={client.has_active_flow ? 'Cambiar a otro molde' : 'Asignar molde'}
              options={templateOptions} value={selectedSlug}
              onChange={(e) => setSelectedSlug(e.target.value)}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button variant="primary" isLoading={actionLoading === 'molde'} onClick={assignMolde}>
              {client.has_active_flow ? 'Cambiar' : 'Asignar'}
            </Button>
            {client.has_active_flow && (
              <Button variant="danger" size="md" isLoading={actionLoading === 'remove-molde'} onClick={removeMolde}>Quitar</Button>
            )}
          </div>
        </div>
      </Card>
      <Card>
        <h2 className="text-lg font-bold text-gray-900 mb-2">⚡ Control de Servicio</h2>
        <p className="text-sm text-gray-500 mb-4">Pausar el bot impide que responda mensajes de WhatsApp. Útil para control de pagos.</p>
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div>
            <p className="font-semibold text-gray-900">Estado actual: {STATUS_LABELS[client.status]}</p>
            <p className="text-sm text-gray-500">
              {client.status === TenantStatus.ACTIVE ? 'El bot está respondiendo mensajes normalmente'
                : client.status === TenantStatus.PAUSED ? 'El bot está pausado — no responde mensajes'
                : 'Pendiente de configuración inicial'}
            </p>
          </div>
          <Button variant={client.status === TenantStatus.ACTIVE ? 'danger' : 'primary'} isLoading={actionLoading === 'status'} onClick={toggleStatus}>
            {client.status === TenantStatus.ACTIVE ? '⏸ Pausar Bot' : '▶ Activar Bot'}
          </Button>
        </div>
      </Card>
      <Card className="opacity-60">
        <h2 className="text-lg font-bold text-gray-400 mb-1">📦 Catálogo de Productos</h2>
        <p className="text-sm text-gray-400">Disponible en Sprint 5</p>
      </Card>
      <Card className="opacity-60">
        <h2 className="text-lg font-bold text-gray-400 mb-1">💬 Historial de Mensajes</h2>
        <p className="text-sm text-gray-400">Disponible en Sprint 6</p>
      </Card>
    </div>
  );
}
