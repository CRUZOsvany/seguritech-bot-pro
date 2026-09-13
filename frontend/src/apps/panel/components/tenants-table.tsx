import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  CheckCircle2, Clock, AlertTriangle, MoreVertical, Archive, Trash2,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import type { TenantSummary, TenantStatus } from '@/shared/api/tenants';
import { ArchiveTenantDialog } from './archive-tenant-dialog';
import { HardDeleteTenantDialog } from './hard-delete-tenant-dialog';
import { canHardDelete } from './tenants-model';

interface Props {
  tenants: TenantSummary[];
}

const STATUS_LABELS: Record<TenantStatus, string> = {
  draft: 'Draft',
  sandbox: 'Sandbox',
  live: 'Live',
  paused: 'Paused',
  archived: 'Archived',
};

export function TenantsTable({ tenants }: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Negocio</TableHead>
          <TableHead className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Giro</TableHead>
          <TableHead className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Status</TableHead>
          <TableHead className="text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Bot</TableHead>
          <TableHead className="text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Webhook</TableHead>
          <TableHead className="text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Molde</TableHead>
          <TableHead className="text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tenants.map((t) => (
          <TableRow key={t.id} className="hover:bg-muted/40">
            <TableCell>
              <div className="font-medium">{t.nombre_negocio}</div>
              <code className="text-[10px] text-muted-foreground">
                {t.id.slice(0, 8)}…
              </code>
            </TableCell>
            <TableCell className="text-muted-foreground">{t.giro}</TableCell>
            <TableCell>
              <Badge variant={`fsm-${t.status}` as const}>
                {STATUS_LABELS[t.status]}
              </Badge>
            </TableCell>
            <TableCell className="text-center">
              {t.whatsapp_status ? (
                <Badge variant={`fsm-${t.whatsapp_status}` as const}>
                  {t.whatsapp_status}
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="text-center">
              {t.webhook_verified ? (
                <CheckCircle2
                  className="mx-auto h-4 w-4 text-emerald-600"
                  aria-label="Verificado"
                />
              ) : (
                <Clock
                  className="mx-auto h-4 w-4 text-muted-foreground"
                  aria-label="Pendiente"
                />
              )}
            </TableCell>
            <TableCell className="text-center">
              {t.has_active_flow ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> asignado
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> sin molde
                </span>
              )}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to="/tenants/$id" params={{ id: t.id }}>
                    Ver
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/tenants/$id/studio" params={{ id: t.id }}>
                    Simular
                  </Link>
                </Button>
                <TenantRowActions tenant={t} />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * Menú ⋮ de la fila: archivar y eliminar para siempre. Los diálogos viven
 * fuera del menú y se abren por estado — un diálogo montado dentro de un
 * DropdownMenuItem se desmonta junto con el menú al seleccionar.
 */
function TenantRowActions({ tenant }: { tenant: TenantSummary }) {
  const [dialog, setDialog] = useState<'archive' | 'hard-delete' | null>(null);
  const deletable = canHardDelete(tenant.status);

  return (
    <>
      {/* modal={false}: con el menú modal, Radix deja pointer-events:none en
          el body al pasar el foco al AlertDialog y la página queda muerta. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Más acciones para ${tenant.nombre_negocio}`}
          >
            <MoreVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onSelect={() => setDialog('archive')}>
            <Archive />
            Archivar
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={!deletable}
            onSelect={() => setDialog('hard-delete')}
            className="items-start"
          >
            <Trash2 className="mt-0.5" />
            <span className="flex flex-col">
              <span>Eliminar para siempre</span>
              {!deletable && (
                <span className="text-xs text-muted-foreground">
                  No disponible en {STATUS_LABELS[tenant.status]}: solo en
                  draft, sandbox o archivado
                </span>
              )}
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ArchiveTenantDialog
        tenant={tenant}
        open={dialog === 'archive'}
        onOpenChange={(open) => setDialog(open ? 'archive' : null)}
      />
      <HardDeleteTenantDialog
        tenant={tenant}
        open={dialog === 'hard-delete'}
        onOpenChange={(open) => setDialog(open ? 'hard-delete' : null)}
      />
    </>
  );
}
