import { describe, it, expect } from 'vitest';
import {
  allocateCollectedBreakdown,
  computeReceivableAndUncollected,
  verifyMasterReconciliationEquation,
} from '../src/utils/reporting-reconciliation.calculator';
import {
  formatThermalReceiptText,
  DIAN_THERMAL_RECEIPT_DISCLAIMER,
  ThermalReceiptData,
} from '../src/utils/thermal-receipt.formatter';

describe('Suite Unitaria Fase 05: TC-05-U01 a TC-05-U03 (Conciliación, Prelación y Pre-Recibo DIAN)', () => {
  // ---------------------------------------------------------------------------
  // TC-05-U01: Prelación de Imputación en Cobros Parciales
  // ---------------------------------------------------------------------------
  describe('TC-05-U01: Prelación de Imputación en Cobros Parciales (allocateCollectedBreakdown)', () => {
    const netProductsCop = 40000;
    const deliveryFeeCop = 5000;
    const tipCop = 4000;
    const grandTotalCop = 49000;

    it('debe imputar 100 % a productos cuando el abono es menor al valor de los productos', () => {
      // Caso 1: paidTotalCop = 25.000 COP (< 40.000)
      const res = allocateCollectedBreakdown({
        netProductsCop,
        deliveryFeeCop,
        tipCop,
        paidTotalCop: 25000,
      });

      expect(res.collected_products_cop).toBe(25000);
      expect(res.collected_delivery_cop).toBe(0);
      expect(res.collected_tips_cop).toBe(0);
      expect(res.collected_products_cop + res.collected_delivery_cop + res.collected_tips_cop).toBe(
        25000,
      );
    });

    it('debe cubrir el 100 % de productos y desbordar hacia domicilio cuando excede productos', () => {
      // Caso 2: paidTotalCop = 43.000 COP (40.000 prod + 3.000 de los 5.000 del domicilio)
      const res = allocateCollectedBreakdown({
        netProductsCop,
        deliveryFeeCop,
        tipCop,
        paidTotalCop: 43000,
      });

      expect(res.collected_products_cop).toBe(40000);
      expect(res.collected_delivery_cop).toBe(3000);
      expect(res.collected_tips_cop).toBe(0);
      expect(res.collected_products_cop + res.collected_delivery_cop + res.collected_tips_cop).toBe(
        43000,
      );
    });

    it('debe cubrir productos, domicilio y propina voluntaria al liquidar la orden completa', () => {
      // Caso 3: paidTotalCop = 49.000 COP (40.000 prod + 5.000 domicilio + 4.000 propina)
      const res = allocateCollectedBreakdown({
        netProductsCop,
        deliveryFeeCop,
        tipCop,
        paidTotalCop: grandTotalCop,
      });

      expect(res.collected_products_cop).toBe(40000);
      expect(res.collected_delivery_cop).toBe(5000);
      expect(res.collected_tips_cop).toBe(4000);
      expect(res.collected_products_cop + res.collected_delivery_cop + res.collected_tips_cop).toBe(
        49000,
      );
    });

    it('debe manejar pagos en cero sin errores ni valores negativos', () => {
      const res = allocateCollectedBreakdown({
        netProductsCop,
        deliveryFeeCop,
        tipCop,
        paidTotalCop: 0,
      });

      expect(res.collected_products_cop).toBe(0);
      expect(res.collected_delivery_cop).toBe(0);
      expect(res.collected_tips_cop).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // TC-05-U02: Ecuación Maestra de Conciliación con Resoluciones Mixtas
  // ---------------------------------------------------------------------------
  describe('TC-05-U02: Ecuación Maestra de Conciliación con Resoluciones Mixtas', () => {
    it('debe calcular correctamente los cubos financieros y cumplir la identidad contable', () => {
      // 5 órdenes de prueba:
      // 1. Pagada total: $55.000 (recaudo 55.000)
      const o1 = computeReceivableAndUncollected({
        grandTotalCop: 55000,
        paidTotalCop: 55000,
        paymentStatus: 'PAID',
      });
      expect(o1.pendingReceivableCop).toBe(0);
      expect(o1.courtesyCop).toBe(0);
      expect(o1.writtenOffCop).toBe(0);

      // 2. Parcial: $44.000 (abono 30.000 -> por cobrar 14.000)
      const o2 = computeReceivableAndUncollected({
        grandTotalCop: 44000,
        paidTotalCop: 30000,
        paymentStatus: 'PARTIALLY_PAID',
      });
      expect(o2.pendingReceivableCop).toBe(14000);
      expect(o2.courtesyCop).toBe(0);
      expect(o2.writtenOffCop).toBe(0);

      // 3. Sin pagar: $30.000 (abono 0 -> por cobrar 30.000)
      const o3 = computeReceivableAndUncollected({
        grandTotalCop: 30000,
        paidTotalCop: 0,
        paymentStatus: 'UNPAID',
      });
      expect(o3.pendingReceivableCop).toBe(30000);
      expect(o3.courtesyCop).toBe(0);
      expect(o3.writtenOffCop).toBe(0);

      // 4. Cortesía total: $25.000 (abono 0 -> cortesía 25.000)
      const o4 = computeReceivableAndUncollected({
        grandTotalCop: 25000,
        paidTotalCop: 0,
        paymentStatus: 'COURTESY',
        uncollectedAmountCop: 25000,
      });
      expect(o4.pendingReceivableCop).toBe(0);
      expect(o4.courtesyCop).toBe(25000);
      expect(o4.writtenOffCop).toBe(0);

      // 5. Saldo castigado (WRITTEN_OFF) con abono parcial: $35.000 (abono 10.000 -> castigo 25.000)
      const o5 = computeReceivableAndUncollected({
        grandTotalCop: 35000,
        paidTotalCop: 10000,
        paymentStatus: 'WRITTEN_OFF',
        uncollectedAmountCop: 25000,
      });
      expect(o5.pendingReceivableCop).toBe(0);
      expect(o5.courtesyCop).toBe(0);
      expect(o5.writtenOffCop).toBe(25000);

      // Consolidar totales:
      const grossBilledTotalCop = 55000 + 44000 + 30000 + 25000 + 35000; // $189.000
      const collectedTotalCop = 55000 + 30000 + 0 + 0 + 10000; // $95.000
      const pendingReceivableCop =
        o1.pendingReceivableCop +
        o2.pendingReceivableCop +
        o3.pendingReceivableCop +
        o4.pendingReceivableCop +
        o5.pendingReceivableCop; // 0 + 14.000 + 30.000 + 0 + 0 = $44.000
      const courtesyTotalCop =
        o1.courtesyCop + o2.courtesyCop + o3.courtesyCop + o4.courtesyCop + o5.courtesyCop; // $25.000
      const writtenOffTotalCop =
        o1.writtenOffCop +
        o2.writtenOffCop +
        o3.writtenOffCop +
        o4.writtenOffCop +
        o5.writtenOffCop; // $25.000

      // Comprobar la Ecuación Maestra de Conciliación:
      // 189.000 === 95.000 + 44.000 + 25.000 + 25.000
      const reconciliation = verifyMasterReconciliationEquation({
        grossBilledTotalCop,
        collectedTotalCop,
        pendingReceivableCop,
        courtesyTotalCop,
        writtenOffTotalCop,
      });

      expect(reconciliation.isBalanced).toBe(true);
      expect(reconciliation.discrepancyCop).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // TC-05-U03: Formateador de Pre-Recibo Térmico con Leyenda DIAN
  // ---------------------------------------------------------------------------
  describe('TC-05-U03: Formateador de Pre-Recibo Térmico con Leyenda DIAN', () => {
    const sampleReceiptData: ThermalReceiptData = {
      restaurantName: 'Karta Gourmet',
      branchName: 'Sede Zona G',
      branchAddress: 'Carrera 5 # 69-26',
      branchPhone: '+57 300 123 4567',
      orderCode: 'A1042',
      createdAt: '2026-10-28T18:30:00.000Z',
      origin: 'WHATSAPP',
      fulfillmentType: 'DELIVERY',
      tableName: null,
      customerName: 'Santiago Mejía',
      customerPhoneMasked: '+57 *** *** 4567',
      deliveryAddressMasked: 'Calle 72 # ***, Rosales',
      items: [
        {
          name: 'Hamburguesa Especial',
          variant: 'Doble Carne',
          quantity: 2,
          unitPriceCop: 22000,
          lineTotalCop: 44000,
          modifiers: [{ name: 'Tocineta Extra', priceCop: 3000 }],
          notes: 'Término medio',
        },
      ],
      subtotalProductsCop: 44000,
      taxProfileMode: 'TAX_INCLUDED_DISCRIMINATED',
      taxableBaseCop: 40741,
      taxIncCop: 3259,
      taxIvaCop: 0,
      discountTotalCop: 0,
      deliveryFeeCop: 5000,
      tipCop: 3000,
      grandTotalCop: 52000,
      payments: [
        {
          method: 'CASH',
          amountCop: 52000,
          cashReceivedCop: 100000,
          cashChangeCop: 48000,
        },
      ],
      paidTotalCop: 52000,
      pendingBalanceCop: 0,
    };

    it('debe incluir de forma obligatoria la leyenda fiscal DIAN exacta', () => {
      const receiptText80 = formatThermalReceiptText(sampleReceiptData, { width: '80mm' });
      expect(receiptText80.replace(/\s+/g, ' ')).toContain(
        DIAN_THERMAL_RECEIPT_DISCLAIMER.replace(/\s+/g, ' '),
      );
      expect(receiptText80).toContain('Documento informativo de control interno');
      expect(receiptText80).toContain('No sustituye la factura');
      expect(receiptText80).toContain('electrónica de venta');

      const receiptText58 = formatThermalReceiptText(sampleReceiptData, { width: '58mm' });
      expect(receiptText58.replace(/\s+/g, ' ')).toContain(
        DIAN_THERMAL_RECEIPT_DISCLAIMER.replace(/\s+/g, ' '),
      );
    });

    it('debe discriminar base e impuesto cuando taxProfileMode es discriminado', () => {
      const receiptText = formatThermalReceiptText(sampleReceiptData, { width: '80mm' });
      expect(receiptText).toContain('Base Gravable');
      expect(receiptText).toContain('Impoconsumo (8%)');
      expect(receiptText).toContain('Subtotal Productos');
      expect(receiptText).toContain('Costo Domicilio');
      expect(receiptText).toContain('Propina Voluntaria');
      expect(receiptText).toContain('TOTAL A PAGAR');
    });

    it('no debe discriminar base ni impuestos si taxProfileMode es FINAL_PRICE_NO_BREAKDOWN', () => {
      const noBreakdownData: ThermalReceiptData = {
        ...sampleReceiptData,
        taxProfileMode: 'FINAL_PRICE_NO_BREAKDOWN',
      };
      const receiptText = formatThermalReceiptText(noBreakdownData, { width: '80mm' });
      expect(receiptText).not.toContain('Base Gravable');
      expect(receiptText).not.toContain('Impoconsumo (8%)');
      expect(receiptText).toContain('Subtotal Productos');
      expect(receiptText).toContain('TOTAL A PAGAR');
    });

    it('debe mostrar desglose de efectivo recibido y cambio entregado', () => {
      const receiptText = formatThermalReceiptText(sampleReceiptData, { width: '80mm' });
      expect(receiptText).toContain('Efectivo Recibido');
      expect(receiptText).toContain('Cambio Entregado');
    });
  });
});
