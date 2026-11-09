/**
 * Calculadora Pura de Estado de Resultados Operativo (P&L - Profit and Loss)
 * Para el sector gastronómico en Karta SaaS
 * Alineado con FASE_08_MODULO_FINANCIERO_NOMINA_Y_FACTUS_V2.md
 */

export interface ProfitAndLossInput {
  netSalesRevenueCop: number; // Ventas netas (productos + delivery, excluyendo impuestos DIAN y propinas)
  cogsRecipeConsumptionCop: number; // Costo de ventas de insumos (Kardex: SALE_CONSUMPTION - SALE_REVERSAL + WASTE_OUT)
  operatingExpensesCop: number; // Gastos operativos (servicios, arriendo, empaques, marketing, mantenimiento, etc.)
  grossPayrollCop: number; // Total nómina devengada bruta del periodo (gross_accrued_cop)
}

export interface ProfitAndLossResult {
  netSalesRevenueCop: number;
  cogsRecipeConsumptionCop: number;
  grossProfitCop: number;
  grossMarginPct: number;
  operatingExpensesCop: number;
  grossPayrollCop: number;
  totalOperatingCostsCop: number;
  operatingProfitCop: number; // EBITDA Operativo
  operatingMarginPct: number;
}

/**
 * Calcula el Estado de Resultados Operativo (P&L) en tiempo real
 */
export function calculateProfitAndLoss(input: ProfitAndLossInput): ProfitAndLossResult {
  const {
    netSalesRevenueCop,
    cogsRecipeConsumptionCop,
    operatingExpensesCop,
    grossPayrollCop,
  } = input;

  const grossProfitCop = netSalesRevenueCop - cogsRecipeConsumptionCop;
  const grossMarginPct = netSalesRevenueCop > 0
    ? Math.round(((grossProfitCop / netSalesRevenueCop) * 100 + Number.EPSILON) * 100) / 100
    : 0;

  const totalOperatingCostsCop = operatingExpensesCop + grossPayrollCop;
  const operatingProfitCop = grossProfitCop - totalOperatingCostsCop;

  const operatingMarginPct = netSalesRevenueCop > 0
    ? Math.round(((operatingProfitCop / netSalesRevenueCop) * 100 + Number.EPSILON) * 100) / 100
    : 0;

  return {
    netSalesRevenueCop,
    cogsRecipeConsumptionCop,
    grossProfitCop,
    grossMarginPct,
    operatingExpensesCop,
    grossPayrollCop,
    totalOperatingCostsCop,
    operatingProfitCop,
    operatingMarginPct,
  };
}

