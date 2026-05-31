import { createLazyRoute, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';

function WhatsAppPanelPage() {
  const { id } = Route.useParams();

  return (
    <div className="flex flex-col gap-4">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link to="/tenants/$id" params={{ id }}>
          <ArrowLeft className="mr-1 h-3 w-3" />
          Volver al cliente
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Configuración de WhatsApp Bot</CardTitle>
          <CardDescription>
            Credenciales Meta, mensajes del bot, asignar molde. Esta pantalla se
            construye en el siguiente prompt (FASE 2B).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Cliente: <code className="text-xs">{id}</code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export const Route = createLazyRoute('/tenants/$id/whatsapp')({
  component: WhatsAppPanelPage,
});
