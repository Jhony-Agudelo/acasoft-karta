import { z } from 'zod';

/**
 * Esquemas Zod y Tipos para Gestión de Turnos y Arqueo Ciego de Caja (payments.cash_shifts)
 * Alineado con DEFINICION_TECNICA.md (v2.5.0) y FASE_07_TURNOS_Y_ARQUEO_CIEGO_DE_CAJA.md
 */

// ---------------------------------------------------------------------------
// 1. Constantes y Enumeraciones
// ---------------------------------------------------------------------------

export const CashShiftStatusEnum = z.enum(['OPEN', 'CLOSED']);
export type CashShiftStatus = z.infer<typeof CashShiftStatusEnum>;

export const CashShiftMovementTypeEnum = z.enum(['CASH_IN', 'CASH_OUT']);
export type CashShiftMovementType = z.infer<typeof CashShiftMovementTypeEnum>;

export const CashShiftMovementCategoryEnum = z.enum([
  'SUPPLIER_PAYMENT',
  'PETTY_EXPENSE',
  'CHANGE_FUND',
  'OTHER',
]);
export type CashShiftMovementCategory = z.infer<typeof CashShiftMovementCategoryEnum>;

// ---------------------------------------------------------------------------
// 2. Apertura de Turno (POST /api/v1/branches/:branchId/cash-shifts/open)
// ---------------------------------------------------------------------------

export const OpenCashShiftSchema = z.object({
  opening_cash_cop: z
    .number({ invalid_type_error: 'La base inicial debe ser un número entero' })
    .int('La base inicial debe ser un entero en COP')
    .min(0, 'La base inicial no puede ser negativa'),
  notes: z.string().trim().max(500, 'Las notas no pueden superar 500 caracteres').optional(),
});

export type OpenCashShiftDto = z.infer<typeof OpenCashShiftSchema>;

// ---------------------------------------------------------------------------
// 3. Movimientos Menores (POST /api/v1/cash-shifts/:shiftId/movements)
// ---------------------------------------------------------------------------

export const CreateCashShiftMovementSchema = z.object({
  type: CashShiftMovementTypeEnum,
  category: CashShiftMovementCategoryEnum,
  amount_cop: z
    .number({ invalid_type_error: 'El monto debe ser numérico' })
    .int('El monto debe ser un entero en COP')
    .positive('El monto del movimiento debe ser mayor a 0 COP'),
  reason: z
    .string()
    .trim()
    .min(3, 'El motivo debe tener al menos 3 caracteres')
    .max(500, 'El motivo no puede superar 500 caracteres'),
  reference_doc: z
    .string()
    .trim()
    .max(120, 'La referencia o recibo no puede superar 120 caracteres')
    .nullable()
    .optional(),
});

export type CreateCashShiftMovementDto = z.infer<typeof CreateCashShiftMovementSchema>;

// ---------------------------------------------------------------------------
// 4. Arqueo y Cierre Ciego de Turno (POST /api/v1/cash-shifts/:shiftId/close)
// ---------------------------------------------------------------------------

export const CloseCashShiftSchema = z.object({
  declared_cash_cop: z
    .number({ invalid_type_error: 'El monto declarado debe ser numérico' })
    .int('El monto declarado debe ser un entero en COP')
    .min(0, 'El monto declarado no puede ser negativo'),
  denominations_snapshot_json: z
    .record(z.string(), z.number().int().min(0))
    .nullable()
    .optional(),
  closing_notes: z
    .string()
    .trim()
    .max(500, 'Las observaciones de cierre no pueden superar 500 caracteres')
    .nullable()
    .optional(),
});

export type CloseCashShiftDto = z.infer<typeof CloseCashShiftSchema>;

// ---------------------------------------------------------------------------
// 5. Filtros de Consulta de Turnos (GET /api/v1/branches/:branchId/cash-shifts)
// ---------------------------------------------------------------------------

export const CashShiftFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: CashShiftStatusEnum.optional(),
  date_from: z.string().trim().optional(),
  date_to: z.string().trim().optional(),
});

export type CashShiftFilterDto = z.infer<typeof CashShiftFilterSchema>;

// ---------------------------------------------------------------------------
// 6. Funciones Puras de Cálculo de Arqueo
// ---------------------------------------------------------------------------

/**
 * Calcula el efectivo físico que determinísticamente debe haber en gaveta:
 * expected_cash = opening_cash + cash_sales + cash_in_total - cash_out_total
 */
export function calculateCashShiftExpectedCash(params: {
  openingCashCop: number;
  cashSalesCop: number;
  cashInTotalCop: number;
  cashOutTotalCop: number;
}): number {
  return (
    params.openingCashCop +
    params.cashSalesCop +
    params.cashInTotalCop -
    params.cashOutTotalCop
  );
}

/**
 * Calcula la diferencia de caja:
 * difference = declared_cash - expected_cash
 * 0: Cuadrado exacto
 * < 0: Faltante de dinero
 * > 0: Sobrante de dinero
 */
export function calculateCashShiftDifference(
  declaredCashCop: number,
  expectedCashCop: number,
): number {
  return declaredCashCop - expectedCashCop;
}

