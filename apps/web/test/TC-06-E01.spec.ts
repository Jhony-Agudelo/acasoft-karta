import { describe, it, expect } from 'vitest';
import {
  calculateConsumptionDistribution,
  calculateConsumptionSplit,
  TableStatus,
  DiningAccountStatus,
  canTransitionTableStatus,
  canTransitionDiningAccountStatus,
  formatDiningPreCuentaText,
  DIAN_DINING_DISCLAIMER,
  verifyMasterReconciliationEquation,
  formatMoneyCop,
} from '@restaurante-saas/shared';

describe('TC-06-E01: Flujo Completo Fase 06 — Salón, Mesas, Distribución Informativa y Pre-Cuenta Térmica', () => {
  describe('1. Ciclo de Vida y Transiciones de Mesa y Cuenta de Salón', () => {
    it('debe validar la secuencia completa de estados de mesa FREE -> OCCUPIED -> PENDING_PAYMENT -> FREE', () => {
      // 1. Apertura de mesa
      expect(canTransitionTableStatus('FREE', 'OCCUPIED')).toBe(true);

      // 2. Solicitud de pre-cuenta
      expect(canTransitionTableStatus('OCCUPIED', 'PENDING_PAYMENT')).toBe(true);

      // 3. Si se agrega una nueva comanda mientras estaba en pre-cuenta, regresa a OCCUPIED
      expect(canTransitionTableStatus('PENDING_PAYMENT', 'OCCUPIED')).toBe(true);

      // 4. Volver a pedir pre-cuenta y pagar el 100% libera la mesa
      expect(canTransitionTableStatus('PENDING_PAYMENT', 'FREE')).toBe(true);

      // 5. Transiciones inválidas
      expect(canTransitionTableStatus('FREE', 'PENDING_PAYMENT')).toBe(false);
      expect(canTransitionTableStatus('OCCUPIED', 'RESERVED')).toBe(false);
    });

    it('debe validar las transiciones de DiningAccount soportando reapertura contable ACCOUNTING_ONLY', () => {
      // OPEN -> CLOSED
      expect(canTransitionDiningAccountStatus('OPEN', 'CLOSED')).toBe(true);

      // CLOSED -> REOPENED_ACCOUNTING (para corregir pagos en caja sin ocupar la mesa)
      expect(canTransitionDiningAccountStatus('CLOSED', 'REOPENED_ACCOUNTING')).toBe(true);

      // REOPENED_ACCOUNTING -> CLOSED (tras corregir o registrar cobro)
      expect(canTransitionDiningAccountStatus('REOPENED_ACCOUNTING', 'CLOSED')).toBe(true);

      // CLOSED -> OPEN (solo si la mesa física está FREE en modo FULL_TABLE)
      expect(canTransitionDiningAccountStatus('CLOSED', 'OPEN')).toBe(true);

      // CANCELLED es terminal
      expect(canTransitionDiningAccountStatus('CANCELLED', 'OPEN')).toBe(false);
    });
  });

  describe('2. Calculadora de Distribución Informativa por Persona (Exactitud al Peso 1 COP)', () => {
    it('debe repartir una picada de $50.000 entre 3 personas conciliando exactamente a 1 COP sin residuo', () => {
      const items = [
        { id: 'item-picada', line_total_cop: 50000, product_name: 'Picada Familiar' },
      ];
      const diners = [
        { id: 'd-1', label: 'Persona 1', sort_order: 1 },
        { id: 'd-2', label: 'Persona 2', sort_order: 2 },
        { id: 'd-3', label: 'Persona 3', sort_order: 3 },
      ];
      const assignments = [
        { diner_id: 'd-1', order_item_id: 'item-picada', share_units: 1, total_item_shares: 3 },
        { diner_id: 'd-2', order_item_id: 'item-picada', share_units: 1, total_item_shares: 3 },
        { diner_id: 'd-3', order_item_id: 'item-picada', share_units: 1, total_item_shares: 3 },
      ];

      const result = calculateConsumptionSplit({
        items,
        diners,
        assignments,
        discount_total_cop: 0,
        tip_cop: 0,
        grand_total_cop: 50000,
        split_rule: 'PROPORTIONAL',
      });

      // P1: 16.667, P2: 16.667, P3: 16.666
      expect(result.diners[0].diner_total_cop).toBe(16667);
      expect(result.diners[1].diner_total_cop).toBe(16667);
      expect(result.diners[2].diner_total_cop).toBe(16666);
      expect(result.unassigned_amount_cop).toBe(0);

      const sum = result.diners.reduce((acc, d) => acc + d.diner_total_cop, 0);
      expect(sum + result.unassigned_amount_cop).toBe(50000);
      expect(result.is_reconciled).toBe(true);
    });

    it('debe conciliar asignaciones parciales con propina y descuento en modo PROPORTIONAL y EQUAL', () => {
      const items = [
        { id: 'i-1', line_total_cop: 60000, product_name: 'Lomo al Trapo' },
        { id: 'i-2', line_total_cop: 40000, product_name: 'Hamburguesa Doble' },
        { id: 'i-3', line_total_cop: 20000, product_name: 'Bebidas Varias (Sin asignar)' },
      ];
      const diners = [
        { id: 'd-ana', label: 'Ana', sort_order: 1 },
        { id: 'd-carlos', label: 'Carlos', sort_order: 2 },
      ];
      const assignments = [
        { diner_id: 'd-ana', order_item_id: 'i-1', share_units: 1, total_item_shares: 1 },
        { diner_id: 'd-carlos', order_item_id: 'i-2', share_units: 1, total_item_shares: 1 },
      ];

      // Total productos = 120.000, Descuento = 10.000, Propina = 11.000 -> Grand Total = 121.000
      const propResult = calculateConsumptionSplit({
        items,
        diners,
        assignments,
        discount_total_cop: 10000,
        tip_cop: 11000,
        grand_total_cop: 121000,
        split_rule: 'PROPORTIONAL',
      });

      const sumProp = propResult.diners.reduce((acc, d) => acc + d.diner_total_cop, 0);
      expect(sumProp + propResult.unassigned_amount_cop).toBe(121000);
      expect(propResult.is_reconciled).toBe(true);
      expect(propResult.unassigned_amount_cop).toBeGreaterThan(0); // Las bebidas sin asignar quedan en unassigned

      // Mismo escenario con regla EQUAL
      const equalResult = calculateConsumptionSplit({
        items,
        diners,
        assignments,
        discount_total_cop: 10000,
        tip_cop: 11000,
        grand_total_cop: 121000,
        split_rule: 'EQUAL',
      });

      const sumEqual = equalResult.diners.reduce((acc, d) => acc + d.diner_total_cop, 0);
      expect(sumEqual + equalResult.unassigned_amount_cop).toBe(121000);
      expect(equalResult.is_reconciled).toBe(true);
    });
  });

  describe('3. Impresión Térmica de Pre-Cuenta de Salón (58mm / 80mm)', () => {
    it('debe generar el formato de pre-cuenta con detalle de ítems, propina sugerida, distribución y leyenda fiscal DIAN', () => {
      const receiptText = formatDiningPreCuentaText({
        restaurantName: 'Karta Gastrobar',
        branchName: 'Sede Poblado',
        branchAddress: 'Cra 43A # 5-20',
        branchPhone: '3001234567',
        tableCode: 'M-04',
        accountCode: '#C-M-04-301',
        guestCount: 3,
        openedAt: '2026-10-28T20:00:00.000Z',
        items: [
          { name: 'Entrada Tostones', quantity: 1, unitPriceCop: 18000, lineTotalCop: 18000 },
          { name: 'Ribeye 400g', quantity: 2, unitPriceCop: 45000, lineTotalCop: 90000 },
          { name: 'Cerveza Corona', quantity: 3, unitPriceCop: 10000, lineTotalCop: 30000 },
        ],
        subtotalProductsCop: 138000,
        discountTotalCop: 10000,
        tipCop: 13800,
        grandTotalCop: 141800,
        paidTotalCop: 50000,
        dinerDistribution: {
          splitRule: 'PROPORTIONAL',
          diners: [
            { label: 'Persona 1', subtotalItemsCop: 48000, discountShareCop: 3478, tipShareCop: 4800, totalCop: 49322 },
            { label: 'Persona 2', subtotalItemsCop: 45000, discountShareCop: 3261, tipShareCop: 4500, totalCop: 46239 },
            { label: 'Persona 3', subtotalItemsCop: 45000, discountShareCop: 3261, tipShareCop: 4500, totalCop: 46239 },
          ],
          unassignedAmountCop: 0,
        },
      }, { width: '80mm' });

      expect(receiptText).toContain('KARTA GASTROBAR');
      expect(receiptText).toContain('MESA: M-04');
      expect(receiptText).toContain('CUENTA: #C-M-04-301');
      expect(receiptText).toContain('Subtotal Productos:');
      expect(receiptText).toContain('Propina Vol. (10% Ley 1935):');
      expect(receiptText).toContain('DISTRIBUCIÓN INFORMATIVA POR PERSONA');
      expect(receiptText).toContain('* Persona 1:');
      expect(receiptText).toContain('* Persona 2:');
      expect(receiptText).toContain('* Persona 3:');
      expect(receiptText).toContain('DOCUMENTO INFORMATIVO DE SALÓN');
      expect(receiptText).toContain('NO ES FACTURA DE VENTA');
    });
  });

  describe('4. Extensión de Reportes sin Doble Conteo de Órdenes Hijas', () => {
    it('debe consolidar DiningAccount y órdenes independientes manteniendo la ecuación maestra en balance', () => {
      // Supongamos 2 órdenes de domicilio independientes por $80.000 ($40.000 c/u)
      const deliveryOrdersTotal = 80000;
      // Y una DiningAccount de salón por $95.000 (con 3 órdenes hijas de $35.000, $40.000 y $20.000)
      const diningAccountTotal = 95000;

      // El total facturado bruto reportado debe ser exactamente $175.000 (y NUNCA sumar las órdenes hijas dos veces: $270.000)
      const grossBilledTotalCop = deliveryOrdersTotal + diningAccountTotal;
      expect(grossBilledTotalCop).toBe(175000);

      // Cobros: Domicilios pagados al 100% ($80.000), Salón con abono de $60.000 y $35.000 pendiente por cobrar
      const collectedTotalCop = 80000 + 60000; // 140.000
      const pendingReceivableCop = 35000;
      const courtesyTotalCop = 0;
      const writtenOffTotalCop = 0;

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
});
