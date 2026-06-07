import { createRoute, Link } from '@tanstack/react-router';
import { AlertCircle, Loader2 } from 'lucide-react';
import { authedLayoutRoute } from './_authed';
import { useTenants } from '../hooks/use-tenants';
import { TenantsTable } from '../components/tenants-table';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/shared/ui/card';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';

function DashboardPage() {
  const { data: tenants, isLoading, error } = useTenants();

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
          <TenantsTable tenants={tenants} />
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
