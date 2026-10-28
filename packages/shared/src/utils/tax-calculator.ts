import { TaxProfileMode, TaxType } from './money-cop';

/**
 * Motor Tributario y Calculador Determinista de Precios en Pesos Colombianos (COP)
 * Alineado con DEFINICION_TECNICA.md (v2.4.0 — Sección 9.1.2) y FASE_02_CATALOGO_IMPUESTOS_Y_VITRINA.md
 */

/**
 * Leyenda legal obligatoria DIAN para pre-cuentas y vitrinas informativas
 */
export const DIAN_FISCAL_DISCLAIMER_TEXT =
  'Documento informativo de control interno / pre-cuenta — No sustituye la factura electrónica de venta ni el documento equivalente POS exigido por la DIAN';

export interface ModifierItemPricing {
  extra_price_cop: number;
}

export interface CalculateLinePricingParams {
  basePriceCop: number;
  modifiers?: ModifierItemPricing[];
  quantity: number;
  discountCop?: number;
  taxProfileMode: TaxProfileMode;
  taxType?: TaxType;
  taxRateBp?: number;
}

export interface LinePricingResult {
  unit_price_cop: number;
  modifiers_unit_total_cop: number;
  effective_unit_price_cop: number;
  gross_subtotal_cop: number;
  discount_cop: number;
  net_subtotal_cop: number;
  taxable_base_cop: number;
  tax_type: TaxType;
  tax_rate_bp: number;
  tax_amount_cop: number;
  line_total_cop: number;
}

/**
 * Calcula con precisión entera en COP los subtotales, base gravable e impuestos de una línea de pedido.
 * Cumple estrictamente la regla de NO DOBLE COBRO en menús donde el precio ya incluye impuestos.
 */
