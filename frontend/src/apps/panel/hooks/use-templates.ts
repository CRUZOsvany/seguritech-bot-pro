import { useQuery } from '@tanstack/react-query';
import { listTemplates, type BotFlowTemplate } from '@/shared/api/templates';

/**
 * Lista de moldes de industria disponibles. Cambian muy raramente
 * (seeds del backend), staleTime largo.
 */
export function useTemplates() {
  return useQuery<BotFlowTemplate[]>({
    queryKey: ['templates'],
    queryFn: listTemplates,
    staleTime: 10 * 60 * 1000, // 10 min
    refetchOnWindowFocus: false,
  });
}
