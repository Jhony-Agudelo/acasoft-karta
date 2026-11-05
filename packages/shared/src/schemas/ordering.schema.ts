import { z } from 'zod';

/**
 * Esquemas Zod para Gestión de Zonas de Domicilio, Creación de Pedidos Públicos y Clientes
 * Alineado con DEFINICION_TECNICA.md (v2.4.0) y FASE_03A_MOTOR_PEDIDOS_ANTIFRAUDE_Y_WHATSAPP.md
 */

// ---------------------------------------------------------------------------
// 1. Zonas de Domicilio y Cobertura
// ---------------------------------------------------------------------------
export const DeliveryZoneSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  branch_id: z.string().uuid(),
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(120),
  polygon_or_neighborhoods_json: z.any(),
  delivery_fee_cop: z.number().int().min(0, 'La tarifa no puede ser negativa'),
  min_order_cop: z.number().int().min(0, 'El pedido mínimo no puede ser negativo'),
  estimated_minutes_min: z.number().int().min(1, 'El tiempo estimado mínimo debe ser mayor a 0'),
  estimated_minutes_max: z.number().int().min(1, 'El tiempo estimado máximo debe ser mayor a 0'),
  is_active: z.boolean().default(true),
  created_at: z.string().or(z.date()).optional(),
});

export type DeliveryZoneDto = z.infer<typeof DeliveryZoneSchema>;

export const DeliveryZoneBaseSchema = z.object({
  name: z.string().trim().min(2, 'El nombre de la zona debe tener al menos 2 caracteres').max(120),
  polygon_or_neighborhoods_json: z.union([
    z.array(z.string().min(1)),
    z.object({
      type: z.string(),
      coordinates: z.array(z.any()),
    }),
  ]),
  delivery_fee_cop: z.number().int().min(0, 'La tarifa no puede ser negativa'),
  min_order_cop: z.number().int().min(0, 'El pedido mínimo no puede ser negativo'),
  estimated_minutes_min: z.number().int().min(1).default(30),
  estimated_minutes_max: z.number().int().min(1).default(50),
  is_active: z.boolean().default(true),
});

export const CreateDeliveryZoneDtoSchema = DeliveryZoneBaseSchema.refine(
  (data) => data.estimated_minutes_max >= data.estimated_minutes_min,
  {
    message: 'El tiempo estimado máximo debe ser mayor o igual al tiempo mínimo.',
    path: ['estimated_minutes_max'],
  },
);

export type CreateDeliveryZoneDto = z.infer<typeof CreateDeliveryZoneDtoSchema>;

export const UpdateDeliveryZoneDtoSchema = DeliveryZoneBaseSchema.partial();
export type UpdateDeliveryZoneDto = z.infer<typeof UpdateDeliveryZoneDtoSchema>;

// ---------------------------------------------------------------------------
// 2. Creación de Pedidos Públicos (Checkout Vitrina / WhatsApp)
// ---------------------------------------------------------------------------
export const CreatePublicOrderCustomerSchema = z.object({
  name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(150),
  phone: z.string().trim().min(7, 'Número telefónico demasiado corto').max(48),
  privacy_consent_accepted: z.literal(true, {
    errorMap: () => ({
      message: 'Debes aceptar la política de tratamiento de datos personales (Ley 1581 de 2012) para continuar.',
    }),
  }),
});

export type CreatePublicOrderCustomerDto = z.infer<typeof CreatePublicOrderCustomerSchema>;

export const CreatePublicOrderDeliverySchema = z.object({
  delivery_zone_id: z.string().uuid({ message: 'Identificador de zona de entrega inválido.' }),
  address_line: z.string().trim().min(5, 'La dirección debe tener al menos 5 caracteres').max(255),
  neighborhood: z.string().trim().min(2, 'El barrio debe tener al menos 2 caracteres').max(120),
  reference_notes: z.string().trim().max(300).nullable().optional(),
});

export type CreatePublicOrderDeliveryDto = z.infer<typeof CreatePublicOrderDeliverySchema>;

export const CreatePublicOrderItemModifierSchema = z.object({
  group_id: z.string().uuid({ message: 'Identificador de grupo inválido.' }),
  option_id: z.string().uuid({ message: 'Identificador de opción inválido.' }),
});

export type CreatePublicOrderItemModifierDto = z.infer<typeof CreatePublicOrderItemModifierSchema>;

export const CreatePublicOrderItemSchema = z.object({
  product_id: z.string().uuid({ message: 'Identificador de producto inválido.' }),
  variant_id: z.string().uuid().nullable().optional(),
  quantity: z.number().int().min(1, 'La cantidad debe ser de al menos 1 unidad'),
  modifiers: z.array(CreatePublicOrderItemModifierSchema).default([]),
  notes: z.string().trim().max(500).nullable().optional(),
});

export type CreatePublicOrderItemDto = z.infer<typeof CreatePublicOrderItemSchema>;

export const CreatePublicOrderSchema = z
  .object({
    branch_id: z.string().uuid({ message: 'Identificador de sucursal inválido.' }),
    origin: z.enum(['WHATSAPP', 'WEB_DIRECT', 'TABLE_QR', 'STAFF']),
    fulfillment_type: z.enum(['PICKUP', 'DELIVERY', 'DINE_IN']),
    customer: CreatePublicOrderCustomerSchema,
    delivery: CreatePublicOrderDeliverySchema.nullable().optional(),
    table_id: z.string().uuid().optional(),
    qr_token: z.string().optional(),
    table_pin: z.string().max(8).optional(),
    notes: z.string().trim().max(500).nullable().optional(),
    items: z.array(CreatePublicOrderItemSchema).min(1, 'El pedido debe contener al menos 1 producto'),
    payment_method: z.enum(['CASH', 'TRANSFER']).nullable().optional(),
    cash_amount_delivered_cop: z.number().int().nonnegative().nullable().optional(),
    change_to_give_cop: z.number().int().nonnegative().nullable().optional(),
    transfer_channel: z.string().trim().max(80).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.fulfillment_type === 'DELIVERY') {
      if (!data.delivery) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['delivery'],
          message: 'Los datos de dirección y zona de cobertura son obligatorios para pedidos con entrega a domicilio.',
        });
      } else {
        if (!data.delivery.delivery_zone_id) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['delivery', 'delivery_zone_id'],
            message: 'Debes seleccionar una zona de cobertura de entrega.',
          });
        }
        if (!data.delivery.address_line || data.delivery.address_line.trim().length < 5) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['delivery', 'address_line'],
            message: 'La dirección de entrega debe tener al menos 5 caracteres.',
          });
        }
        if (!data.delivery.neighborhood || data.delivery.neighborhood.trim().length < 2) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['delivery', 'neighborhood'],
            message: 'El barrio es obligatorio para pedidos a domicilio.',
          });
        }
      }
    }
  });

export type CreatePublicOrderDto = z.infer<typeof CreatePublicOrderSchema>;

// ---------------------------------------------------------------------------
// 3. Gestión y Moderación de Clientes (Admin / Antifraude)
// ---------------------------------------------------------------------------
export const BlockCustomerDtoSchema = z.object({
  is_blocked: z.boolean(),
  reason: z.string().trim().max(500).optional().nullable(),
});

export type BlockCustomerDto = z.infer<typeof BlockCustomerDtoSchema>;

export const CustomerFilterQuerySchema = z.object({
  q: z.string().trim().optional(),
  is_blocked: z
    .string()
    .optional()
    .transform((val) => (val === 'true' ? true : val === 'false' ? false : undefined)),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CustomerFilterQuery = z.infer<typeof CustomerFilterQuerySchema>;
