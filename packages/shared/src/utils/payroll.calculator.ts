/**
 * Calculadora Pura de Nómina Gastronómica y Generador de Payload Factus API v2
 * Cumple con el Código Sustantivo del Trabajo de Colombia y la Resolución DIAN 000013 / Anexo 1.0
 * Alineado con FASE_08_MODULO_FINANCIERO_NOMINA_Y_FACTUS_V2.md
 */

import {
  FACTUS_OVERTIME_CODES,
  FACTUS_PAYROLL_CONTRACT_TYPES,
  FACTUS_PAYROLL_PERIOD_CODES,
  FACTUS_PAYROLL_WORKER_TYPES,
} from '../constants/factus-v2.catalog';

export interface OvertimeEntryInput {
  accrual_type_code: string;
  quantity: number;
  percentage?: number;
  start_date?: string;
  end_date?: string;
}

export interface OvertimeEntryProcessed {
  accrual_type_code: string;
  quantity: string;
  percentage: string;
  amount: string;
  amount_cop: number;
  start_date: string;
  end_date: string;
}

export interface EmployeeContractInfo {
  employee_code: string;
  identification_document_code: string;
  identification_number: string;
  first_name: string;
  first_surname: string;
  second_surname?: string | null;
  address: string;
  municipality_code: string;
  entry_date: string;
  base_salary_cop: number;
  receives_transport_allowance: boolean;
  worker_type_code?: string;
  worker_subtype?: string;
  contract_type?: string;
  has_integral_salary?: boolean;
  has_high_risk?: boolean;
  job_title?: string;
  payment_method_code?: string;
  bank_name?: string | null;
  account_type?: string | null;
  account_number?: string | null;
}

export interface PayrollPeriodInfo {
  year: number;
  month: number;
  payroll_period_code?: string;
  payment_date: string;
}

export interface CalculatePayrollLiquidationParams {
  employee: EmployeeContractInfo;
  period: PayrollPeriodInfo;
  days_worked: number;
  transport_allowance_monthly_cop?: number;
  commissions_cop?: number;
  overtime_entries?: OvertimeEntryInput[];
  other_deductions_cop?: number;
  monthly_hours_divisor?: number;
  numbering_range_id?: string;
  reference_code?: string;
  observation?: string;
}

export interface FactusV2PayrollPayload {
  reference_code: string;
  observation: string;
  numbering_range_id: string;
  settlement_period: {
    month: string;
    year: string;
    payroll_period_code: string;
  };
  payment: {
    payment_method_code: string;
    bank_name?: string;
    account_type?: string;
    account_number?: string;
    payment_date: string;
  };
  worker: {
    identification_document_code: string;
    identification_number: string;
    first_name: string;
    first_surname: string;
    second_surname?: string;
    address: string;
    country_code: string;
    municipality_code: string;
    has_integral_salary: boolean;
    has_high_risk: boolean;
    worker_subtype: string;
    contract_type: string;
    employee_code: string;
    worker_type_code: string;
    salary: string;
    entry_date: string;
    days_worked: string;
  };
  accruals: {
    suel: {
      amount: string;
    };
    tra?: Array<{
      amount: string;
      accrual_type_code: number;
    }>;
    comi?: Array<{
      amount: string;
    }>;
    hora?: Array<{
      quantity: string;
      percentage: string;
      amount: string;
      start_date: string;
      end_date: string;
      accrual_type_code: string;
    }>;
  };
  deductions: {
    salu: {
      amount: string;
      percentage: string;
    };
    pens: {
      amount: string;
      percentage: string;
    };
    libr?: Array<{
      amount: string;
      description?: string;
    }>;
  };
}

export interface PayrollLiquidationResult {
  baseSalaryCop: number;
  daysWorked: number;
  workedSalaryCop: number;
  transportAllowanceCop: number;
  commissionsCop: number;
  overtimeTotalCop: number;
  overtimeProcessed: OvertimeEntryProcessed[];
  ibcCop: number;
  healthDeductionCop: number;
  pensionDeductionCop: number;
  otherDeductionsCop: number;
  grossAccruedCop: number;
  totalDeductionsCop: number;
  netPayableCop: number;
  factusPayload: FactusV2PayrollPayload;
}