export function calculateLinePricing(params: CalculateLinePricingParams): LinePricingResult {
  const {
    basePriceCop,
    modifiers = [],
    quantity,
    discountCop = 0,
    taxProfileMode,
    taxType = 'NONE',
    taxRateBp = 0,
  } = params;

  // 1. Aritmética base entera
  const safeQty = Math.max(1, Math.round(quantity));
  const unit_price_cop = Math.max(0, Math.round(basePriceCop));

  const modifiers_unit_total_cop = modifiers.reduce(
    (acc, m) => acc + Math.max(0, Math.round(m.extra_price_cop || 0)),
    0,
  );

  const effective_unit_price_cop = unit_price_cop + modifiers_unit_total_cop;
  const gross_subtotal_cop = effective_unit_price_cop * safeQty;
  const discount_cop = Math.min(Math.max(0, Math.round(discountCop)), gross_subtotal_cop);
  const net_subtotal_cop = gross_subtotal_cop - discount_cop;

  const effectiveRateBp = Math.max(0, Math.round(taxRateBp));
  const hasTaxRate =
    effectiveRateBp > 0 && (taxType === 'INC' || taxType === 'IVA');
  const r = hasTaxRate ? effectiveRateBp / 10000 : 0;

  // 2. Evaluación según el perfil tributario del Tenant
  switch (taxProfileMode) {
    case 'FINAL_PRICE_NO_BREAKDOWN': {
      // Precio final sin discriminación (Monotributo / No responsable de IVA/INC)
      return {
        unit_price_cop,
        modifiers_unit_total_cop,
        effective_unit_price_cop,
        gross_subtotal_cop,
        discount_cop,
        net_subtotal_cop,
        taxable_base_cop: net_subtotal_cop,
        tax_type: 'NONE',
        tax_rate_bp: 0,
        tax_amount_cop: 0,
        line_total_cop: net_subtotal_cop,
      };
    }

    case 'TAX_INCLUDED_DISCRIMINATED': {
      // El precio publicado ya incluye INC o IVA (comportamiento estándar en restaurantes Colombia).
      // El total de la línea es exactamente el subtotal neto. ¡JAMÁS se suma el impuesto dos veces!
      const line_total_cop = net_subtotal_cop;

      if (!hasTaxRate || r === 0) {
        return {
          unit_price_cop,
          modifiers_unit_total_cop,
          effective_unit_price_cop,
          gross_subtotal_cop,
          discount_cop,
          net_subtotal_cop,
          taxable_base_cop: net_subtotal_cop,
          tax_type: taxType || 'NONE',
          tax_rate_bp: 0,
          tax_amount_cop: 0,
          line_total_cop,
        };
      }

      // Base gravable = Round(Net / (1 + r))
      const taxable_base_cop = Math.round(net_subtotal_cop / (1 + r));
      // Impuesto = Net - Base (Garantiza que base + impuesto === line_total_cop al peso exacto)
      const tax_amount_cop = net_subtotal_cop - taxable_base_cop;

      return {
        unit_price_cop,
        modifiers_unit_total_cop,
        effective_unit_price_cop,
        gross_subtotal_cop,
        discount_cop,
        net_subtotal_cop,
        taxable_base_cop,
        tax_type: taxType,
        tax_rate_bp: effectiveRateBp,
        tax_amount_cop,
        line_total_cop,
      };
    }

    case 'BASE_PLUS_TAX': {
      // El precio publicado es base antes de impuesto (ej. cadenas o catering corporativo).
      // El impuesto se suma encima de la base.
      const taxable_base_cop = net_subtotal_cop;

      if (!hasTaxRate || r === 0) {
        return {
          unit_price_cop,
          modifiers_unit_total_cop,
          effective_unit_price_cop,
          gross_subtotal_cop,
          discount_cop,
          net_subtotal_cop,
          taxable_base_cop,
          tax_type: taxType || 'NONE',
          tax_rate_bp: 0,
          tax_amount_cop: 0,
          line_total_cop: taxable_base_cop,
        };
      }

      const tax_amount_cop = Math.round(taxable_base_cop * r);
      const line_total_cop = taxable_base_cop + tax_amount_cop;

      return {
        unit_price_cop,
        modifiers_unit_total_cop,
        effective_unit_price_cop,
        gross_subtotal_cop,
        discount_cop,
        net_subtotal_cop,
        taxable_base_cop,
        tax_type: taxType,
        tax_rate_bp: effectiveRateBp,
        tax_amount_cop,
        line_total_cop,
      };
    }

    default: {
      return {
        unit_price_cop,
        modifiers_unit_total_cop,
        effective_unit_price_cop,
        gross_subtotal_cop,
        discount_cop,
        net_subtotal_cop,
        taxable_base_cop: net_subtotal_cop,
        tax_type: 'NONE',
        tax_rate_bp: 0,
        tax_amount_cop: 0,
        line_total_cop: net_subtotal_cop,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Validador de Modificadores en Vivo
// ---------------------------------------------------------------------------
export interface ModifierOptionValidationItem {
  id: string;
  name: string;
  status: 'ACTIVE' | 'OUT_OF_STOCK';
  extra_price_cop: number;
}

export interface ModifierGroupValidationItem {
  id: string;
  name: string;
  is_required: boolean;
  min_selections: number;
  max_selections: number;
  options: ModifierOptionValidationItem[];
}

export interface ModifierValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Valida que las opciones de modificadores seleccionadas cumplan las restricciones de cada grupo.
 */
export function validateModifierSelections(
  groups: ModifierGroupValidationItem[],
  selectedOptionIdsByGroup: Record<string, string[]>,
): ModifierValidationResult {
  const errors: string[] = [];

  for (const group of groups) {
    const selectedIds = selectedOptionIdsByGroup[group.id] || [];
    const count = selectedIds.length;

    // Validación de obligatoriedad y mínimo
    if (group.is_required && count < group.min_selections) {
      errors.push(
        `El grupo "${group.name}" es obligatorio y requiere al menos ${group.min_selections} selección(es) (actualmente: ${count}).`,
      );
    } else if (count > 0 && count < group.min_selections) {
      errors.push(
        `El grupo "${group.name}" requiere un mínimo de ${group.min_selections} selección(es) (actualmente: ${count}).`,
      );
    }

    // Validación de máximo
    if (count > group.max_selections) {
      errors.push(
        `El grupo "${group.name}" permite un máximo de ${group.max_selections} selección(es) (actualmente: ${count}).`,
      );
    }

    // Validación de existencia y disponibilidad de cada opción
    const optionMap = new Map(group.options.map((opt) => [opt.id, opt]));
    for (const optId of selectedIds) {
      const option = optionMap.get(optId);
      if (!option) {
        errors.push(
          `La opción con ID "${optId}" no pertenece al grupo "${group.name}".`,
        );
      } else if (option.status === 'OUT_OF_STOCK') {
        errors.push(
          `La opción "${option.name}" en el grupo "${group.name}" se encuentra agotada (OUT_OF_STOCK).`,
        );
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
