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
            Deja de aparecer en la lista de clientes, pero no se pierde ningún
            dato: sus mensajes, flows y configuración se quedan en la base. Es
            reversible.
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
