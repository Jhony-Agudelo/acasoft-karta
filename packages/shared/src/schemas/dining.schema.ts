import { z } from 'zod';
import { CreatePublicOrderItemSchema } from './ordering.schema';

/**
 * Esquemas Zod y Contratos DTO para Operación de Salón, Mesas, Cuentas y División
 * Alineado con DEFINICION_TECNICA.md (v2.4.0) y FASE_06_SALON_MESAS_Y_DIVISION_INFORMATIVA.md
 */

// ---------------------------------------------------------------------------
// 1. Áreas de Salón (DiningArea)
// ---------------------------------------------------------------------------
export const CreateDiningAreaSchema = z.object({
  name: z.string().trim().min(1, 'El nombre del área es requerido').max(80),
  sort_order: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
});

export type CreateDiningAreaDto = z.infer<typeof CreateDiningAreaSchema>;

export const UpdateDiningAreaSchema = CreateDiningAreaSchema.partial();
export type UpdateDiningAreaDto = z.infer<typeof UpdateDiningAreaSchema>;

// ---------------------------------------------------------------------------
// 2. Mesas de Salón (Table)
// ---------------------------------------------------------------------------
export const TableStatusEnum = z.enum(['FREE', 'OCCUPIED', 'PENDING_PAYMENT', 'RESERVED']);

export const CreateTableSchema = z.object({
  area_id: z.string().uuid({ message: 'Identificador de área inválido' }),
  code: z.string().trim().min(1, 'El código de la mesa es requerido').max(30),
  capacity: z.number().int().min(1, 'La capacidad mínima es de 1 persona').max(100).default(4),
  is_active: z.boolean().default(true),
});

export type CreateTableDto = z.infer<typeof CreateTableSchema>;

export const UpdateTableSchema = z.object({
  area_id: z.string().uuid({ message: 'Identificador de área inválido' }).optional(),
  code: z.string().trim().min(1).max(30).optional(),
  capacity: z.number().int().min(1).max(100).optional(),
  status: TableStatusEnum.optional(),
  is_active: z.boolean().optional(),
});

export type UpdateTableDto = z.infer<typeof UpdateTableSchema>;

// ---------------------------------------------------------------------------
// 3. Apertura de Cuenta de Salón (DiningAccount)
// ---------------------------------------------------------------------------
export const OpenDiningAccountSchema = z.object({
  table_id: z.string().uuid({ message: 'Identificador de mesa inválido' }),
  guest_count: z.number().int().min(1, 'Debe haber al menos 1 comensal').max(50).default(1),
});

export type OpenDiningAccountDto = z.infer<typeof OpenDiningAccountSchema>;

// ---------------------------------------------------------------------------
// 4. Adición de Comanda a Cuenta de Salón
// ---------------------------------------------------------------------------
export const AddOrderToAccountSchema = z.object({
  expected_account_version: z.number().int().min(1, 'La versión esperada de la cuenta debe ser >= 1'),
  items: z.array(CreatePublicOrderItemSchema).min(1, 'La comanda debe contener al menos 1 ítem'),
  notes: z.string().trim().max(500).nullable().optional(),
});

export type AddOrderToAccountDto = z.infer<typeof AddOrderToAccountSchema>;

// ---------------------------------------------------------------------------
// 5. Traslado de Mesa
// ---------------------------------------------------------------------------
export const TransferTableSchema = z.object({
  target_table_id: z.string().uuid({ message: 'Identificador de mesa destino inválido' }),
  expected_account_version: z.number().int().min(1, 'La versión esperada de la cuenta debe ser >= 1'),
  reason: z.string().trim().min(3, 'El motivo del traslado debe tener al menos 3 caracteres').max(500),
});

export type TransferTableDto = z.infer<typeof TransferTableSchema>;

// ---------------------------------------------------------------------------
// 6. Pre-Cuenta (Bill Preview: Descuento y Propina)
// ---------------------------------------------------------------------------
export const UpdateBillPreviewSchema = z.object({
  expected_account_version: z.number().int().min(1, 'La versión esperada de la cuenta debe ser >= 1'),
  discount_total_cop: z.number().int().min(0, 'El descuento no puede ser negativo').default(0),
  tip_cop: z.number().int().min(0, 'La propina no puede ser negativa').default(0),
});

