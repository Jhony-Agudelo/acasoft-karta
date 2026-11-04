import { describe, it, expect } from 'vitest';
import {
  calculateCashShiftExpectedCash,
  calculateCashShiftDifference,
  OpenCashShiftSchema,
  CreateCashShiftMovementSchema,
  CloseCashShiftSchema,
  formatMoneyCop,
} from '@restaurante-saas/shared';
import { isPathAllowedForRole } from '../src/config/role-navigation.config';

describe('TC-07-E01: Frontend E2E / Unit — Gestión de Turnos y Arqueo Ciego de Caja', () => {
  // ---------------------------------------------------------------------------
  // 1. Contratos y Validación de Schemas en Frontend
  // ---------------------------------------------------------------------------
  describe('1. Validación de Entrada en Formularios de Caja', () => {
    it('debe validar la apertura con base inicial positiva', () => {
      const valid = OpenCashShiftSchema.safeParse({
        opening_cash_cop: 100000,
        notes: 'Apertura de turno mañana',
      });
      expect(valid.success).toBe(true);

      const invalidNegative = OpenCashShiftSchema.safeParse({
        opening_cash_cop: -5000,
      });
      expect(invalidNegative.success).toBe(false);
    });

    it('debe validar movimientos menores CASH_IN y CASH_OUT con categorías permitidas', () => {
      const validOut = CreateCashShiftMovementSchema.safeParse({
        type: 'CASH_OUT',
        category: 'SUPPLIER_PAYMENT',
        amount_cop: 25000,
        reason: 'Pago cilantro y limones al proveedor de paso',
        reference_doc: 'REM-892',
      });
      expect(validOut.success).toBe(true);

      const validIn = CreateCashShiftMovementSchema.safeParse({
        type: 'CASH_IN',
        category: 'CHANGE_FUND',
        amount_cop: 50000,
        reason: 'Dotación de monedas y billetes para cambio',
      });
      expect(validIn.success).toBe(true);

      const invalidCategory = CreateCashShiftMovementSchema.safeParse({
        type: 'CASH_IN',
        category: 'UNRECOGNIZED_CATEGORY',
        amount_cop: 10000,
        reason: 'Test inválido',
      });
      expect(invalidCategory.success).toBe(false);
    });

    it('debe validar el esquema de arqueo ciego y desglose de denominaciones', () => {
      const validClose = CloseCashShiftSchema.safeParse({
        declared_cash_cop: 155000,
        denominations_snapshot_json: {
          b_50k: 3,
          b_5k: 1,
        },
        closing_notes: 'Faltante de $2.000 por cambio dado de más',
      });
      expect(validClose.success).toBe(true);

      const invalidNegativeDeclared = CloseCashShiftSchema.safeParse({
        declared_cash_cop: -100,
      });
      expect(invalidNegativeDeclared.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Lógica de la Calculadora de Desglose de Denominaciones
  // ---------------------------------------------------------------------------
  describe('2. Calculadora de Denominaciones Físicas de Efectivo', () => {
    it('debe sumar exactamente los billetes y monedas colombianas', () => {
      const counts: Record<string, number> = {
        b_100k: 2, // 200.000
        b_50k: 4,  // 200.000
        b_20k: 5,  // 100.000
        b_10k: 8,  // 80.000
        b_5k: 10,  // 50.000
        b_2k: 15,  // 30.000
        c_1k: 20,  // 20.000
        c_500: 10, // 5.000
        c_200: 5,  // 1.000
        c_100: 8,  // 800
        c_50: 4,   // 200
      };

      const DENOM_VALUES: Record<string, number> = {
        b_100k: 100000,
        b_50k: 50000,
        b_20k: 20000,
        b_10k: 10000,
        b_5k: 5000,
        b_2k: 2000,
        c_1k: 1000,
        c_500: 500,
        c_200: 200,
        c_100: 100,
        c_50: 50,
      };

      const totalCalculated = Object.entries(counts).reduce((acc, [key, qty]) => {
        return acc + qty * (DENOM_VALUES[key] || 0);
      }, 0);

      // 200.000 + 200.000 + 100.000 + 80.000 + 50.000 + 30.000 + 20.000 + 5.000 + 1.000 + 800 + 200 = 687.000
      expect(totalCalculated).toBe(687000);
      expect(formatMoneyCop(totalCalculated)).toBe('$ 687.000');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Ecuación Maestra de Arqueo de Caja y Discrepancias
  // ---------------------------------------------------------------------------
  describe('3. Ecuación Maestra de Caja: Base + Ventas + Entradas - Salidas', () => {
    it('debe calcular saldo esperado determinista y diferencia con faltante', () => {
      const expected = calculateCashShiftExpectedCash({
        openingCashCop: 100000,
        cashSalesCop: 350000,
        cashInTotalCop: 50000,
        cashOutTotalCop: 40000,
      });

      // 100.000 + 350.000 + 50.000 - 40.000 = 460.000
      expect(expected).toBe(460000);

      // Si el cajero contó $455.000, la discrepancia es -$5.000 (Faltante)
      const diff = calculateCashShiftDifference(455000, expected);
      expect(diff).toBe(-5000);
    });

    it('debe calcular diferencia exacta a $0 cuando el conteo coincide al peso', () => {
      const expected = calculateCashShiftExpectedCash({
        openingCashCop: 80000,
        cashSalesCop: 120000,
        cashInTotalCop: 0,
        cashOutTotalCop: 15000,
      });

      // 80.000 + 120.000 - 15.000 = 185.000
      expect(expected).toBe(185000);

      const diff = calculateCashShiftDifference(185000, expected);
      expect(diff).toBe(0);
    });

    it('debe calcular diferencia positiva cuando hay sobrante de caja', () => {
      const expected = calculateCashShiftExpectedCash({
        openingCashCop: 50000,
        cashSalesCop: 100000,
        cashInTotalCop: 0,
        cashOutTotalCop: 0,
      });

      expect(expected).toBe(150000);

      // Si contó $153.000 -> Sobrante de $3.000
      const diff = calculateCashShiftDifference(153000, expected);
      expect(diff).toBe(3000);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Control de Acceso y Navegación por Rol
  // ---------------------------------------------------------------------------
  describe('4. Permisos de Navegación del Historial de Turnos y Auditoría', () => {
    it('debe permitir /admin/cash-shifts para TENANT_ADMIN y BRANCH_MANAGER', () => {
      expect(isPathAllowedForRole('/admin/cash-shifts', 'TENANT_ADMIN')).toBe(true);
      expect(isPathAllowedForRole('/admin/cash-shifts', 'BRANCH_MANAGER')).toBe(true);
      expect(isPathAllowedForRole('/admin/cash-shifts', 'PLATFORM_ADMIN')).toBe(true);
    });

    it('debe prohibir acceso a la auditoría histórica de turnos para CASHIER y WAITER', () => {
      expect(isPathAllowedForRole('/admin/cash-shifts', 'CASHIER')).toBe(false);
      expect(isPathAllowedForRole('/admin/cash-shifts', 'WAITER')).toBe(false);
      expect(isPathAllowedForRole('/admin/cash-shifts', 'KITCHEN')).toBe(false);
    });
  });
});

