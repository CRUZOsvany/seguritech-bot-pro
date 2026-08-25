import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listServiceDirectory,
  createServiceDirectoryEntry,
  updateServiceDirectoryEntry,
  deleteServiceDirectoryEntry,
  type ServiceDirectoryEntry,
  type ServiceDirectoryEntryInput,
  type ServiceDirectoryEntryPatch,
} from '@/shared/api/service-directory';

export function useServiceDirectory(tenantId: string) {
  return useQuery<ServiceDirectoryEntry[]>({
    queryKey: ['service-directory', tenantId],
    queryFn: () => listServiceDirectory(tenantId),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
    enabled: Boolean(tenantId),
  });
}

export function useCreateServiceDirectoryEntry(tenantId: string) {
  const qc = useQueryClient();
  return useMutation<ServiceDirectoryEntry, Error, ServiceDirectoryEntryInput>({
    mutationFn: (input) => createServiceDirectoryEntry(tenantId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-directory', tenantId] }),
  });
}

export function useUpdateServiceDirectoryEntry(tenantId: string) {
  const qc = useQueryClient();
  return useMutation<
    ServiceDirectoryEntry,
    Error,
    { entryId: string; patch: ServiceDirectoryEntryPatch }
  >({
    mutationFn: ({ entryId, patch }) => updateServiceDirectoryEntry(tenantId, entryId, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-directory', tenantId] }),
  });
}

export function useDeleteServiceDirectoryEntry(tenantId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (entryId) => deleteServiceDirectoryEntry(tenantId, entryId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-directory', tenantId] }),
  });
}