export type UpdateBillPreviewDto = z.infer<typeof UpdateBillPreviewSchema>;

// ---------------------------------------------------------------------------
// 7. Distribución Informativa del Consumo por Persona
// ---------------------------------------------------------------------------
export const SplitRuleEnum = z.enum(['PROPORTIONAL', 'EQUAL', 'UNASSIGNED']);

export const DinerInputSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1, 'El nombre del comensal es requerido').max(60),
  sort_order: z.number().int().min(0).default(0),
});

export type DinerInputDto = z.infer<typeof DinerInputSchema>;

export const AssignmentInputSchema = z.object({
  diner_id: z.string().uuid({ message: 'Identificador de comensal inválido' }),
  order_item_id: z.string().uuid({ message: 'Identificador de ítem inválido' }),
  share_units: z.number().int().min(1, 'Las unidades deben ser al menos 1'),
  total_item_shares: z.number().int().min(1, 'El total de partes debe ser al menos 1'),
}).refine((data) => data.share_units <= data.total_item_shares, {
  message: 'Las partes asignadas no pueden superar el total de partes del ítem',
  path: ['share_units'],
});

export type AssignmentInputDto = z.infer<typeof AssignmentInputSchema>;

export const PutConsumptionDistributionSchema = z.object({
  expected_account_version: z.number().int().min(1, 'La versión esperada de la cuenta debe ser >= 1'),
  split_rule: SplitRuleEnum.default('PROPORTIONAL'),
  diners: z.array(DinerInputSchema).min(1, 'Debe registrar al menos 1 comensal'),
  assignments: z.array(AssignmentInputSchema).default([]),
});

export type PutConsumptionDistributionDto = z.infer<typeof PutConsumptionDistributionSchema>;

// ---------------------------------------------------------------------------
// 8. Cierre de Cuenta de Salón
// ---------------------------------------------------------------------------
export const CloseDiningAccountSchema = z.object({
  expected_account_version: z.number().int().min(1, 'La versión esperada de la cuenta debe ser >= 1'),
  resolution_type: z.enum(['COURTESY', 'WRITTEN_OFF']).optional(),
  reason: z.string().trim().min(5, 'El motivo de cierre con saldo no cobrado debe tener al menos 5 caracteres').max(500).optional(),
}).refine(
  (data) => {
    // Si resolution_type está presente, reason es obligatorio
    if (data.resolution_type && (!data.reason || data.reason.trim().length < 5)) {
      return false;
    }
    return true;
  },
  {
    message: 'Se requiere un motivo explicativo de al menos 5 caracteres al cerrar una cuenta con resolución especial.',
    path: ['reason'],
  },
);

export type CloseDiningAccountDto = z.infer<typeof CloseDiningAccountSchema>;

// ---------------------------------------------------------------------------
// 9. Reapertura de Cuenta de Salón
// ---------------------------------------------------------------------------
export const ReopenDiningAccountSchema = z.object({
  mode: z.enum(['ACCOUNTING_ONLY', 'FULL_TABLE'], {
    errorMap: () => ({ message: 'Modo de reapertura inválido. Debe ser ACCOUNTING_ONLY o FULL_TABLE.' }),
  }),
  reason: z.string().trim().min(5, 'El motivo de reapertura debe tener al menos 5 caracteres').max(500),
});

export type ReopenDiningAccountDto = z.infer<typeof ReopenDiningAccountSchema>;

// ---------------------------------------------------------------------------
// 10. Pago sobre Cuenta de Salón
// ---------------------------------------------------------------------------
export const CreateAccountPaymentSchema = z.object({
  expected_account_version: z.number().int().min(1).optional(),
  amount_cop: z.number().int().min(1, 'El monto del pago debe ser mayor a 0'),
  method: z.enum(['CASH', 'POS_TERMINAL', 'MANUAL_TRANSFER'], {
    errorMap: () => ({ message: 'Método de pago inválido.' }),
  }),
  reference: z.string().trim().max(120).nullable().optional(),
  cash_tendered_cop: z.number().int().min(0).nullable().optional(),
  idempotency_key: z.string().trim().min(8, 'La llave de idempotencia debe tener al menos 8 caracteres').max(120),
});

export type CreateAccountPaymentDto = z.infer<typeof CreateAccountPaymentSchema>;
