import { Link } from '@tanstack/react-router';
import { ExternalLink } from 'lucide-react';
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
        <TableRow>
          <TableHead>Negocio</TableHead>
          <TableHead>Giro</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-center">Webhook</TableHead>
          <TableHead className="text-center">Molde</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tenants.map((t) => (
          <TableRow key={t.id}>
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
              {t.webhook_verified ? (
                <span title="Verificado" aria-label="Verificado">✅</span>
              ) : (
                <span title="Pendiente" aria-label="Pendiente">⏳</span>
              )}
            </TableCell>
            <TableCell className="text-center">
              {t.has_active_flow ? (
                <span className="text-xs text-emerald-700">✅ asignado</span>
              ) : (
                <span className="text-xs text-amber-700">⚠ sin molde</span>
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
