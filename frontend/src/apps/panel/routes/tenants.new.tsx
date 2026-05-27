import { createRoute } from '@tanstack/react-router';
import { authedLayoutRoute } from './_authed';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';

function NewTenantPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Nuevo cliente</CardTitle>
        <CardDescription>
          La pantalla de creación se migra en el próximo prompt. Mientras tanto,
          usa el panel HTML legacy.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <a href="/panel/new.html">Ir al panel HTML legacy →</a>
        </Button>
      </CardContent>
    </Card>
  );
}

export const tenantsNewRoute = createRoute({
  getParentRoute: () => authedLayoutRoute,
  path: '/tenants/new',
  component: NewTenantPage,
});
