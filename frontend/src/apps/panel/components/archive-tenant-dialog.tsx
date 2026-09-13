import { Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog';
import type { TenantSummary } from '@/shared/api/tenants';
import { useArchiveTenant } from '../hooks/use-archive-tenant';

interface Props {
  tenant: TenantSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ArchiveTenantDialog({ tenant, open, onOpenChange }: Props) {
  const archive = useArchiveTenant(tenant.id);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archivar {tenant.nombre_negocio}</AlertDialogTitle>
          <AlertDialogDescription>
            Se oculta de la lista de clientes y conserva todo su historial. Hoy
            no hay una pantalla para reactivarlo desde el panel — si necesitas
            reactivar un cliente archivado, avísame directamente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={archive.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={archive.isPending}
            onClick={(e) => {
              // Sin esto Radix cierra el diálogo antes de saber si el backend aceptó.
              e.preventDefault();
              archive.mutate(undefined, { onSuccess: () => onOpenChange(false) });
            }}
          >
            {archive.isPending && <Loader2 className="animate-spin" />}
            Archivar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
