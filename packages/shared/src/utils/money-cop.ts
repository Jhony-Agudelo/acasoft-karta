/**
 * Utilidades de Aritmética Monetaria Entera en Pesos Colombianos (COP)
 * Reglas de redondeo, extracción de impuestos sin doble cobro y formateo.
 * Alineado con TC-01-U01 y Sección 4.5 de DEFINICION_TECNICA.md (v2.4.0)
 */

export type TaxProfileMode =
  | 'FINAL_PRICE_NO_BREAKDOWN'
  | 'TAX_INCLUDED_DISCRIMINATED'
  | 'BASE_PLUS_TAX';

export type TaxType = 'NONE' | 'INC' | 'IVA' | 'EXEMPT';

export interface TaxCalculationInput {
  readonly unitPriceCop: number;
  readonly quantity: number;
  readonly discountCop?: number;
  readonly taxProfileMode: TaxProfileMode;
  readonly taxType: TaxType;
  /** Tarifa en puntos básicos (ej. 800 para 8% INC, 1900 para 19% IVA, 0 para EXEMPT/NONE) */
  readonly taxRateBp: number;
}

export interface TaxCalculationResult {
  readonly lineTotalCop: number;
  readonly taxableBaseCop: number;
  readonly taxAmountCop: number;
  readonly taxType: TaxType;
  readonly taxRateBp: number;
}

/**
 * Calcula de manera pura y determinista el total de línea, base gravable e impuesto en pesos enteros (COP).
 * Garantiza que: taxableBaseCop + taxAmountCop === lineTotalCop (sin desfases de centavos).
 */
export function calculateLineTaxes(input: TaxCalculationInput): TaxCalculationResult {
  const {
    unitPriceCop,
    quantity,
    discountCop = 0,
    taxProfileMode,
    taxType,
    taxRateBp,
  } = input;

  // Validación de seguridad de enteros
  const cleanUnitPrice = Math.max(0, Math.round(unitPriceCop));
  const cleanQuantity = Math.max(0, Math.round(quantity));
  const cleanDiscount = Math.max(0, Math.round(discountCop));
  const cleanRateBp = Math.max(0, Math.round(taxRateBp));

  const grossOrBase = Math.max(0, cleanUnitPrice * cleanQuantity - cleanDiscount);

  if (taxType === 'NONE' || taxType === 'EXEMPT' || cleanRateBp === 0 || taxProfileMode === 'FINAL_PRICE_NO_BREAKDOWN') {
    return {
      lineTotalCop: grossOrBase,
      taxableBaseCop: grossOrBase,
      taxAmountCop: 0,
      taxType,
      taxRateBp: cleanRateBp,
    };
  }

  const rateDecimal = cleanRateBp / 10000;

  if (taxProfileMode === 'TAX_INCLUDED_DISCRIMINATED') {
    // El precio publicado ya incluye el impuesto:
    // Base = Math.round(Total / (1 + r))
    // Impuesto = Total - Base
    const lineTotalCop = grossOrBase;
    const taxableBaseCop = Math.round(lineTotalCop / (1 + rateDecimal));
    const taxAmountCop = lineTotalCop - taxableBaseCop;

    return {
      lineTotalCop,
      taxableBaseCop,
      taxAmountCop,
      taxType,
      taxRateBp: cleanRateBp,
    };
  }

  if (taxProfileMode === 'BASE_PLUS_TAX') {
    // El precio publicado es base antes de impuesto:
    // Base = grossOrBase
    // Impuesto = Math.round(Base * r)
    // Total = Base + Impuesto
    const taxableBaseCop = grossOrBase;
    const taxAmountCop = Math.round(taxableBaseCop * rateDecimal);
    const lineTotalCop = taxableBaseCop + taxAmountCop;

    return {
      lineTotalCop,
      taxableBaseCop,
      taxAmountCop,
      taxType,
      taxRateBp: cleanRateBp,
    };
  }

  // Fallback seguro
  return {
    lineTotalCop: grossOrBase,
    taxableBaseCop: grossOrBase,
    taxAmountCop: 0,
    taxType,
    taxRateBp: cleanRateBp,
  };
}

/**
 * Formatea un número entero como moneda en pesos colombianos ($ 20.000).
 */
export function formatMoneyCop(amountCop: number): string {
  const cleanAmount = Math.round(amountCop);
  const parts = Math.abs(cleanAmount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const sign = cleanAmount < 0 ? '-' : '';
  return `${sign}$ ${parts}`;
}
