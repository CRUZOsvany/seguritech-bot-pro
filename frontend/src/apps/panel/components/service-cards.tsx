import { Link } from '@tanstack/react-router';
import {
  MessageCircle,
  MessageSquare,
  ShoppingCart,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  type ServiceType,
  type TenantServiceItem,
} from '@/shared/api/tenants';
import { useEnableService } from '../hooks/use-enable-service';

interface Props {
  tenantId: string;
  services: TenantServiceItem[];
}

interface ServiceMeta {
  type: ServiceType;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  available: boolean;
  configPath?: '/tenants/$id/whatsapp' | '/tenants/$id/pos';
}

const SERVICES: ServiceMeta[] = [
  {
    type: 'whatsapp_bot',
    name: 'WhatsApp Bot',
    description:
      'Bot conversacional vía WhatsApp Cloud API. Atiende clientes 24/7 con flujos diseñados a medida.',
    icon: MessageCircle,
    available: true,
    configPath: '/tenants/$id/whatsapp',
  },
  {
    type: 'messenger_bot',
    name: 'Facebook Messenger',
    description:
      'Bot conversacional vía Messenger Platform. Segundo canal del paquete.',
    icon: MessageSquare,
    available: false,
  },
  {
    type: 'pos',
    name: 'Punto de venta (POS)',
    description:
      'Sistema de cobro para tu negocio. Catálogo, cajeros, ticket, reportes.',
    icon: ShoppingCart,
    available: true,
    configPath: '/tenants/$id/pos',
  },
];

const STATUS_LABELS: Record<TenantServiceItem['status'], string> = {
  draft: 'Pendiente',
  configuring: 'Configurando',
  active: 'Activo',
  paused: 'Pausado',
  archived: 'Archivado',
};

export function ServiceCards({ tenantId, services }: Props) {
  const enableMutation = useEnableService();

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {SERVICES.map((meta) => {
        const existing = services.find((s) => s.serviceType === meta.type);
        const Icon = meta.icon;
        const isEnabling =
          enableMutation.isPending &&
          enableMutation.variables?.serviceType === meta.type;

        return (
          <Card key={meta.type} className="flex flex-col">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-md bg-muted p-2">
                    <Icon className="h-5 w-5 text-foreground" aria-hidden />
                  </div>
                  <div>
                    <CardTitle className="text-base">{meta.name}</CardTitle>
                    {existing ? (
                      <Badge
                        variant={`fsm-${existing.status}` as const}
                        className="mt-1"
                      >
                        {STATUS_LABELS[existing.status]}
                      </Badge>
                    ) : meta.available ? (
                      <Badge variant="outline" className="mt-1">
                        No habilitado
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="mt-1">
                        Próximamente
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="flex flex-1 flex-col justify-between gap-4">
              <CardDescription>{meta.description}</CardDescription>

              <div className="flex justify-end">
                {!meta.available ? (
                  <Button variant="outline" size="sm" disabled>
                    Próximamente
                  </Button>
                ) : !existing ? (
                  <Button
                    size="sm"
                    onClick={() =>
                      enableMutation.mutate({
                        tenantId,
                        serviceType: meta.type,
                      })
                    }
                    disabled={isEnabling}
                  >
                    {isEnabling ? (
                      <>
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        Habilitando…
                      </>
                    ) : (
                      'Habilitar'
                    )}
                  </Button>
                ) : (
                  <Button asChild size="sm" variant="outline">
                    <Link to={meta.configPath!} params={{ id: tenantId }}>
                      Configurar
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
