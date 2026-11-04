import { describe, it, expect } from 'vitest';
import {
  OpenCashShiftSchema,
  CreateCashShiftMovementSchema,
  CloseCashShiftSchema,
  calculateCashShiftExpectedCash,
  calculateCashShiftDifference,
} from '../src/schemas/cash-shift.schema';
import {
  validateModuleSetAtomically,
  assertModuleSetValidAtomically,
} from '../src/constants/modules.catalog';

describe('TC-07-U01: Validación de Esquemas Zod para Turnos y Movimientos de Caja', () => {
  it('debe aceptar apertura de turno con base inicial válida >= 0', () => {
    const validOpen = OpenCashShiftSchema.safeParse({
      opening_cash_cop: 100000,
      notes: 'Base inicial entregada por gerencia',
    });
    expect(validOpen.success).toBe(true);

    const zeroOpen = OpenCashShiftSchema.safeParse({
      opening_cash_cop: 0,
    });
    expect(zeroOpen.success).toBe(true);
  });

  it('debe rechazar apertura con monto negativo o no numérico', () => {
    const negativeOpen = OpenCashShiftSchema.safeParse({
      opening_cash_cop: -5000,
    });
    expect(negativeOpen.success).toBe(false);

    const stringOpen = OpenCashShiftSchema.safeParse({
      opening_cash_cop: 'diez mil',
    });
    expect(stringOpen.success).toBe(false);
  });

  it('debe validar movimientos menores CASH_IN y CASH_OUT con categorías permitidas', () => {
    const supplierPayment = CreateCashShiftMovementSchema.safeParse({
      type: 'CASH_OUT',
      category: 'SUPPLIER_PAYMENT',
      amount_cop: 35000,
      reason: 'Pago de cilantro y verduras a proveedor de paso',
      reference_doc: 'Recibo #1042',
    });
    expect(supplierPayment.success).toBe(true);

    const changeFund = CreateCashShiftMovementSchema.safeParse({
      type: 'CASH_IN',
      category: 'CHANGE_FUND',
      amount_cop: 50000,
      reason: 'Ingreso de monedas y billetes de $2.000 para cambio',
    });
    expect(changeFund.success).toBe(true);
  });

  it('debe rechazar movimientos con monto <= 0 o motivos muy cortos', () => {
    const invalidAmount = CreateCashShiftMovementSchema.safeParse({
      type: 'CASH_OUT',
      category: 'PETTY_EXPENSE',
      amount_cop: 0,
      reason: 'Compra de bolsas de aseo',
    });
    expect(invalidAmount.success).toBe(false);

    const shortReason = CreateCashShiftMovementSchema.safeParse({
      type: 'CASH_OUT',
      category: 'PETTY_EXPENSE',
      amount_cop: 12000,
      reason: 'No',
    });
    expect(shortReason.success).toBe(false);
  });

  it('debe validar el cierre de turno con monto físico declarado >= 0 y desglose opcional', () => {
    const validClose = CloseCashShiftSchema.safeParse({
      declared_cash_cop: 320000,
      denominations_snapshot_json: {
        '100000': 2,
        '50000': 2,
        '10000': 2,
      },
      closing_notes: 'Cierre sin novedades en gaveta',
    });
    expect(validClose.success).toBe(true);
  });
});

describe('TC-07-U02: Cálculo Determinista de Saldo Esperado y Diferencias de Arqueo', () => {
  it('debe calcular exactamente el efectivo esperado en gaveta', () => {
    // Base: 100.000
    // Ventas netas en efectivo: 250.000
    // Ingreso adicional de sencillo: 50.000
    // Salidas a proveedores de paso: 30.000 (verduras) + 15.000 (hielo) = 45.000
    const expected = calculateCashShiftExpectedCash({
      openingCashCop: 100000,
      cashSalesCop: 250000,
      cashInTotalCop: 50000,
      cashOutTotalCop: 45000,
    });
    // 100.000 + 250.000 + 50.000 - 45.000 = 355.000
    expect(expected).toBe(355000);
  });

  it('debe registrar 0 de diferencia cuando el arqueo está cuadrado', () => {
    const diff = calculateCashShiftDifference(355000, 355000);
    expect(diff).toBe(0);
  });

  it('debe registrar diferencia negativa ante un faltante de caja', () => {
    // Esperado 355.000 pero el cajero solo cuenta 350.000
    const diff = calculateCashShiftDifference(350000, 355000);
    expect(diff).toBe(-5000);
  });

  it('debe registrar diferencia positiva ante un sobrante de caja', () => {
    // Esperado 355.000 pero el cajero cuenta 360.000
    const diff = calculateCashShiftDifference(360000, 355000);
    expect(diff).toBe(5000);
  });
});

describe('TC-07-U03: Evaluación Atómica de Dependencias para payments.cash_shifts', () => {
  it('debe validar exitosamente cuando payments.cash_shifts y payments.manual se activan juntos con order_panel', () => {
    const result = validateModuleSetAtomically([
      'ordering',
      'order_panel',
      'payments.manual',
      'payments.cash_shifts',
    ]);
    expect(result.valid).toBe(true);
  });

  it('debe fallar con MISSING_MODULE_DEPENDENCY si payments.cash_shifts se activa sin payments.manual', () => {
    const result = validateModuleSetAtomically([
      'ordering',
      'order_panel',
      'payments.cash_shifts',
    ]);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errorCode).toBe('MISSING_MODULE_DEPENDENCY');
      expect(result.moduleKey).toBe('payments.cash_shifts');
      expect(result.missingDependency).toBe('payments.manual');
    }
  });

  it('debe permitir aplicar el perfil ENTERPRISE_MULTI con los 15 módulos operativos activos', () => {
    expect(() =>
      assertModuleSetValidAtomically([
        'ordering',
        'channel.pickup',
        'channel.delivery',
        'dining',
        'channel.dine_in_qr',
        'dining.consumption_split',
        'order_panel',
        'kitchen',
        'tracking',
        'payments.manual',
        'payments.cash_shifts',
        'inventory.recipes',
        'notifications.whatsapp_click',
        'notifications.email',
        'reporting',
      ]),
    ).not.toThrow();
  });
});

