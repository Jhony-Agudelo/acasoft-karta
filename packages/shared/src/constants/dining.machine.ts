/**
 * Máquina de Estados de Salón, Mesas y Cuentas de Comedor
 * Alineado con DEFINICION_TECNICA.md (v2.4.0 — Sección 9.1.4) y FASE_06_SALON_MESAS_Y_DIVISION_INFORMATIVA.md
 */

export type TableStatus = 'FREE' | 'OCCUPIED' | 'PENDING_PAYMENT' | 'RESERVED';

export type DiningAccountStatus = 'OPEN' | 'REOPENED_ACCOUNTING' | 'CLOSED' | 'CANCELLED';

export type AccountReopenMode = 'ACCOUNTING_ONLY' | 'FULL_TABLE';

export type ConsumptionSplitRule = 'PROPORTIONAL' | 'EQUAL' | 'UNASSIGNED';

export type DiningAccountPaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'COURTESY' | 'WRITTEN_OFF';

export type DiningResolutionType = 'COURTESY' | 'WRITTEN_OFF';

/**
 * Matriz de transiciones válidas para una mesa física.
 */
const VALID_TABLE_TRANSITIONS: Record<TableStatus, TableStatus[]> = {
  FREE: ['OCCUPIED', 'RESERVED'],
  OCCUPIED: ['PENDING_PAYMENT', 'FREE'],
  PENDING_PAYMENT: ['FREE', 'OCCUPIED'],
  RESERVED: ['FREE', 'OCCUPIED'],
};

/**
 * Valida si la mesa puede transicionar de un estado a otro.
 */
export function canTransitionTableStatus(from: TableStatus, to: TableStatus): boolean {
  if (from === to) return true;
  return VALID_TABLE_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Matriz de transiciones válidas para una cuenta de salón (DiningAccount).
 */
const VALID_ACCOUNT_TRANSITIONS: Record<DiningAccountStatus, DiningAccountStatus[]> = {
  OPEN: ['CLOSED', 'CANCELLED'],
  REOPENED_ACCOUNTING: ['CLOSED', 'CANCELLED'],
  CLOSED: ['OPEN', 'REOPENED_ACCOUNTING'], // Solo mediante endpoint de reapertura auditada
  CANCELLED: [], // Estado terminal
};

/**
 * Valida si la cuenta de salón puede transicionar de un estado a otro.
 */
export function canTransitionDiningAccountStatus(
  from: DiningAccountStatus,
  to: DiningAccountStatus,
): boolean {
  if (from === to) return true;
  return VALID_ACCOUNT_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Acciones operativas y contables permitidas sobre una DiningAccount.
 */
export type DiningAccountAction =
  | 'ADD_ORDER'
  | 'PAYMENT'
  | 'VOID_PAYMENT'
  | 'CLOSE'
  | 'BILL_PREVIEW'
  | 'TRANSFER_TABLE'
  | 'SPLIT_CONSUMPTION';

/**
 * Determina si una acción está permitida según el estado actual de la cuenta.
 *
 * Reglas de negocio:
 * 1. OPEN: Permite todas las acciones operativas y de cobro.
 * 2. REOPENED_ACCOUNTING: Es exclusivamente contable en caja. NO permite ADD_ORDER ni TRANSFER_TABLE.
 * 3. CLOSED: Congelada financieramente. No permite ninguna acción directa (debe reabrirse antes).
 * 4. CANCELLED: Congelada / terminal.
 */
export function isActionAllowedOnAccount(
  status: DiningAccountStatus,
  action: DiningAccountAction,
): boolean {
  if (status === 'OPEN') {
    return true;
  }

  if (status === 'REOPENED_ACCOUNTING') {
    // Prohibido agregar nuevas comandas de comida o trasladar mesa física
    if (action === 'ADD_ORDER' || action === 'TRANSFER_TABLE') {
      return false;
    }
    // Permitido: pagos, anulaciones de pago, pre-cuenta, cierre, distribución informativa
    return true;
  }

  return false;
}