/**
 * Auxilio de transporte legal colombiano por defecto (vigente 2026/2025 aprox)
 */
export const DEFAULT_COLOMBIAN_TRANSPORT_ALLOWANCE_COP = 249095;

/**
 * Divisor mensual estándar de horas laborales en Colombia (220 horas)
 */
export const DEFAULT_MONTHLY_HOURS_DIVISOR = 220;

/**
 * Liquida la nómina de un empleado para un periodo dado y construye el payload Factus v2
 */
export function calculatePayrollLiquidation(
  params: CalculatePayrollLiquidationParams,
): PayrollLiquidationResult {
  const {
    employee,
    period,
    days_worked,
    transport_allowance_monthly_cop = DEFAULT_COLOMBIAN_TRANSPORT_ALLOWANCE_COP,
    commissions_cop = 0,
    overtime_entries = [],
    other_deductions_cop = 0,
    monthly_hours_divisor = DEFAULT_MONTHLY_HOURS_DIVISOR,
    numbering_range_id = '01kpdv25zepw0vzn39th90h1a7',
    reference_code = `NOM-${period.year}${String(period.month).padStart(2, '0')}-${employee.employee_code}`,
    observation = `Nómina ordinaria mensual ${period.month}/${period.year}`,
  } = params;

  const validDays = Math.max(1, Math.min(30, days_worked));
  const baseSalary = employee.base_salary_cop;

  // 1. Sueldo proporcional a los días trabajados
  const workedSalaryCop = Math.round((baseSalary * validDays) / 30);

  // 2. Valor de la hora ordinaria
  const hourlyRate = baseSalary / monthly_hours_divisor;

  // 3. Horas extras y recargos
  let overtimeTotalCop = 0;
  const processedOvertimes: OvertimeEntryProcessed[] = [];

  let idx = 0;
  for (const entry of overtime_entries) {
    idx++;
    const def = FACTUS_OVERTIME_CODES[entry.accrual_type_code];
    const pct = entry.percentage ?? (def ? def.percentage : 25);
    const qty = entry.quantity;

    let amountCop = 0;
    if (def?.is_surcharge_only) {
      // Recargos puros (ej. nocturno 35%, dominical 75%, dominical nocturno 110%)
      amountCop = Math.round(hourlyRate * (pct / 100) * qty);
    } else {
      // Horas extras (ej. extra diurna 25%, extra nocturna 75%, etc.)
      amountCop = Math.round(hourlyRate * (1 + pct / 100) * qty);
    }

    overtimeTotalCop += amountCop;

    const defaultStartDate = `${period.year}-${String(period.month).padStart(2, '0')}-05 18:00:00`;
    const defaultEndDate = `${period.year}-${String(period.month).padStart(2, '0')}-05 23:00:00`;

    processedOvertimes.push({
      accrual_type_code: entry.accrual_type_code,
      quantity: qty.toString(),
      percentage: pct.toFixed(2),
      amount: amountCop.toFixed(2),
      amount_cop: amountCop,
      start_date: entry.start_date || defaultStartDate,
      end_date: entry.end_date || defaultEndDate,
    });
  }

  // 4. Auxilio de transporte (proporcional a días trabajados si aplica)
  const transportAllowanceCop = employee.receives_transport_allowance
    ? Math.round((transport_allowance_monthly_cop * validDays) / 30)
    : 0;

  // 5. Base de cotización de seguridad social (IBC)
  // Nota legal: El auxilio de transporte NO hace base de IBC
  const ibcCop = workedSalaryCop + commissions_cop + overtimeTotalCop;

  // 6. Deducciones obligatorias de ley (4% Salud, 4% Pensión)
  const healthDeductionCop = Math.round(ibcCop * 0.04);
  const pensionDeductionCop = Math.round(ibcCop * 0.04);
  const totalDeductionsCop = healthDeductionCop + pensionDeductionCop + other_deductions_cop;

  // 7. Totales
  const grossAccruedCop = workedSalaryCop + transportAllowanceCop + commissions_cop + overtimeTotalCop;
  const netPayableCop = grossAccruedCop - totalDeductionsCop;

  // 8. Payload Factus v2
  const accrualsObj: FactusV2PayrollPayload['accruals'] = {
    suel: {
      amount: workedSalaryCop.toFixed(2),
    },
  };

  if (transportAllowanceCop > 0) {
    accrualsObj.tra = [
      {
        amount: transportAllowanceCop.toFixed(2),
        accrual_type_code: 1,
      },
    ];
  }

  if (commissions_cop > 0) {
    accrualsObj.comi = [
      {
        amount: commissions_cop.toFixed(2),
      },
    ];
  }

  if (processedOvertimes.length > 0) {
    accrualsObj.hora = processedOvertimes.map((o) => ({
      quantity: o.quantity,
      percentage: o.percentage,
      amount: o.amount,
      start_date: o.start_date,
      end_date: o.end_date,
      accrual_type_code: o.accrual_type_code,
    }));
  }

  const deductionsObj: FactusV2PayrollPayload['deductions'] = {
    salu: {
      amount: healthDeductionCop.toFixed(2),
      percentage: '4',
    },
    pens: {
      amount: pensionDeductionCop.toFixed(2),
      percentage: '4',
    },
  };

  if (other_deductions_cop > 0) {
    deductionsObj.libr = [
      {
        amount: other_deductions_cop.toFixed(2),
        description: 'Otras deducciones autorizadas',
      },
    ];
  }

  const factusPayload: FactusV2PayrollPayload = {
    reference_code,
    observation,
    numbering_range_id,
    settlement_period: {
      month: String(period.month),
      year: String(period.year),
      payroll_period_code: period.payroll_period_code || FACTUS_PAYROLL_PERIOD_CODES.MONTHLY,
    },
    payment: {
      payment_method_code: employee.payment_method_code || '42',
      bank_name: employee.bank_name || undefined,
      account_type: employee.account_type || undefined,
      account_number: employee.account_number || undefined,
      payment_date: period.payment_date,
    },
    worker: {
      identification_document_code: employee.identification_document_code || '13',
      identification_number: employee.identification_number,
      first_name: employee.first_name,
      first_surname: employee.first_surname,
      second_surname: employee.second_surname || undefined,
      address: employee.address || 'Calle 1 # 1-1',
      country_code: 'CO',
      municipality_code: employee.municipality_code || '66400',
      has_integral_salary: Boolean(employee.has_integral_salary),
      has_high_risk: Boolean(employee.has_high_risk),
      worker_subtype: employee.worker_subtype || '00',
      contract_type: employee.contract_type || FACTUS_PAYROLL_CONTRACT_TYPES.FIXED_TERM,
      employee_code: employee.employee_code,
      worker_type_code: employee.worker_type_code || FACTUS_PAYROLL_WORKER_TYPES.DEPENDENT,
      salary: baseSalary.toFixed(2),
      entry_date: employee.entry_date,
      days_worked: validDays.toFixed(2),
    },
    accruals: accrualsObj,
    deductions: deductionsObj,
  };

  return {
    baseSalaryCop: baseSalary,
    daysWorked: validDays,
    workedSalaryCop,
    transportAllowanceCop,
    commissionsCop: commissions_cop,
    overtimeTotalCop,
    overtimeProcessed: processedOvertimes,
    ibcCop,
    healthDeductionCop,
    pensionDeductionCop,
    otherDeductionsCop: other_deductions_cop,
    grossAccruedCop,
    totalDeductionsCop,
    netPayableCop,
    factusPayload,
  };
}
