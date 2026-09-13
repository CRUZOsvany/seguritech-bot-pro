import { useState } from 'react';
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
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import type { TenantSummary } from '@/shared/api/tenants';
import { useHardDeleteTenant } from '../hooks/use-hard-delete-tenant';
import { confirmNameMatches } from './tenants-model';

interface Props {
  tenant: TenantSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HardDeleteTenantDialog({ tenant, open, onOpenChange }: Props) {
  const hardDelete = useHardDeleteTenant(tenant.id);
  const [typed, setTyped] = useState('');
  const matches = confirmNameMatches(typed, tenant.nombre_negocio);
  const inputId = `confirm-hard-delete-${tenant.id}`;

  // Al cerrar, el nombre escrito no sobrevive a la próxima apertura.
  const handleOpenChange = (next: boolean) => {
    if (!next) setTyped('');
    onOpenChange(next);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar {tenant.nombre_negocio} para siempre</AlertDialogTitle>
          <AlertDialogDescription>
            Esto borra <strong className="text-foreground">todo</strong> lo de
            este cliente: mensajes, configuración del bot, flows y sus
            versiones, catálogo POS si lo tiene y credenciales de WhatsApp.{' '}
            <strong className="text-foreground">No hay forma de recuperarlo.</strong>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid gap-2">
          <Label htmlFor={inputId} className="font-normal">
            Escribe «{tenant.nombre_negocio}» para confirmar
          </Label>
          <Input
            id={inputId}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={hardDelete.isPending}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={hardDelete.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!matches || hardDelete.isPending}
            onClick={(e) => {
              e.preventDefault();
              hardDelete.mutate(typed, { onSuccess: () => handleOpenChange(false) });
            }}
          >
            {hardDelete.isPending && <Loader2 className="animate-spin" />}
            Eliminar para siempre
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
