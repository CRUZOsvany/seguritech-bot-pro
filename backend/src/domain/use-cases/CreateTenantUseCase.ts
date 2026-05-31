import type pino from 'pino';
import { z } from 'zod';
import type { TenantRepository, CreateTenantInput } from '@/domain/ports';

/**
 * Esquema de validación de entrada. Se mantiene aquí (y NO en el router)
 * para que las pruebas del use case puedan ejercerlo sin un Express.
 *
 * Límites de longitud copiados de los CHECKs/varchars de la BD donde aplica
 * y de las longitudes razonables del panel admin.
 */
const CreateTenantSchema = z.object({
  nombre_negocio: z.string().min(2).max(120),
  giro: z.enum([
    'ferreteria',
    'papeleria',
    'cerrajeria',
    'pizzeria',
    'salon',
    'medico',
    'refaccionaria',
    'farmacia',
    'otro',
  ]),
  direccion: z.string().max(300).optional(),
  horario_semana: z.string().max(120).optional(),
  horario_sabado: z.string().max(120).optional(),
  abre_domingo: z.boolean().optional(),
  bot_configuration: z
    .object({
      numero_whatsapp_asignado: z.string().min(8).max(20),
      nombre_bot: z.string().max(60).optional(),
      tono_bot: z.enum(['formal', 'amigable', 'directo']).optional(),
      mensaje_bienvenida: z.string().max(1024).optional(),
      mensaje_menu_principal: z.string().max(1024).optional(),
      mensaje_fuera_horario: z.string().max(1024).optional(),
      mensaje_no_entendio: z.string().max(1024).optional(),
      mensaje_confirmacion_pedido: z.string().max(1024).optional(),
    })
    .optional(),
  template_slug: z.string().max(80).optional(),
});

/**
 * Crea un tenant atómicamente desde el panel admin.
 * Capa delgada de validación + delegación al repo. La transacción
 * (tenant + bot_configuration + bot_flow opcional) vive en createAtomic.
 */
export class CreateTenantUseCase {
  constructor(
    private readonly tenantRepository: TenantRepository,
    private readonly logger: pino.Logger,
  ) {}

  async execute(rawInput: unknown): Promise<{ id: string }> {
    const parsed = CreateTenantSchema.safeParse(rawInput);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new Error(`Validación: ${first.path.join('.')} - ${first.message}`);
    }
    const input = parsed.data as CreateTenantInput;
    const id = await this.tenantRepository.createAtomic(input);
    this.logger.info({ id, template: input.template_slug ?? null }, '✅ Tenant creado vía CreateTenantUseCase');
    return { id };
  }
}
