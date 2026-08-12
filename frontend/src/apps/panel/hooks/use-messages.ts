import { useQuery } from '@tanstack/react-query';
import { getMessages, type MessageRow } from '@/shared/api/tenants';

/**
 * Tail de mensajes reales del tenant (P5). El backend devuelve un tail plano
 * ordenado desc por timestamp; agrupar por hilo (from_phone) es trabajo de
 * este hook/componente — ver comentario en MessagesRepository.tailByTenant.
 *
 * staleTime corto (10s): esta vista es para "qué pasó hace un momento", no
 * un dashboard de referencia — vale la pena refrescar seguido.
 */
export function useMessages(tenantId: string, limit = 200) {
  return useQuery<MessageRow[]>({
    queryKey: ['messages', tenantId, limit],
    queryFn: () => getMessages(tenantId, limit),
    staleTime: 10 * 1000,
    refetchOnWindowFocus: true,
    enabled: Boolean(tenantId),
  });
}
