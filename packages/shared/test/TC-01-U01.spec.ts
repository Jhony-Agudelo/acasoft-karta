import { describe, it, expect } from 'vitest';
import { calculateLineTaxes, formatMoneyCop } from '../src/utils/money-cop';

describe('TC-01-U01: Aritmética COP e Impuestos Incluidos / Discriminados', () => {
  it('debe calcular correctamente TAX_INCLUDED_DISCRIMINATED sin sumar el impuesto dos veces', () => {
    // Caso de prueba exacto TC-01-U01:
    // Precio final $10.000 COP, cantidad 2, INC 8 % (800 bp)
    const result = calculateLineTaxes({
      unitPriceCop: 10000,
      quantity: 2,
      discountCop: 0,
      taxProfileMode: 'TAX_INCLUDED_DISCRIMINATED',
      taxType: 'INC',
      taxRateBp: 800,
    });

    expect(result.lineTotalCop).toBe(20000);
    expect(result.taxableBaseCop).toBe(18519);
    expect(result.taxAmountCop).toBe(1481);
    // Invariante de suma exacta: Base + Impuesto = Total
    expect(result.taxableBaseCop + result.taxAmountCop).toBe(20000);
  });

  it('debe manejar correctamente el modo FINAL_PRICE_NO_BREAKDOWN por defecto', () => {
    const result = calculateLineTaxes({
      unitPriceCop: 10000,
      quantity: 2,
      discountCop: 0,
      taxProfileMode: 'FINAL_PRICE_NO_BREAKDOWN',
      taxType: 'INC',
      taxRateBp: 800,
    });

    expect(result.lineTotalCop).toBe(20000);
    expect(result.taxableBaseCop).toBe(20000);
    expect(result.taxAmountCop).toBe(0);
  });

  it('debe calcular correctamente el modo BASE_PLUS_TAX', () => {
    const result = calculateLineTaxes({
      unitPriceCop: 10000,
      quantity: 2,
      discountCop: 0,
      taxProfileMode: 'BASE_PLUS_TAX',
      taxType: 'INC',
      taxRateBp: 800,
    });

    expect(result.taxableBaseCop).toBe(20000);
    expect(result.taxAmountCop).toBe(1600);
    expect(result.lineTotalCop).toBe(21600);
  });

  it('debe formatear importes en formato colombiano ($ 20.000)', () => {
    expect(formatMoneyCop(20000)).toBe('$ 20.000');
    expect(formatMoneyCop(1500000)).toBe('$ 1.500.000');
    expect(formatMoneyCop(0)).toBe('$ 0');
  });
});
