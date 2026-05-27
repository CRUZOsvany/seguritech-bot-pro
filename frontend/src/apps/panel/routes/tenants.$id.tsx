import { createLazyRoute } from '@tanstack/react-router';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';

function TenantDetailPage() {
  const { id } = Route.useParams();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Detalle del tenant</CardTitle>
        <CardDescription>
          ID: <code className="text-xs">{id}</code>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          La pantalla de detalle/edición se migra en el próximo prompt. Mientras
          tanto, usa el panel HTML legacy.
        </p>
        <Button asChild variant="outline">
          <a href={`/panel/tenant.html?id=${encodeURIComponent(id)}`}>
            Ir al panel HTML legacy →
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}

export const Route = createLazyRoute('/tenants/$id')({
  component: TenantDetailPage,
});
