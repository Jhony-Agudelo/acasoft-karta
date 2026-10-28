import { describe, it, expect } from 'vitest';
import {
  recalculatePaymentState,
  calculateCashChange,
  RecordManualPaymentSchema,
  computeAggregatedOrderKitchenStatus,
} from '../src';

describe('Fase 04 — Unit Tests: TC-04-U01 a TC-04-U04', () => {
  describe('TC-04-U01: Recálculo Exacto en Pagos Combinados y Anulación Parcial', () => {
    const grandTotalCop = 45000;

    it('debe retornar UNPAID con paidTotalCop = 0 cuando no hay pagos aprobados', () => {
      const res = recalculatePaymentState({
        paymentPolicy: 'OFFLINE_ONLY',
        grandTotalCop,
        approvedPaymentsAmountsCop: [],
      });

      expect(res.paymentStatus).toBe('UNPAID');
      expect(res.paidTotalCop).toBe(0);
      expect(res.uncollectedAmountCop).toBe(0);
    });

    it('debe retornar PARTIALLY_PAID con paidTotalCop = 10000 tras un primer abono', () => {
      const res = recalculatePaymentState({
        paymentPolicy: 'OFFLINE_ONLY',
        grandTotalCop,
        approvedPaymentsAmountsCop: [10000],
      });

      expect(res.paymentStatus).toBe('PARTIALLY_PAID');
      expect(res.paidTotalCop).toBe(10000);
      expect(res.uncollectedAmountCop).toBe(0);
    });

    it('debe retornar PAID con paidTotalCop = 45000 al completar el saldo con un segundo pago', () => {
      const res = recalculatePaymentState({
        paymentPolicy: 'OFFLINE_ONLY',
        grandTotalCop,
        approvedPaymentsAmountsCop: [10000, 35000],
      });

      expect(res.paymentStatus).toBe('PAID');
      expect(res.paidTotalCop).toBe(45000);
      expect(res.uncollectedAmountCop).toBe(0);
    });

    it('debe retornar PARTIALLY_PAID si se anula el pago de 35000 quedando solo 10000', () => {
      const res = recalculatePaymentState({
        paymentPolicy: 'OFFLINE_ONLY',
        grandTotalCop,
        approvedPaymentsAmountsCop: [10000],
      });

      expect(res.paymentStatus).toBe('PARTIALLY_PAID');
      expect(res.paidTotalCop).toBe(10000);
      expect(res.uncollectedAmountCop).toBe(0);
    });

    it('debe retornar NOT_TRACKED bajo política NONE sin importar montos', () => {
      const res = recalculatePaymentState({
        paymentPolicy: 'NONE',
        grandTotalCop: 50000,
        approvedPaymentsAmountsCop: [50000],
      });

      expect(res.paymentStatus).toBe('NOT_TRACKED');
      expect(res.paidTotalCop).toBe(0);
      expect(res.uncollectedAmountCop).toBe(0);
    });

    it('debe lanzar error PAYMENT_EXCEEDS_BALANCE si los pagos superan el total', () => {
      expect(() => {
        recalculatePaymentState({
          paymentPolicy: 'OFFLINE_ONLY',
          grandTotalCop: 30000,
          approvedPaymentsAmountsCop: [20000, 15000], // 35000 > 30000
        });
      }).toThrow('PAYMENT_EXCEEDS_BALANCE');
    });
  });

  describe('TC-04-U02: Cálculo de Cambio en Efectivo y Validación Zod', () => {
    it('debe calcular correctamente el cambio para amount_cop = 34500 y cash_received = 50000', () => {
      const change = calculateCashChange(34500, 50000);
      expect(change).toBe(15500);
    });

    it('debe rechazar mediante Zod si cash_received_cop es menor al monto a pagar', () => {
      const result = RecordManualPaymentSchema.safeParse({
        method: 'CASH',
        amount_cop: 34500,
        cash_received_cop: 30000,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error.issues.find((i) => i.path.includes('cash_received_cop'));
        expect(error).toBeDefined();
        expect(error?.message).toContain('El efectivo recibido no puede ser inferior');
      }
    });

    it('debe aceptar pago en efectivo sin desglose de cash_received_cop (ej. pago exacto)', () => {
      const result = RecordManualPaymentSchema.safeParse({
        method: 'CASH',
        amount_cop: 34500,
      });

      expect(result.success).toBe(true);
    });

    it('debe aceptar pago por transferencia o terminal POS sin cash_received_cop', () => {
      const resultPos = RecordManualPaymentSchema.safeParse({
        method: 'POS_TERMINAL',
        amount_cop: 45000,
        reference_note: 'Voucher #8841',
      });
      expect(resultPos.success).toBe(true);

      const resultTransfer = RecordManualPaymentSchema.safeParse({
        method: 'MANUAL_TRANSFER',
        amount_cop: 45000,
        reference_note: 'Comprobante Nequi M12094',
      });
      expect(resultTransfer.success).toBe(true);
    });
  });

  describe('TC-04-U03: Agregación de Estados de Estaciones KDS a Orden', () => {
    it('debe mantener ACCEPTED si todos los ítems siguen en PENDING', () => {
      const items = [
        { status: 'PENDING' },
        { status: 'PENDING' },
        { status: 'PENDING' },
      ];
      const aggregated = computeAggregatedOrderKitchenStatus('ACCEPTED', items);
      expect(aggregated).toBe('ACCEPTED');
    });

    it('debe retornar PREPARING cuando PARRILLA marca 2 ítems READY pero BEBIDAS sigue en PENDING', () => {
      const items = [
        { status: 'READY' }, // Parrilla 1
        { status: 'READY' }, // Parrilla 2
        { status: 'PENDING' }, // Bebidas
      ];
      const aggregated = computeAggregatedOrderKitchenStatus('ACCEPTED', items);
      expect(aggregated).toBe('PREPARING');
    });

    it('debe retornar READY cuando todos los ítems no cancelados están en READY', () => {
      const items = [
        { status: 'READY' },
        { status: 'READY' },
        { status: 'READY' },
      ];
      const aggregated = computeAggregatedOrderKitchenStatus('PREPARING', items);
      expect(aggregated).toBe('READY');
    });

    it('debe ignorar ítems CANCELLED al evaluar si la orden completa está READY', () => {
      const items = [
        { status: 'READY' },
        { status: 'READY' },
        { status: 'CANCELLED' }, // Ítem anulado
      ];
      const aggregated = computeAggregatedOrderKitchenStatus('PREPARING', items);
      expect(aggregated).toBe('READY');
    });
  });

  describe('TC-04-U04: Resolución COURTESY / WRITTEN_OFF con Pago Parcial Previo', () => {
    it('debe retornar WRITTEN_OFF con saldo castigado exacto sobre orden con abono previo', () => {
      const grandTotalCop = 50000;
      const approvedPayments = [20000];

      const res = recalculatePaymentState({
        paymentPolicy: 'OFFLINE_ONLY',
        grandTotalCop,
        approvedPaymentsAmountsCop: approvedPayments,
        activeResolutionType: 'WRITTEN_OFF',
      });

      expect(res.paymentStatus).toBe('WRITTEN_OFF');
      expect(res.paidTotalCop).toBe(20000);
      expect(res.uncollectedAmountCop).toBe(30000);
    });

    it('debe retornar COURTESY con saldo 100% perdonado si no había abonos previos', () => {
      const grandTotalCop = 30000;
      const approvedPayments: number[] = [];

      const res = recalculatePaymentState({
        paymentPolicy: 'OFFLINE_ONLY',
        grandTotalCop,
        approvedPaymentsAmountsCop: approvedPayments,
        activeResolutionType: 'COURTESY',
      });

      expect(res.paymentStatus).toBe('COURTESY');
      expect(res.paidTotalCop).toBe(0);
      expect(res.uncollectedAmountCop).toBe(30000);
    });
  });
});
