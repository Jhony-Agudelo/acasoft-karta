/**
 * Máquina de Estados Financieros y Función Determinista de Recálculo de Pagos
 * Alineado con DEFINICION_TECNICA.md (v2.4.0 — Sección 9.1.5) y FASE_04_PANEL_COMPLETO_COCINA_KDS_Y_COBROS_MANUALES.md
 */

import type { OrderPaymentStatus, OrderPaymentPolicy } from './order-status.machine';

export type PaymentPolicy = OrderPaymentPolicy;

export type PaymentMethod = 'CASH' | 'POS_TERMINAL' | 'MANUAL_TRANSFER';

export type PaymentRecordStatus = 'APPROVED' | 'VOIDED';

export type UncollectedResolutionType = 'COURTESY' | 'WRITTEN_OFF';

export interface RecalculatePaymentInput {
  paymentPolicy: PaymentPolicy;
  grandTotalCop: number;
  approvedPaymentsAmountsCop: number[];
  activeResolutionType?: UncollectedResolutionType | null;
}

export interface RecalculatePaymentResult {
  paidTotalCop: number;
  uncollectedAmountCop: number;
  paymentStatus: OrderPaymentStatus;
}

/**
 * Función pura determinista que recalcula el estado financiero de una orden.
 * Desacoplada del estado operativo (Order.status).
 *
 * Invariantes:
 * 1. Si policy === 'NONE' -> NOT_TRACKED, paidTotalCop = 0, uncollectedAmountCop = 0.
 * 2. paidTotalCop = sum(approvedPaymentsAmountsCop).
 * 3. Si paidTotalCop > grandTotalCop -> Lanza error 'PAYMENT_EXCEEDS_BALANCE'.
 * 4. Si activeResolutionType !== null -> status = activeResolutionType, uncollectedAmountCop = grandTotalCop - paidTotalCop.
 * 5. Si no hay resolución activa:
 *    - paidTotalCop === 0 -> UNPAID, uncollectedAmountCop = 0.
 *    - 0 < paidTotalCop < grandTotalCop -> PARTIALLY_PAID, uncollectedAmountCop = 0.
 *    - paidTotalCop === grandTotalCop -> PAID, uncollectedAmountCop = 0.
 */
export function recalculatePaymentState(input: RecalculatePaymentInput): RecalculatePaymentResult {
  const { paymentPolicy, grandTotalCop, approvedPaymentsAmountsCop, activeResolutionType = null } = input;

  if (paymentPolicy === 'NONE') {
    return {
      paidTotalCop: 0,
      uncollectedAmountCop: 0,
      paymentStatus: 'NOT_TRACKED',
    };
  }

  const paidTotalCop = approvedPaymentsAmountsCop.reduce((acc, curr) => acc + Math.trunc(curr), 0);

  if (paidTotalCop > grandTotalCop) {
    throw new Error('PAYMENT_EXCEEDS_BALANCE');
  }

  if (activeResolutionType !== null) {
    const uncollectedAmountCop = Math.max(0, grandTotalCop - paidTotalCop);
    return {
      paidTotalCop,
      uncollectedAmountCop,
      paymentStatus: activeResolutionType,
    };
  }

  if (paidTotalCop === 0) {
    return {
      paidTotalCop: 0,
      uncollectedAmountCop: 0,
      paymentStatus: 'UNPAID',
    };
  }

  if (paidTotalCop < grandTotalCop) {
    return {
      paidTotalCop,
      uncollectedAmountCop: 0,
      paymentStatus: 'PARTIALLY_PAID',
    };
  }

  return {
    paidTotalCop,
    uncollectedAmountCop: 0,
    paymentStatus: 'PAID',
  };
}
