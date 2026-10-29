/**
 * Calculadora Pura de Imputación y Conciliación Contable (Fase 05)
 * Alineada con DEFINICION_TECNICA.md (v2.4.0 — Sección 4.9) y FASE_05_REPORTES_SUSCRIPCION_MANUAL_Y_PWA.md
 */

import { OrderPaymentStatus } from '../constants/order-status.machine';

export interface AllocateCollectedBreakdownParams {
  netProductsCop: number;
  deliveryFeeCop: number;
  tipCop: number;
  paidTotalCop: number;
}

export interface AllocatedCollectedBreakdownResult {
  collected_products_cop: number;
  collected_delivery_cop: number;
  collected_tips_cop: number;
}

/**
 * Regla de prelación determinista para imputación de pagos parciales:
 * 1.º Venta de productos e impuestos directos (hasta netProductsCop)
 * 2.º Recargo de domicilio (hasta deliveryFeeCop)
 * 3.º Propina voluntaria (hasta tipCop)
 *
 * Invariante obligatorio:
 * collected_products_cop + collected_delivery_cop + collected_tips_cop === paidTotalCop
 */
export function allocateCollectedBreakdown(
  params: AllocateCollectedBreakdownParams,
): AllocatedCollectedBreakdownResult {
  const { netProductsCop, deliveryFeeCop, tipCop, paidTotalCop } = params;

  const validPaid = Math.max(0, Math.trunc(paidTotalCop));
  const validProducts = Math.max(0, Math.trunc(netProductsCop));
  const validDelivery = Math.max(0, Math.trunc(deliveryFeeCop));
  const validTip = Math.max(0, Math.trunc(tipCop));

  // 1. Imputar a productos
  const collected_products_cop = Math.min(validPaid, validProducts);

  // 2. Remanente hacia domicilio
  const remainingAfterProducts = Math.max(0, validPaid - validProducts);
  const collected_delivery_cop = Math.min(remainingAfterProducts, validDelivery);

  // 3. Remanente hacia propina
  const remainingAfterDelivery = Math.max(0, remainingAfterProducts - validDelivery);
  const collected_tips_cop = Math.min(remainingAfterDelivery, validTip);

  return {
    collected_products_cop,
    collected_delivery_cop,
    collected_tips_cop,
  };
}

export interface ComputeReceivableAndUncollectedParams {
  grandTotalCop: number;
  paidTotalCop: number;
  paymentStatus: OrderPaymentStatus;
  uncollectedAmountCop?: number;
}

export interface ReceivableAndUncollectedResult {
  pendingReceivableCop: number;
  courtesyCop: number;
  writtenOffCop: number;
}

/**
 * Determina el saldo pendiente por cobrar o no recaudado según el estado financiero de la orden:
 * - UNPAID / PARTIALLY_PAID: Saldo pendiente = grandTotalCop - paidTotalCop.
 * - COURTESY: Cortesía autorizada = uncollectedAmountCop (o grandTotalCop - paidTotalCop).
 * - WRITTEN_OFF: Saldo castigado = uncollectedAmountCop (o grandTotalCop - paidTotalCop).
 * - PAID: 0 en todos los rubros.
 * - NOT_TRACKED: 0 en todos los rubros (no altera saldos contables).
 */
export function computeReceivableAndUncollected(
  params: ComputeReceivableAndUncollectedParams,
): ReceivableAndUncollectedResult {
  const { grandTotalCop, paidTotalCop, paymentStatus, uncollectedAmountCop } = params;

  const validGrand = Math.max(0, Math.trunc(grandTotalCop));
  const validPaid = Math.max(0, Math.trunc(paidTotalCop));
  const fallbackUncollected = Math.max(0, validGrand - validPaid);
  const resolvedUncollected =
    uncollectedAmountCop != null && uncollectedAmountCop >= 0
      ? Math.trunc(uncollectedAmountCop)
      : fallbackUncollected;

  switch (paymentStatus) {
    case 'UNPAID':
    case 'PARTIALLY_PAID':
      return {
        pendingReceivableCop: Math.max(0, validGrand - validPaid),
        courtesyCop: 0,
        writtenOffCop: 0,
      };

    case 'COURTESY':
      return {
        pendingReceivableCop: 0,
        courtesyCop: resolvedUncollected,
        writtenOffCop: 0,
      };

    case 'WRITTEN_OFF':
      return {
        pendingReceivableCop: 0,
        courtesyCop: 0,
        writtenOffCop: resolvedUncollected,
      };

    case 'PAID':
    case 'NOT_TRACKED':
    default:
      return {
        pendingReceivableCop: 0,
        courtesyCop: 0,
        writtenOffCop: 0,
      };
  }
}

export interface MasterReconciliationEquationParams {
  grossBilledTotalCop: number;
  collectedTotalCop: number;
  pendingReceivableCop: number;
  courtesyTotalCop: number;
  writtenOffTotalCop: number;
}

/**
 * Ecuación Maestra de Conciliación Contable de Karta:
 * gross_billed_total_cop === collected_total_cop + pending_receivable_cop + courtesy_total_cop + written_off_total_cop
 */
export function verifyMasterReconciliationEquation(
  params: MasterReconciliationEquationParams,
): {
  isBalanced: boolean;
  discrepancyCop: number;
} {
  const {
    grossBilledTotalCop,
    collectedTotalCop,
    pendingReceivableCop,
    courtesyTotalCop,
    writtenOffTotalCop,
  } = params;

  const rightSideTotal =
    collectedTotalCop + pendingReceivableCop + courtesyTotalCop + writtenOffTotalCop;
  const discrepancyCop = grossBilledTotalCop - rightSideTotal;

  return {
    isBalanced: discrepancyCop === 0,
    discrepancyCop,
  };
}
