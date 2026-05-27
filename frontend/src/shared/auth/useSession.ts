import { useQuery } from '@tanstack/react-query';
import { getSession, type SessionUser } from '@/shared/api/auth';

/**
 * Hook reactivo de sesión.
 *
 * Si /api/auth/me devuelve 401, el apiFetch redirige a /app/login automáticamente,
 * por lo que el componente que use este hook nunca verá `error` de 401 — verá
 * `isLoading` indefinidamente mientras navega. Esto es intencional.
 *
 * El cache se invalida en logout llamando queryClient.removeQueries({ queryKey: ['session'] }).
 */
export function useSession() {
  return useQuery<SessionUser>({
    queryKey: ['session'],
    queryFn: getSession,
    staleTime: 5 * 60 * 1000, // 5 min — me() es barato pero no spam
    retry: false,             // un 401 no se reintenta
    refetchOnWindowFocus: false,
  });
}
