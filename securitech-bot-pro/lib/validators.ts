/**
 * Esquemas Zod para validación de formularios y datos
 * Reutilizables en cliente y servidor
 */

import { z } from 'zod';
import { BusinessType, BotTone } from './types';

// ===== VALIDADORES BASE =====
const phoneNumberSchema = z.string()
  .regex(/^\+?[1-9]\d{1,14}$/, 'Número de teléfono WhatsApp inválido');

const horarioSchema = z.string()
  .regex(/^\d{1,2}:\d{2}[ap]m-\d{1,2}:\d{2}[ap]m$|^$/i, 'Formato de horario inválido (ej: 9am-7pm)');

// ===== SECCIÓN 1: DATOS DEL NEGOCIO =====
export const BusinessDataSchema = z.object({
  nombre_negocio: z.string()
    .min(3, 'El nombre debe tener al menos 3 caracteres')
    .max(100, 'El nombre no puede exceder 100 caracteres'),
  
  giro: z.enum([
    BusinessType.FERRETERIA,
    BusinessType.PAPELERIA,
    BusinessType.CERRAJERIA,
    BusinessType.PIZZERIA,
    BusinessType.SALON,
    BusinessType.MEDICO,
    BusinessType.REFACCIONARIA,
    BusinessType.FARMACIA,
    BusinessType.OTRO,
  ], {
    errorMap: () => ({ message: 'Giro comercial inválido' }),
  }),
  
  direccion: z.string()
    .min(5, 'La dirección debe tener al menos 5 caracteres')
    .max(200, 'La dirección no puede exceder 200 caracteres'),
  
  horario_semana: horarioSchema.optional().default(''),
  
  horario_sabado: horarioSchema.optional().default(''),
  
  abre_domingo: z.boolean().default(false),
});

// ===== SECCIÓN 2: DATOS DEL DUEÑO Y COBRANZA =====
export const OwnerDataSchema = z.object({
  nombre_dueno: z.string()
    .min(3, 'El nombre del dueño debe tener al menos 3 caracteres')
    .max(100, 'El nombre no puede exceder 100 caracteres'),
  
  whatsapp_dueno: phoneNumberSchema
    .refine(
      (val) => val.length >= 10,
      'El número de WhatsApp debe tener al menos 10 dígitos'
    ),
  
  monto_mensual: z.number()
    .min(0, 'El monto no puede ser negativo')
    .max(100000, 'El monto es demasiado alto'),
  
  fecha_proximo_pago: z.coerce.date()
    .min(new Date(), 'La fecha debe ser en el futuro'),
  
  notas_internas: z.string()
    .max(1000, 'Las notas no pueden exceder 1000 caracteres')
    .optional()
    .default(''),
});

// ===== SECCIÓN 3: CONFIGURACIÓN DEL BOT =====
export const BotConfigSchema = z.object({
  numero_whatsapp_asignado: phoneNumberSchema,
  
  nombre_bot: z.string()
    .min(2, 'El nombre del bot debe tener al menos 2 caracteres')
    .max(50, 'El nombre no puede exceder 50 caracteres'),
  
  tono_bot: z.enum([BotTone.FORMAL, BotTone.AMIGABLE, BotTone.DIRECTO], {
    errorMap: () => ({ message: 'Tono del bot inválido' }),
  }),
  
  mensaje_bienvenida: z.string()
    .min(10, 'El mensaje debe tener al menos 10 caracteres')
    .max(500, 'El mensaje no puede exceder 500 caracteres'),
  
  mensaje_menu_principal: z.string()
    .min(10, 'El mensaje debe tener al menos 10 caracteres')
    .max(1000, 'El mensaje no puede exceder 1000 caracteres'),
  
  mensaje_fuera_horario: z.string()
    .min(5, 'El mensaje debe tener al menos 5 caracteres')
    .max(500, 'El mensaje no puede exceder 500 caracteres'),
  
  mensaje_no_entendio: z.string()
    .min(5, 'El mensaje debe tener al menos 5 caracteres')
    .max(500, 'El mensaje no puede exceder 500 caracteres'),
  
  mensaje_confirmacion_pedido: z.string()
    .min(10, 'El mensaje debe tener al menos 10 caracteres')
    .max(500, 'El mensaje no puede exceder 500 caracteres'),
});

// ===== SECCIÓN 4: CATÁLOGO DE PRODUCTOS (MANUAL) =====
export const CatalogItemSchema = z.object({
  nombre_producto: z.string()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre no puede exceder 100 caracteres'),
  
  descripcion: z.string()
    .max(500, 'La descripción no puede exceder 500 caracteres')
    .optional()
    .default(''),
  
  precio: z.number()
    .min(0, 'El precio no puede ser negativo')
    .max(999999, 'El precio es demasiado alto'),
  
  categoria: z.string()
    .min(2, 'La categoría debe tener al menos 2 caracteres')
    .max(50, 'La categoría no puede exceder 50 caracteres'),
  
  disponible: z.boolean().default(true),
});

export const CatalogUploadSchema = z.object({
  archivo: z.instanceof(File)
    .refine((file) => file.size <= 10 * 1024 * 1024, 'El archivo no puede exceder 10MB')
    .refine((file) => file.type === 'application/pdf', 'El archivo debe ser un PDF'),
  
  items: z.array(CatalogItemSchema).optional().default([]),
});

// ===== SECCIÓN 5: ALERTAS Y SERVICIO URGENTE =====
export const UrgentServiceSchema = z.object({
  tiene_servicio_urgente: z.boolean().default(false),
  
  whatsapp_alertas_urgentes: phoneNumberSchema.optional().or(z.literal('')),
  
  mensaje_alerta_admin: z.string()
    .max(500, 'El mensaje no puede exceder 500 caracteres')
    .optional()
    .default(''),
  
  tiempo_respuesta_prometido: z.string()
    .max(50, 'El tiempo no puede exceder 50 caracteres')
    .optional()
    .default(''),
}).refine(
  (data) => !data.tiene_servicio_urgente || data.whatsapp_alertas_urgentes,
  {
    message: 'Se requiere número de WhatsApp para alertas urgentes',
    path: ['whatsapp_alertas_urgentes'],
  }
);

// ===== FORMULARIO COMPLETO: NUEVO CLIENTE =====
export const CreateClientFormSchema = z.object({
  // Sección 1
  ...BusinessDataSchema.shape,
  
  // Sección 2
  ...OwnerDataSchema.shape,
  
  // Sección 3
  ...BotConfigSchema.shape,
  
  // Sección 5
  ...UrgentServiceSchema.shape,
});

// Tipo inferido del esquema para TypeScript
export type CreateClientFormData = z.infer<typeof CreateClientFormSchema>;
export type BusinessData = z.infer<typeof BusinessDataSchema>;
export type OwnerData = z.infer<typeof OwnerDataSchema>;
export type BotConfig = z.infer<typeof BotConfigSchema>;
export type CatalogItem = z.infer<typeof CatalogItemSchema>;
export type UrgentService = z.infer<typeof UrgentServiceSchema>;

// ===== VALIDADORES DE LOGIN =====
export const LoginSchema = z.object({
  email: z.string()
    .email('Email inválido')
    .min(5, 'Email requerido'),
  
  password: z.string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .max(100, 'La contraseña es demasiado larga'),
});

export type LoginFormData = z.infer<typeof LoginSchema>;

