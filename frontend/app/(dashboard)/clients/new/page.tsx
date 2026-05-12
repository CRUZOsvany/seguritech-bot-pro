'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select, Textarea } from '@/components/ui/Form';
import { BusinessType, BotTone } from '@/lib/types';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';

interface TemplateSummary { slug: string; giro: string; nombre: string; descripcion: string | null; }

const GIRO_OPTIONS = Object.values(BusinessType).map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }));
const TONO_OPTIONS = Object.values(BotTone).map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }));

export default function NewClientPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [form, setForm] = useState({
    nombre_negocio: '', giro: BusinessType.FERRETERIA,
    direccion: '', horario_semana: 'Lun-Vie 9-18h', horario_sabado: 'Sáb 9-14h', abre_domingo: false,
    nombre_dueno: '', whatsapp_dueno: '', monto_mensual: 0,
    fecha_proximo_pago: '', notas_internas: '',
    numero_whatsapp_asignado: '', nombre_bot: 'Asistente',
    tono_bot: BotTone.AMIGABLE,
    mensaje_bienvenida: '¡Hola! ¿En qué puedo ayudarte?',
    mensaje_menu_principal: 'Elige una opción:\n1. Productos\n2. Precios\n3. Hacer pedido',
    mensaje_fuera_horario: 'Estamos fuera de horario. Te atenderemos pronto.',
    mensaje_no_entendio: 'No entendí. Escribe "menu" para volver al inicio.',
    mensaje_confirmacion_pedido: '✅ Pedido confirmado. Te contactaremos pronto.',
    template_slug: '',
    tiene_servicio_urgente: false,
    whatsapp_alertas_urgentes: '', mensaje_alerta_admin: '', tiempo_respuesta_prometido: '',
  });

  useEffect(() => {
    fetch('/api/templates').then((r) => r.json()).then((d) => setTemplates(d.templates ?? [])).catch(() => {});
  }, []);

  const set = (field: string, value: any) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre_negocio.trim() || !form.nombre_dueno.trim() || !form.whatsapp_dueno.trim()) {
      setError('Nombre del negocio, dueño y WhatsApp son obligatorios');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre_negocio: form.nombre_negocio, giro: form.giro,
          direccion: form.direccion, horario_semana: form.horario_semana,
          horario_sabado: form.horario_sabado, abre_domingo: form.abre_domingo,
          nombre_dueno: form.nombre_dueno, whatsapp_dueno: form.whatsapp_dueno,
          monto_mensual: Number(form.monto_mensual),
          fecha_proximo_pago: form.fecha_proximo_pago || null,
          notas_internas: form.notas_internas,
          numero_whatsapp_asignado: form.numero_whatsapp_asignado,
          nombre_bot: form.nombre_bot, tono_bot: form.tono_bot,
          mensaje_bienvenida: form.mensaje_bienvenida,
          mensaje_menu_principal: form.mensaje_menu_principal,
          mensaje_fuera_horario: form.mensaje_fuera_horario,
          mensaje_no_entendio: form.mensaje_no_entendio,
          mensaje_confirmacion_pedido: form.mensaje_confirmacion_pedido,
          tiene_servicio_urgente: form.tiene_servicio_urgente,
          whatsapp_alertas_urgentes: form.whatsapp_alertas_urgentes || undefined,
          mensaje_alerta_admin: form.mensaje_alerta_admin || undefined,
          tiempo_respuesta_prometido: form.tiempo_respuesta_prometido || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error creando cliente');
      const tenantId = data.data?.id;
      if (form.template_slug && tenantId) {
        await fetch(`/api/tenants/${tenantId}/molde`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateSlug: form.template_slug }),
        });
      }
      router.push(`/clients/${tenantId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setIsSubmitting(false);
    }
  };

  const templateOptions = [
    { value: '', label: '— Sin molde (asignar después) —' },
    ...templates.map((t) => ({ value: t.slug, label: `${t.nombre} (${t.giro})` })),
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Nuevo Cliente</h1>
        <p className="text-gray-500 mt-1">Dar de alta un nuevo negocio en el sistema</p>
      </div>
      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <h2 className="text-lg font-bold text-gray-900 mb-4">🏢 Datos del Negocio</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Nombre del negocio" required value={form.nombre_negocio} onChange={(e) => set('nombre_negocio', e.target.value)} placeholder="Ferretería El Clavo" />
            <Select label="Giro" required options={GIRO_OPTIONS} value={form.giro} onChange={(e) => set('giro', e.target.value)} />
            <Input label="Dirección" value={form.direccion} onChange={(e) => set('direccion', e.target.value)} placeholder="Av. Principal 123, Col. Centro" />
            <Input label="Horario semana" value={form.horario_semana} onChange={(e) => set('horario_semana', e.target.value)} placeholder="Lun-Vie 9-18h" />
            <Input label="Horario sábado" value={form.horario_sabado} onChange={(e) => set('horario_sabado', e.target.value)} placeholder="Sáb 9-14h" />
            <div className="flex items-center gap-3 pt-6">
              <input type="checkbox" id="abre_domingo" checked={form.abre_domingo} onChange={(e) => set('abre_domingo', e.target.checked)} className="h-4 w-4" />
              <label htmlFor="abre_domingo" className="text-sm font-medium text-gray-700">Abre los domingos</label>
            </div>
          </div>
        </Card>
        <Card>
          <h2 className="text-lg font-bold text-gray-900 mb-4">👤 Datos del Dueño</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Nombre del dueño" required value={form.nombre_dueno} onChange={(e) => set('nombre_dueno', e.target.value)} placeholder="Juan García" />
            <Input label="WhatsApp del dueño" required value={form.whatsapp_dueno} onChange={(e) => set('whatsapp_dueno', e.target.value)} placeholder="527471234567" />
            <Input label="Monto mensual (MXN)" type="number" value={form.monto_mensual} onChange={(e) => set('monto_mensual', e.target.value)} placeholder="500" />
            <Input label="Fecha próximo pago" type="date" value={form.fecha_proximo_pago} onChange={(e) => set('fecha_proximo_pago', e.target.value)} />
            <div className="md:col-span-2">
              <Textarea label="Notas internas" value={form.notas_internas} onChange={(e) => set('notas_internas', e.target.value)} placeholder="Solo visible para el equipo de SegurITech" rows={2} />
            </div>
          </div>
        </Card>
        <Card>
          <h2 className="text-lg font-bold text-gray-900 mb-4">🤖 Config del Bot</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Número WhatsApp asignado" value={form.numero_whatsapp_asignado} onChange={(e) => set('numero_whatsapp_asignado', e.target.value)} placeholder="521XXXXXXXXXX" />
            <Input label="Nombre del bot" value={form.nombre_bot} onChange={(e) => set('nombre_bot', e.target.value)} placeholder="Asistente" />
            <Select label="Tono del bot" options={TONO_OPTIONS} value={form.tono_bot} onChange={(e) => set('tono_bot', e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-4 mt-4">
            <Textarea label="Mensaje de bienvenida" value={form.mensaje_bienvenida} onChange={(e) => set('mensaje_bienvenida', e.target.value)} rows={2} />
            <Textarea label="Menú principal" value={form.mensaje_menu_principal} onChange={(e) => set('mensaje_menu_principal', e.target.value)} rows={3} />
            <Textarea label="Fuera de horario" value={form.mensaje_fuera_horario} onChange={(e) => set('mensaje_fuera_horario', e.target.value)} rows={2} />
            <Textarea label="No entendido" value={form.mensaje_no_entendio} onChange={(e) => set('mensaje_no_entendio', e.target.value)} rows={2} />
            <Textarea label="Confirmación de pedido" value={form.mensaje_confirmacion_pedido} onChange={(e) => set('mensaje_confirmacion_pedido', e.target.value)} rows={2} />
          </div>
        </Card>
        <Card>
          <h2 className="text-lg font-bold text-gray-900 mb-2">🎭 Molde del Bot</h2>
          <p className="text-sm text-gray-500 mb-4">El molde define el flujo conversacional. Puedes asignarlo después desde la ficha del cliente.</p>
          <Select label="Template de industria" options={templateOptions} value={form.template_slug} onChange={(e) => set('template_slug', e.target.value)} />
        </Card>
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <input type="checkbox" id="tiene_servicio_urgente" checked={form.tiene_servicio_urgente} onChange={(e) => set('tiene_servicio_urgente', e.target.checked)} className="h-4 w-4" />
            <label htmlFor="tiene_servicio_urgente" className="text-lg font-bold text-gray-900">🚨 Servicio Urgente</label>
          </div>
          {form.tiene_servicio_urgente && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="WhatsApp para alertas urgentes" value={form.whatsapp_alertas_urgentes} onChange={(e) => set('whatsapp_alertas_urgentes', e.target.value)} placeholder="527471234567" />
              <Input label="Tiempo de respuesta prometido" value={form.tiempo_respuesta_prometido} onChange={(e) => set('tiempo_respuesta_prometido', e.target.value)} placeholder="5 minutos" />
              <div className="md:col-span-2">
                <Textarea label="Mensaje de alerta al admin" value={form.mensaje_alerta_admin} onChange={(e) => set('mensaje_alerta_admin', e.target.value)} placeholder="🚨 Urgencia en {{nombre_negocio}}. Cliente: {{phone}}" rows={2} />
              </div>
            </div>
          )}
        </Card>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => router.push('/clients')}>Cancelar</Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting} size="lg">Crear Cliente</Button>
        </div>
      </form>
    </div>
  );
}
