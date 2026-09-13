import { useMemo, useState } from 'react';
import { createRoute, Link } from '@tanstack/react-router';
import { AlertCircle, Loader2 } from 'lucide-react';
import { authedLayoutRoute } from './_authed';
import { useTenants } from '../hooks/use-tenants';
import { TenantsTable } from '../components/tenants-table';
import { filterTenants } from '../components/tenant-search';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/shared/ui/card';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

function DashboardPage() {
  const { data: tenants, isLoading, error } = useTenants();
  const [query, setQuery] = useState('');
  const visible = useMemo(() => filterTenants(tenants ?? [], query), [tenants, query]);

  return (
    <Card className="shadow-card">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>Clientes (tenants)</CardTitle>
            <CardDescription>
              {tenants && tenants.length > 0
                ? `${tenants.length} ${tenants.length === 1 ? 'cliente' : 'clientes'} en total`
                : 'Lista de tenants gestionados por el MSP'}
            </CardDescription>
          </div>
          <Button asChild size="sm">
            <Link to="/tenants/new">+ Nuevo cliente</Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading && (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Cargando tenants…
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {error instanceof Error
                ? error.message
                : 'Error desconocido cargando tenants'}
            </AlertDescription>
          </Alert>
        )}

        {!isLoading && !error && tenants && tenants.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="mb-3 text-sm text-muted-foreground">
              No hay clientes todavía.
            </p>
            <Button asChild>
              <Link to="/tenants/new">Crear el primero</Link>
            </Button>
          </div>
        )}

        {!isLoading && !error && tenants && tenants.length > 0 && (
          <div className="flex flex-col gap-4">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, giro o status…"
              aria-label="Buscar clientes"
              className="max-w-sm"
            />
            {visible.length > 0 ? (
              <TenantsTable tenants={visible} />
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="mb-3 text-sm text-muted-foreground">
                  Sin resultados para «{query.trim()}».
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const dashboardRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: '/dashboard',
  component: DashboardPage,
});
