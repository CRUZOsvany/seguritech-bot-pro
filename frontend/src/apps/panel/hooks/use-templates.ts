import { useQuery } from '@tanstack/react-query';
import { listTemplates, type Template } from '@/shared/api/tenants';

export function useTemplates() {
  return useQuery<Template[]>({
    queryKey: ['templates'],
    queryFn: listTemplates,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
