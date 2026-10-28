import { z } from 'zod';

/**
 * Esquemas Zod para Pagos Manuales, Resoluciones de Saldo, Filtros del Panel y KDS
 * Alineado con DEFINICION_TECNICA.md (v2.4.0) y FASE_04_PANEL_COMPLETO_COCINA_KDS_Y_COBROS_MANUALES.md
 */

// ---------------------------------------------------------------------------
// 1. Registro Manual de Cobros y Anulaciones (payments.manual)
// ---------------------------------------------------------------------------

export const PaymentMethodSchema = z.enum(['CASH', 'POS_TERMINAL', 'MANUAL_TRANSFER']);

export const RecordManualPaymentSchema = z
  .object({
    method: PaymentMethodSchema,
    amount_cop: z
      .number({ invalid_type_error: 'El monto debe ser numérico' })
      .int('El monto debe ser un entero en COP')
      .positive('El monto a cobrar debe ser mayor a 0'),
    cash_received_cop: z
      .number({ invalid_type_error: 'El efectivo recibido debe ser numérico' })
      .int('El efectivo recibido debe ser un entero en COP')
      .positive('El efectivo recibido debe ser mayor a 0')
      .optional()
      .nullable(),
    reference_note: z
      .string()
      .trim()
      .max(120, 'La nota de referencia no puede exceder 120 caracteres')
      .optional()
      .nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.method === 'CASH' && data.cash_received_cop != null) {
      if (data.cash_received_cop < data.amount_cop) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['cash_received_cop'],
          message: 'El efectivo recibido no puede ser inferior al monto a pagar.',
        });
      }
    }
  });

export type RecordManualPaymentDto = z.infer<typeof RecordManualPaymentSchema>;

/**
 * Calcula el cambio en efectivo dado el monto y el efectivo recibido
 */
export function calculateCashChange(amountCop: number, cashReceivedCop?: number | null): number {
  if (cashReceivedCop == null || cashReceivedCop < amountCop) {
    return 0;
  }
  return cashReceivedCop - amountCop;
}

export const VoidPaymentSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, 'El motivo de anulación debe tener al menos 5 caracteres')
    .max(500, 'El motivo de anulación no puede exceder 500 caracteres'),
});

export type VoidPaymentDto = z.infer<typeof VoidPaymentSchema>;

// ---------------------------------------------------------------------------
// 2. Resoluciones de Saldo (COURTESY / WRITTEN_OFF) y Reversiones
// ---------------------------------------------------------------------------

export const UncollectedResolutionTypeSchema = z.enum(['COURTESY', 'WRITTEN_OFF']);

export const ResolveUncollectedOrderSchema = z.object({
  resolution_type: UncollectedResolutionTypeSchema,
  reason: z
    .string()
    .trim()
    .min(5, 'El motivo de la resolución debe tener al menos 5 caracteres')
    .max(500, 'El motivo no puede exceder 500 caracteres'),
});

export type ResolveUncollectedOrderDto = z.infer<typeof ResolveUncollectedOrderSchema>;

export const RevertResolutionSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, 'El motivo de reversión debe tener al menos 5 caracteres')
    .max(500, 'El motivo no puede exceder 500 caracteres'),
});

export type RevertResolutionDto = z.infer<typeof RevertResolutionSchema>;

// ---------------------------------------------------------------------------
// 3. Filtros del Panel Completo de Órdenes
// ---------------------------------------------------------------------------

export const BranchOrdersFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().trim().optional(),
  payment_status: z.string().trim().optional(),
  origin: z.string().trim().optional(),
  fulfillment_type: z.string().trim().optional(),
  date_from: z.string().trim().optional(),
  date_to: z.string().trim().optional(),
  q: z.string().trim().optional(),
  tab: z
    .enum([
      'all',
      'pending_requests',
      'awaiting_prepayment',
      'in_preparation',
      'ready_or_in_transit',
      'uncollected_delivered',
    ])
    .default('all')
    .optional(),
});

export type BranchOrdersFilterDto = z.infer<typeof BranchOrdersFilterSchema>;

// ---------------------------------------------------------------------------
// 4. Pantalla de Cocina (KDS) y Estaciones
// ---------------------------------------------------------------------------

export const KitchenStationSchema = z.object({
  id: z.string().uuid().optional(),
  branch_id: z.string().uuid(),
  key: z.string().trim().min(2, 'La clave debe tener al menos 2 caracteres').max(40),
  name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(80),
  sort_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
  created_at: z.string().or(z.date()).optional(),
});

export type KitchenStationDto = z.infer<typeof KitchenStationSchema>;

export const CreateKitchenStationSchema = z.object({
  key: z.string().trim().min(2, 'La clave debe tener al menos 2 caracteres').max(40),
  name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(80),
  sort_order: z.number().int().default(0).optional(),
  is_active: z.boolean().default(true).optional(),
});

export type CreateKitchenStationDto = z.infer<typeof CreateKitchenStationSchema>;

export const UpdateKitchenStationSchema = CreateKitchenStationSchema.partial();
export type UpdateKitchenStationDto = z.infer<typeof UpdateKitchenStationSchema>;

export const UpdateKitchenItemStatusSchema = z.object({
  item_ids: z.array(z.string().uuid()).optional(),
  to_status: z.enum(['PREPARING', 'READY']),
});

export type UpdateKitchenItemStatusDto = z.infer<typeof UpdateKitchenItemStatusSchema>;
