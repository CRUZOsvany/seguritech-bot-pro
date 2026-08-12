import { createLazyRoute, Link } from '@tanstack/react-router';
import { AlertCircle, Loader2, MessageCircle, Play, ShieldAlert } from 'lucide-react';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/shared/ui/table';
import { useEscalations, useResumeEscalation } from '../hooks/use-escalations';
import { formatRelativeTime, formatAbsoluteTime } from '@/shared/lib/format-date';
import type { PausedEscalation } from '@/shared/api/tenants';

/**
 * Bandeja de escalaciones (P8) — supervisión interna de SegurITech.
 * NO es una herramienta del dueño (ADR-001): el dueño ya tiene su propio
 * mecanismo de reanudación por WhatsApp (#listo/#reanudar, D4/P4). Esta
 * vista es para que el equipo interno vea de un vistazo, cross-tenant,
 * quién está esperando a un humano ahora mismo — sin entrar tenant por
 * tenant. super_admin ve todo; admin_operator solo su propio tenant
 * (scope aplicado server-side, igual que el resto del panel).
 */
function EscalationsPage() {
  const escalationsQ = useEscalations();
  const resume = useResumeEscalation();

  const rows = escalationsQ.data ?? [];

  return (
    <Card className="shadow-card">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-600" aria-hidden />
              Escalaciones
            </CardTitle>
            <CardDescription>
              {rows.length > 0
                ? `${rows.length} ${rows.length === 1 ? 'conversación' : 'conversaciones'} esperando a un humano ahora mismo`
                : 'Conversaciones pausadas por handoff humano, en todos tus clientes'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {escalationsQ.isLoading && (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Cargando…
          </div>
        )}

        {escalationsQ.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {escalationsQ.error instanceof Error
                ? escalationsQ.error.message
                : 'Error cargando escalaciones'}
            </AlertDescription>
          </Alert>
        )}

        {!escalationsQ.isLoading && !escalationsQ.error && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No hay ninguna conversación pausada ahora mismo. 🎉
            </p>
          </div>
        )}

        {!escalationsQ.isLoading && rows.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Negocio</TableHead>
                <TableHead className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Teléfono</TableHead>
                <TableHead className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Estado</TableHead>
                <TableHead className="text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <EscalationRow
                  key={`${row.tenantId}::${row.phoneNumber}`}
                  row={row}
                  onResume={() => resume.mutate({ tenantId: row.tenantId, phoneNumber: row.phoneNumber })}
                  resuming={
                    resume.isPending &&
                    resume.variables?.tenantId === row.tenantId &&
                    resume.variables?.phoneNumber === row.phoneNumber
                  }
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function EscalationRow({
  row, onResume, resuming,
}: { row: PausedEscalation; onResume: () => void; resuming: boolean }) {
  return (
    <TableRow className="hover:bg-muted/40">
      <TableCell>
        <Link
          to="/tenants/$id"
          params={{ id: row.tenantId }}
          className="font-medium hover:underline"
        >
          {row.tenantName}
        </Link>
      </TableCell>
      <TableCell className="text-muted-foreground">{row.phoneNumber}</TableCell>
      <TableCell>
        <Badge variant="fsm-paused" title={formatAbsoluteTime(row.humanPausedUntil)}>
          🔇 {formatRelativeTime(row.humanPausedUntil) || 'pausado'}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/tenants/$id/messages" params={{ id: row.tenantId }}>
              <MessageCircle className="mr-1 h-3 w-3" /> Ver conversación
            </Link>
          </Button>
          <Button size="sm" variant="outline" onClick={onResume} disabled={resuming}>
            {resuming ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Play className="mr-1 h-3 w-3" />
            )}
            Reanudar
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export const Route = createLazyRoute('/_authed/escalaciones')({
  component: EscalationsPage,
});
