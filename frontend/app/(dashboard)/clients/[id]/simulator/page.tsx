'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { WhatsAppChat } from '@/components/simulator/WhatsAppChat';
import type { ChatMessage } from '@/components/simulator/types';
import type { SimulatorOutput, SimulateResponse } from '@/lib/backend-admin';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, RotateCcw, Eye, EyeOff } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

interface ClientLite {
  id: string;
  nombre_negocio: string;
  giro: string;
}

export default function SimulatorPage() {
  const params = useParams();
  const router = useRouter();
  const tenantId = String(params.id);

  const [client, setClient] = useState<ClientLite | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('+527471234567');
  const [persist, setPersist] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [nextNodeId, setNextNodeId] = useState<string>('');
  const [context, setContext] = useState<Record<string, unknown>>({});
  const [showDebug, setShowDebug] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchClient = async () => {
      try {
        const res = await fetch('/api/clients');
        const data = await res.json();
        const found = (data.data ?? []).find(
          (c: ClientLite) => c.id === tenantId,
        );
        if (found) {
          setClient({
            id: found.id,
            nombre_negocio: found.nombre_negocio,
            giro: found.giro,
          });
        } else {
          setError('Cliente no encontrado');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error cargando cliente');
      }
    };
    fetchClient();
  }, [tenantId]);

  const generateId = () =>
    `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const sendSimulationRequest = useCallback(
    async (content: string) => {
      setIsLoading(true);
      setError(null);

      const userMsg: ChatMessage = {
        id: generateId(),
        from: 'user',
        kind: 'text',
        text: content,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);

      try {
        const res = await fetch(`/api/tenants/${tenantId}/simulate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneNumber, content, persist }),
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          const errMsg = errBody.error ?? `HTTP ${res.status}`;
          const sysMsg: ChatMessage = {
            id: generateId(),
            from: 'system',
            kind: 'error',
            text: errMsg,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, sysMsg]);
          setError(errMsg);
          return;
        }

        const data = (await res.json()) as SimulateResponse;
        setNextNodeId(data.nextNodeId);
        setContext(data.context);

        const botMessages: ChatMessage[] = data.outputs.map(
          (output: SimulatorOutput) => ({
            id: generateId(),
            from: 'bot' as const,
            kind: output.kind,
            output,
            timestamp: new Date(),
          }),
        );
        setMessages((prev) => [...prev, ...botMessages]);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Error de red';
        setError(errMsg);
        const sysMsg: ChatMessage = {
          id: generateId(),
          from: 'system',
          kind: 'error',
          text: errMsg,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, sysMsg]);
      } finally {
        setIsLoading(false);
      }
    },
    [tenantId, phoneNumber, persist],
  );

  const handleReset = async () => {
    if (!window.confirm('¿Reiniciar la conversación? Se borrará el historial.'))
      return;
    setMessages([]);
    setNextNodeId('');
    setContext({});
    setError(null);

    if (persist) {
      try {
        await fetch(`/api/tenants/${tenantId}/simulate/reset`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneNumber }),
        });
      } catch {
        // El reset es best-effort
      }
    }
  };

  if (!client && !error) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-gray-500">⏳ Cargando simulador...</p>
      </div>
    );
  }

  if (error && !client) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-700">{error}</p>
        <Button
          variant="ghost"
          onClick={() => router.push('/clients')}
          className="mt-2"
        >
          ← Volver a clientes
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-8rem)]">
      <div className="lg:w-80 flex-shrink-0 space-y-4 overflow-y-auto">
        <button
          onClick={() => router.push(`/clients/${tenantId}`)}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft size={16} />
          Volver a {client?.nombre_negocio}
        </button>

        <Card>
          <h2 className="font-semibold text-gray-900 mb-3">Configuración</h2>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Teléfono simulado
              </label>
              <input
                type="text"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                placeholder="+527471234567"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={persist}
                onChange={(e) => setPersist(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-gray-700">
                Persistir estado en BD
              </span>
            </label>
            <p className="text-xs text-gray-500 -mt-2">
              {persist
                ? '⚠️ Cada turno se guarda en bot_users.'
                : 'ℹ️ Modo efímero. No toca BD.'}
            </p>
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold text-gray-900 mb-3">Acciones</h2>

          <div className="space-y-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleReset}
              className="w-full flex items-center justify-center gap-2"
            >
              <RotateCcw size={14} />
              Reiniciar conversación
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDebug(!showDebug)}
              className="w-full flex items-center justify-center gap-2"
            >
              {showDebug ? <EyeOff size={14} /> : <Eye size={14} />}
              {showDebug ? 'Ocultar debug' : 'Ver debug'}
            </Button>
          </div>
        </Card>

        {showDebug && (
          <Card>
            <h2 className="font-semibold text-gray-900 mb-3 text-sm">
              Estado interno
            </h2>
            <div className="space-y-2 text-xs">
              <div>
                <span className="font-medium text-gray-700">currentNodeId:</span>{' '}
                <code className="bg-gray-100 px-1 py-0.5 rounded">
                  {nextNodeId || '(sin estado)'}
                </code>
              </div>
              <div>
                <span className="font-medium text-gray-700">context:</span>
                <pre className="bg-gray-100 p-2 rounded mt-1 overflow-x-auto text-[10px]">
                  {JSON.stringify(context, null, 2)}
                </pre>
              </div>
            </div>
          </Card>
        )}
      </div>

      <div className="flex-1 min-h-0 rounded-lg overflow-hidden shadow-lg border border-gray-200">
        <WhatsAppChat
          businessName={client?.nombre_negocio ?? 'Negocio'}
          giro={client?.giro ?? ''}
          messages={messages}
          isLoading={isLoading}
          onSend={(text) => sendSimulationRequest(text)}
          onSelectButton={(btn) => sendSimulationRequest(btn.title)}
          onSelectListItem={(item) => sendSimulationRequest(item.title)}
        />
      </div>
    </div>
  );
}
