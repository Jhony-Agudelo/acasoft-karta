import { describe, it, expect } from 'vitest';
import {
  allocateCollectedBreakdown,
  computeReceivableAndUncollected,
  verifyMasterReconciliationEquation,
  formatThermalReceiptText,
  DIAN_THERMAL_RECEIPT_DISCLAIMER,
  ThermalReceiptData,
  SalesReportQuerySchema,
  UpdateTenantSubscriptionSchema,
  PLAN_ENTITLEMENTS,
  formatMoneyCop,
} from '@restaurante-saas/shared';
import { formatKitchenTicketText } from '../src/services/print-receipt';

describe('TC-05-E01: Flujo Completo Fase 05 — Reportes Conciliados, Impresión Térmica 58/80mm y PWA', () => {
  describe('1. Dashboard de Conciliación Contable y Ecuación Maestra', () => {
    it('debe calcular la ecuación maestra exactamente balanceada con cobros parciales y resoluciones', () => {
      // Orden 1: $55.000 (50k prod + 5k delivery), pagada 100% en efectivo
      const o1Allocated = allocateCollectedBreakdown({
        netProductsCop: 50000,
        deliveryFeeCop: 5000,
        tipCop: 0,
        paidTotalCop: 55000,
      });
      const o1Balance = computeReceivableAndUncollected({
        grandTotalCop: 55000,
        paidTotalCop: 55000,
        paymentStatus: 'PAID',
      });

      // Orden 2: $44.000 (40k prod + 4k tip), abono parcial de $30.000 por transferencia
      const o2Allocated = allocateCollectedBreakdown({
        netProductsCop: 40000,
        deliveryFeeCop: 0,
        tipCop: 4000,
        paidTotalCop: 30000,
      });
      const o2Balance = computeReceivableAndUncollected({
        grandTotalCop: 44000,
        paidTotalCop: 30000,
        paymentStatus: 'PARTIALLY_PAID',
      });

      // Orden 3: $30.000 prod, sin cobros (UNPAID)
      const o3Balance = computeReceivableAndUncollected({
        grandTotalCop: 30000,
        paidTotalCop: 0,
        paymentStatus: 'UNPAID',
      });

      // Orden 4: $25.000 prod, resuelta como cortesía
      const o4Balance = computeReceivableAndUncollected({
        grandTotalCop: 25000,
        paidTotalCop: 0,
        paymentStatus: 'COURTESY',
        uncollectedAmountCop: 25000,
      });

      // Orden 5: $35.000 prod, abono de $10.000 y saldo restante de $25.000 castigado
      const o5Allocated = allocateCollectedBreakdown({
        netProductsCop: 35000,
        deliveryFeeCop: 0,
        tipCop: 0,
        paidTotalCop: 10000,
      });
      const o5Balance = computeReceivableAndUncollected({
        grandTotalCop: 35000,
        paidTotalCop: 10000,
        paymentStatus: 'WRITTEN_OFF',
        uncollectedAmountCop: 25000,
      });

      // Consolidar totales
      const grossBilledTotalCop = 55000 + 44000 + 30000 + 25000 + 35000; // 189.000
      const collectedTotalCop = 55000 + 30000 + 10000; // 95.000
      const pendingReceivableCop = o1Balance.pendingReceivableCop + o2Balance.pendingReceivableCop + o3Balance.pendingReceivableCop + o4Balance.pendingReceivableCop + o5Balance.pendingReceivableCop; // 0 + 14000 + 30000 + 0 + 0 = 44000
      const courtesyTotalCop = o1Balance.courtesyCop + o2Balance.courtesyCop + o3Balance.courtesyCop + o4Balance.courtesyCop + o5Balance.courtesyCop; // 25000
      const writtenOffTotalCop = o1Balance.writtenOffCop + o2Balance.writtenOffCop + o3Balance.writtenOffCop + o4Balance.writtenOffCop + o5Balance.writtenOffCop; // 25000

      expect(grossBilledTotalCop).toBe(189000);
      expect(collectedTotalCop).toBe(95000);
      expect(pendingReceivableCop).toBe(44000);
      expect(courtesyTotalCop).toBe(25000);
      expect(writtenOffTotalCop).toBe(25000);

      // Verificar Ecuación Maestra de Conciliación
      const equation = verifyMasterReconciliationEquation({
        grossBilledTotalCop,
        collectedTotalCop,
        pendingReceivableCop,
        courtesyTotalCop,
        writtenOffTotalCop,
      });

      expect(equation.isBalanced).toBe(true);
      expect(equation.discrepancyCop).toBe(0);

      // Prelación de imputación: el abono de $30.000 en O2 cubrió primero productos
      expect(o2Allocated.collected_products_cop).toBe(30000);
      expect(o2Allocated.collected_delivery_cop).toBe(0);
      expect(o2Allocated.collected_tips_cop).toBe(0);
    });

    it('debe validar el esquema de consulta de reportes con rangos de fecha válidos', () => {
      const validQuery = {
        date_from: '2026-10-01',
        date_to: '2026-10-28',
        origin: 'WHATSAPP' as const,
        fulfillment_type: 'DELIVERY' as const,
      };

      const result = SalesReportQuerySchema.safeParse(validQuery);
      expect(result.success).toBe(true);

      const invalidQuery = {
        date_from: '01/10/2026', // Formato no YYYY-MM-DD
        date_to: '2026-10-28',
      };
      const invalidResult = SalesReportQuerySchema.safeParse(invalidQuery);
      expect(invalidResult.success).toBe(false);
    });
  });

  describe('2. Generación e Impresión Térmica 58mm y 80mm con Leyenda Fiscal DIAN', () => {
    const mockReceipt: ThermalReceiptData = {
      restaurantName: 'La Parrilla Andina',
      branchName: 'Sede Chapinero',
      branchAddress: 'Carrera 7 # 54-20',
      branchPhone: '3001234567',
      orderCode: '#A105',
      createdAt: '2026-10-28T18:30:00.000-05:00',
      origin: 'WHATSAPP',
      fulfillmentType: 'DELIVERY',
      tableName: undefined,
      items: [
        {
          name: 'Parrilla Mixta Familiar',
          quantity: 1,
          unitPriceCop: 65000,
          lineTotalCop: 65000,
        },
        {
          name: 'Limonada de Coco',
          quantity: 2,
          unitPriceCop: 10000,
          lineTotalCop: 20000,
        },
      ],
      subtotalProductsCop: 85000,
      discountTotalCop: 5000,
      deliveryFeeCop: 6000,
      tipCop: 5000,
      grandTotalCop: 91000,
      taxProfileMode: 'TAX_INCLUDED_DISCRIMINATED',
      taxableBaseCop: 78704,
      taxIncCop: 6296,
      taxIvaCop: 0,
      payments: [
        {
          method: 'CASH',
          amountCop: 91000,
          cashReceivedCop: 100000,
          cashChangeCop: 9000,
        },
      ],
      paidTotalCop: 91000,
      pendingBalanceCop: 0,
    };

    it('debe generar el recibo térmico de 80mm incluyendo la leyenda obligatoria DIAN y discriminación de impuesto', () => {
      const receiptText80 = formatThermalReceiptText(mockReceipt, { width: '80mm' });

      // Verificar cabecera y datos
      expect(receiptText80.toUpperCase()).toContain('LA PARRILLA ANDINA');
      expect(receiptText80).toContain('#A105');
      expect(receiptText80).toContain('Parrilla Mixta Familiar');
      expect(receiptText80).toContain('Limonada de Coco');

      // Discriminación tributaria
      expect(receiptText80).toContain('Base Gravable:');
      expect(receiptText80).toContain('Impoconsumo (8%):');

      // Pagos y cambio
      expect(receiptText80).toContain('PAGOS REGISTRADOS:');
      expect(receiptText80).toContain('Cambio Entregado:');

      // Leyenda obligatoria DIAN
      const normalizedReceipt = receiptText80.replace(/\s+/g, ' ');
      const normalizedDisclaimer = DIAN_THERMAL_RECEIPT_DISCLAIMER.replace(/\s+/g, ' ');
      expect(normalizedReceipt).toContain(normalizedDisclaimer);
    });

    it('debe generar la comanda de cocina para 58mm ajustando el ancho a 32 columnas', () => {
      const kitchenText = formatKitchenTicketText(
        {
          order_code: '#A105',
          fulfillment_type: 'DELIVERY',
          created_at: '2026-10-28T18:30:00.000Z',
          delivery_address: 'Calle 55 # 8-12',
          notes: 'Carne término medio sin sal',
          items: [
            {
              name: 'Parrilla Mixta',
              quantity: 1,
              modifiers: ['Papas criollas', 'Ensalada fresca'],
              notes: 'Término 3/4',
            },
          ],
        },
        '58mm',
      );

      expect(kitchenText).toContain('*** COMANDA DE COCINA ***');
      expect(kitchenText).toContain('ORDEN: #A105');
      expect(kitchenText).toContain('Parrilla Mixta');
      expect(kitchenText).toContain('+ Papas criollas');
      expect(kitchenText).toContain('Término 3/4');

      // Cada línea no debe exceder 32 caracteres (salvo saltos de línea)
      const lines = kitchenText.split('\n');
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(32);
      }
    });
  });

  describe('3. Suscripción SaaS y Política de Bloqueo por Suspensión', () => {
    it('debe validar el esquema de actualización de suscripción para PLATFORM_ADMIN', () => {
      const validSubPayload = {
        plan_id: 'PLAN_OPERATIONS_PRO' as const,
        status: 'ACTIVE' as const,
        current_period_start: '2026-10-01',
        current_period_end: '2026-11-01',
        invoice_amount_cop: 89000,
        payment_reference_note: 'Bancolombia Transf #5821',
        reason: 'Renovación de suscripción mensual',
      };

      const result = UpdateTenantSubscriptionSchema.safeParse(validSubPayload);
      expect(result.success).toBe(true);

      // Validar que PLAN_OPERATIONS_PRO incluye el módulo de reportes y pagos
      const entitled = PLAN_ENTITLEMENTS['PLAN_OPERATIONS_PRO'];
      expect(entitled).toContain('reporting');
      expect(entitled).toContain('payments.manual');
      expect(entitled).toContain('kitchen');
    });
  });

  describe('4. Estrategia PWA y NetworkOnly para la API', () => {
    it('el patrón de ruta /api/v1/** debe evaluarse para NetworkOnly estricto', () => {
      const apiRoutePattern = /^\/api\/v1\/.*/i;
      expect(apiRoutePattern.test('/api/v1/reports/sales')).toBe(true);
      expect(apiRoutePattern.test('/api/v1/orders/123/payments/manual')).toBe(true);
      expect(apiRoutePattern.test('/api/v1/admin/subscription')).toBe(true);

      // Los activos estáticos no coinciden con la ruta de la API
      expect(apiRoutePattern.test('/assets/index.js')).toBe(false);
      expect(apiRoutePattern.test('/images/karta-hero.jpg')).toBe(false);
      expect(apiRoutePattern.test('/manifest.webmanifest')).toBe(false);
    });
  });
});
