import { Link } from '@tanstack/react-router';
import { ExternalLink, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
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
import type { TenantSummary, TenantStatus } from '@/shared/api/tenants';

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
                  <a
                    href={`/simulator/${encodeURIComponent(t.id)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Simular
                    <ExternalLink className="ml-1 h-3 w-3" />
                  </a>
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
