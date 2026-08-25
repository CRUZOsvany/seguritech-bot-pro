import type { ServiceDirectoryEntry } from '@/domain/entities';
import { fuzzyIncludes } from '@/domain/services/textMatch';

/**
 * Busca la mejor entrada del directorio de servicios que matchee el mensaje.
 * Determinista, O(n) sobre el arreglo ya cargado en TenantConfig (cacheado
 * 5 min por SupabaseTenantConfigService) — sin llamada de red por mensaje.
 * Capa 2 de la arquitectura híbrida sin IA.
 */
export class ServiceDirectoryMatcher {
  match(message: string, directory: ServiceDirectoryEntry[]): ServiceDirectoryEntry | null {
    for (const entry of directory) {
      if (!entry.activo) continue;
      if (entry.keywords.some((kw) => fuzzyIncludes(message, kw))) {
        return entry;
      }
    }
    return null;
  }
}
