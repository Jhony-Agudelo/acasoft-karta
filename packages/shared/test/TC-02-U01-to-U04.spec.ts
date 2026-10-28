import { describe, it, expect } from 'vitest';
import {
  calculateLinePricing,
  validateModifierSelections,
  DIAN_FISCAL_DISCLAIMER_TEXT,
  ModifierGroupValidationItem,
} from '../src/utils/tax-calculator';
import { TaxProfileConfigSchema } from '../src/schemas/catalog.schema';

describe('Fase 02 — Pruebas Unitarias de Motor Tributario, Modificadores y Esquemas (TC-02-U01 a TC-02-U04)', () => {
  // -------------------------------------------------------------------------
  // TC-02-U01: Invariante de No Doble Cobro (Criterio 8 de DEFINICION_TECNICA.md)
  // -------------------------------------------------------------------------
  describe('TC-02-U01: Invariante de No Doble Cobro', () => {
    it('debe producir exactamente line_total_cop = 20.000 en FINAL_PRICE_NO_BREAKDOWN', () => {
      const result = calculateLinePricing({
        basePriceCop: 10000,
        quantity: 2,
        taxProfileMode: 'FINAL_PRICE_NO_BREAKDOWN',
        taxType: 'INC',
        taxRateBp: 800,
      });

      expect(result.effective_unit_price_cop).toBe(10000);
      expect(result.gross_subtotal_cop).toBe(20000);
      expect(result.net_subtotal_cop).toBe(20000);
      expect(result.taxable_base_cop).toBe(20000);
      expect(result.tax_amount_cop).toBe(0);
      expect(result.line_total_cop).toBe(20000);
    });

    it('debe discriminar INC 8% (800 bp) en TAX_INCLUDED_DISCRIMINATED sin alterar el total de $20.000', () => {
      // Base gravable: 20000 / 1.08 = 18518.518... -> 18519
      // Impuesto INC: 20000 - 18519 = 1481
      const result = calculateLinePricing({
        basePriceCop: 10000,
        quantity: 2,
        taxProfileMode: 'TAX_INCLUDED_DISCRIMINATED',
        taxType: 'INC',
        taxRateBp: 800,
      });

      expect(result.line_total_cop).toBe(20000);
      expect(result.taxable_base_cop).toBe(18519);
      expect(result.tax_amount_cop).toBe(1481);
      // Invariante estricta: base + impuesto === total
      expect(result.taxable_base_cop + result.tax_amount_cop).toBe(20000);
    });

    it('debe discriminar IVA 19% (1900 bp) en TAX_INCLUDED_DISCRIMINATED sin alterar el total de $20.000', () => {
      // Base gravable: 20000 / 1.19 = 16806.72... -> 16807
      // Impuesto IVA: 20000 - 16807 = 3193
      const result = calculateLinePricing({
        basePriceCop: 10000,
        quantity: 2,
        taxProfileMode: 'TAX_INCLUDED_DISCRIMINATED',
        taxType: 'IVA',
        taxRateBp: 1900,
      });

      expect(result.line_total_cop).toBe(20000);
      expect(result.taxable_base_cop).toBe(16807);
      expect(result.tax_amount_cop).toBe(3193);
      expect(result.taxable_base_cop + result.tax_amount_cop).toBe(20000);
    });
  });

  // -------------------------------------------------------------------------
  // TC-02-U02: Conciliación al Peso con Modificadores y Descuento en TAX_INCLUDED_DISCRIMINATED
  // -------------------------------------------------------------------------
  describe('TC-02-U02: Conciliación al Peso con Modificadores y Descuento', () => {
    it('debe conciliar exactamente al peso: Base ($18.500) + Mod ($4.000) * 3 - Dto ($2.500) con INC 8%', () => {
      // effective_unit = 18500 + 4000 = 22500
      // gross = 22500 * 3 = 67500
      // net = 67500 - 2500 = 65000
      // taxable_base = Round(65000 / 1.08) = Round(60185.185...) = 60185
      // tax_amount = 65000 - 60185 = 4815
      const result = calculateLinePricing({
        basePriceCop: 18500,
        modifiers: [{ extra_price_cop: 4000 }],
        quantity: 3,
        discountCop: 2500,
        taxProfileMode: 'TAX_INCLUDED_DISCRIMINATED',
        taxType: 'INC',
        taxRateBp: 800,
      });

      expect(result.unit_price_cop).toBe(18500);
      expect(result.modifiers_unit_total_cop).toBe(4000);
      expect(result.effective_unit_price_cop).toBe(22500);
      expect(result.gross_subtotal_cop).toBe(67500);
      expect(result.discount_cop).toBe(2500);
      expect(result.net_subtotal_cop).toBe(65000);
      expect(result.taxable_base_cop).toBe(60185);
      expect(result.tax_amount_cop).toBe(4815);
      expect(result.line_total_cop).toBe(65000);
      expect(result.taxable_base_cop + result.tax_amount_cop).toBe(result.line_total_cop);
    });
  });

  // -------------------------------------------------------------------------
  // TC-02-U03: Cálculo en Modo BASE_PLUS_TAX
  // -------------------------------------------------------------------------
  describe('TC-02-U03: Modo BASE_PLUS_TAX', () => {
    it('debe sumar el IVA 19% sobre la base neta de $20.000 produciendo total $23.800', () => {
      // base = 10000, qty = 2 -> net = 20000
      // tax = Round(20000 * 0.19) = 3800
      // line_total = 20000 + 3800 = 23800
      const result = calculateLinePricing({
        basePriceCop: 10000,
        quantity: 2,
        taxProfileMode: 'BASE_PLUS_TAX',
        taxType: 'IVA',
        taxRateBp: 1900,
      });

      expect(result.taxable_base_cop).toBe(20000);
      expect(result.tax_amount_cop).toBe(3800);
      expect(result.line_total_cop).toBe(23800);
    });
  });

  // -------------------------------------------------------------------------
  // TC-02-U04: Validador de Modificadores y Esquema Zod de Perfil Tributario
  // -------------------------------------------------------------------------
  describe('TC-02-U04: Validador de Modificadores y Esquema Tributario', () => {
    const mockGroups: ModifierGroupValidationItem[] = [
      {
        id: 'group-salsas',
        name: 'Salsas',
        is_required: true,
        min_selections: 1,
        max_selections: 2,
        options: [
          { id: 'opt-bbq', name: 'BBQ Artesanal', status: 'ACTIVE', extra_price_cop: 0 },
          { id: 'opt-mayo', name: 'Mayonesa Ajo', status: 'ACTIVE', extra_price_cop: 1000 },
          { id: 'opt-picante', name: 'Sriracha Picante', status: 'OUT_OF_STOCK', extra_price_cop: 1500 },
        ],
      },
    ];

    it('debe fallar si el grupo requerido no tiene selecciones (0 seleccionadas)', () => {
      const val = validateModifierSelections(mockGroups, { 'group-salsas': [] });
      expect(val.isValid).toBe(false);
      expect(val.errors[0]).toContain('es obligatorio y requiere al menos 1');
    });

    it('debe fallar si se seleccionan más opciones que max_selections (3 seleccionadas)', () => {
      const val = validateModifierSelections(mockGroups, {
        'group-salsas': ['opt-bbq', 'opt-mayo', 'opt-picante'],
      });
      expect(val.isValid).toBe(false);
      expect(val.errors.some((e) => e.includes('permite un máximo de 2'))).toBe(true);
    });

    it('debe fallar si se selecciona una opción en estado OUT_OF_STOCK', () => {
      const val = validateModifierSelections(mockGroups, {
        'group-salsas': ['opt-picante'],
      });
      expect(val.isValid).toBe(false);
      expect(val.errors[0]).toContain('se encuentra agotada (OUT_OF_STOCK)');
    });

    it('debe ser exitoso con una selección válida de opción activa', () => {
      const val = validateModifierSelections(mockGroups, {
        'group-salsas': ['opt-bbq'],
      });
      expect(val.isValid).toBe(true);
      expect(val.errors.length).toBe(0);
    });

    // Validaciones Zod de TaxProfileConfigSchema
    it('debe rechazar TAX_INCLUDED_DISCRIMINATED con INC y default_tax_rate_bp = 0', () => {
      const parsed = TaxProfileConfigSchema.safeParse({
        tax_profile_mode: 'TAX_INCLUDED_DISCRIMINATED',
        default_tax_type: 'INC',
        default_tax_rate_bp: 0,
      });

      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.errors[0].message).toContain('requiere una tasa mayor a 0 bp');
      }
    });

    it('debe rechazar BASE_PLUS_TAX con tipo NONE y default_tax_rate_bp > 0', () => {
      const parsed = TaxProfileConfigSchema.safeParse({
        tax_profile_mode: 'BASE_PLUS_TAX',
        default_tax_type: 'NONE',
        default_tax_rate_bp: 800,
      });

      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.errors[0].message).toContain('la tasa en puntos básicos debe ser 0');
      }
    });

    it('debe aceptar configuración tributaria colombiana válida para restaurantes', () => {
      const parsed = TaxProfileConfigSchema.safeParse({
        tax_profile_mode: 'TAX_INCLUDED_DISCRIMINATED',
        default_tax_type: 'INC',
        default_tax_rate_bp: 800,
      });

      expect(parsed.success).toBe(true);
    });

    it('debe exportar la leyenda legal DIAN no modificada', () => {
      expect(DIAN_FISCAL_DISCLAIMER_TEXT).toContain('No sustituye la factura electrónica');
    });
  });
});
