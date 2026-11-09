/**
 * Mapeador Matemático y Constructor de Payloads para Factus API v2
 * Convierte órdenes y cuentas de Karta a contratos exactos de Factus v2 (UBL 2.1)
 * Alineado con FASE_08_MODULO_FINANCIERO_NOMINA_Y_FACTUS_V2.md
 */

import {
  FACTUS_FINAL_CONSUMER_DEFAULTS,
  FACTUS_PAYMENT_FORMS,
  FACTUS_PAYMENT_METHODS,
  FACTUS_TAX_CODES,
  FactusPaymentFormCode,
  FactusPaymentMethodCode,
} from '../constants/factus-v2.catalog';

export interface FactusItemTaxDto {
  code?: string;
  rate?: string;
  is_excluded?: boolean;
}

export interface FactusItemDto {
  code_reference: string;
  name: string;
  quantity: string;
  discount_rate: string;
  price: string;
  tax_rate?: string;
  unit_measure_code?: string;
  standard_code?: string;
  is_excluded?: boolean;
  taxes?: FactusItemTaxDto[];
}

export interface FactusAllowanceChargeDto {
  concept_type: string;
  is_surcharge: boolean;
  reason: string;
  base_amount: string;
  amount: number;
}

export interface FactusPaymentDetailDto {
  payment_form: number | string;
  payment_method_code: string;
  reference_code?: string;
  amount: string;
  due_date?: string;
}

export interface FactusEstablishmentDto {
  name: string;
  email: string;
  address: string;
  phone_number: string;
  municipality_code: string;
}

export interface FactusCustomerDto {
  identification_document_code: string;
  identification: string;
  dv?: string | null;
  legal_organization_code?: string | null;
  names?: string | null;
  company?: string | null;
  trade_name?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  tribute_code?: string | null;
  country_code?: string | null;
  responsibilities?: string[] | null;
  municipality_code?: string | null;
}

export interface FactusBillPayload {
  numbering_range_id: number;
  reference_code: string;
  document?: string;
  observation?: string;
  send_email: boolean;
  payment_form?: FactusPaymentFormCode;
  payment_method_code?: FactusPaymentMethodCode;
  payment_due_date?: string;
  payment_details?: FactusPaymentDetailDto[];
  establishment?: FactusEstablishmentDto;
  customer: FactusCustomerDto;
  items: FactusItemDto[];
  allowance_charges?: FactusAllowanceChargeDto[];
  cash_rounding_amount: string;
}

export interface InputOrderItemForFactus {
  code_reference?: string;
  name: string;
  quantity: number;
  line_total_cop: number;
  tax_type?: 'INC' | 'IVA' | 'NONE' | 'EXEMPT';
  tax_rate_bp?: number;
  unit_price_cop?: number;
  discount_cop?: number;
}

export interface InputPaymentForFactus {
  method: 'CASH' | 'MANUAL_TRANSFER' | 'POS_TERMINAL' | string;
  amount_cop: number;
  payment_form?: FactusPaymentFormCode;
  due_date?: string;
  reference_code?: string;
}

export interface MapOrderToFactusBillParams {
  numbering_range_id: number;
  reference_code: string;
  items: InputOrderItemForFactus[];
  tax_profile_mode?: 'TAX_INCLUDED_DISCRIMINATED' | 'BASE_PLUS_TAX' | 'FINAL_PRICE_NO_BREAKDOWN';
  delivery_fee_cop?: number;
  tip_cop?: number;
  paid_total_cop: number;
  customer_mode: 'FINAL_CONSUMER' | 'NAMED_CUSTOMER';
  customer?: Partial<FactusCustomerDto>;
  branch?: {
    name: string;
    email?: string;
    address?: string;
    phone?: string;
    municipality_code?: string;
  };
  payments?: InputPaymentForFactus[];
  observation?: string;
}

export interface MapOrderToFactusBillResult {
  payload: FactusBillPayload;
  totalFactus: number;
  cashRoundingAmount: string;
  itemsProcessed: Array<{
    code_reference: string;
    name: string;
    quantity: number;
    unitBasePrice: number;
    subtotalBase: number;
    taxAmount: number;
    factusLineTotal: number;
  }>;
}

/**
 * Redondea un número estrictamente a 2 decimales para compatibilidad DIAN / Factus
 */
export function roundTo2Decimals(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Mapea una forma de pago interna de Karta al código numérico de Factus v2
 */
export function mapPaymentMethodToFactus(method: string): FactusPaymentMethodCode {
  switch (method) {
    case 'CASH':
      return FACTUS_PAYMENT_METHODS.CASH;
    case 'MANUAL_TRANSFER':
      return FACTUS_PAYMENT_METHODS.TRANSFER;
    case 'POS_TERMINAL':
      return FACTUS_PAYMENT_METHODS.CREDIT_CARD;
    default:
      return FACTUS_PAYMENT_METHODS.CASH;
  }
}

/**
 * Construye el payload completo para POST /v2/bills/validate
 * asegurando la conversión exacta a base con 2 decimales, propinas en allowance_charges
 * y ajuste al centavo en cash_rounding_amount.
 */
export function mapOrderToFactusBill(params: MapOrderToFactusBillParams): MapOrderToFactusBillResult {
  const {
    numbering_range_id,
    reference_code,
    items,
    tax_profile_mode = 'TAX_INCLUDED_DISCRIMINATED',
    delivery_fee_cop = 0,
    tip_cop = 0,
    paid_total_cop,
    customer_mode,
    customer,
    branch,
    payments = [],
    observation,
  } = params;

  let totalFactus = 0;
  let subtotalProductsCop = 0;
  const factusItems: FactusItemDto[] = [];
  const processedItemsList: MapOrderToFactusBillResult['itemsProcessed'] = [];

  let idx = 0;
  for (const item of items) {
    idx++;
    const qty = item.quantity > 0 ? item.quantity : 1;
    const lineTotal = item.line_total_cop;
    subtotalProductsCop += lineTotal;

    const rateBp = item.tax_rate_bp ?? 0;
    const r = rateBp / 10000;
    const taxType = item.tax_type ?? (rateBp > 0 ? 'INC' : 'NONE');

    let unitBasePrice = 0;
    let subtotalBase = 0;
    let taxAmount = 0;
    let factusLineTotal = 0;
    let taxes: FactusItemTaxDto[] = [];
    let isExcluded = false;

    if (rateBp === 0 || taxType === 'NONE' || taxType === 'EXEMPT' || tax_profile_mode === 'FINAL_PRICE_NO_BREAKDOWN') {
      unitBasePrice = roundTo2Decimals(lineTotal / qty);
      subtotalBase = roundTo2Decimals(unitBasePrice * qty);
      taxAmount = 0;
      factusLineTotal = subtotalBase;
      isExcluded = true;
      taxes = [{ is_excluded: true }];
    } else {
      // Impuesto incluido o discriminado
      unitBasePrice = roundTo2Decimals(lineTotal / (qty * (1 + r)));
      subtotalBase = roundTo2Decimals(unitBasePrice * qty);
      taxAmount = roundTo2Decimals(subtotalBase * r);
      factusLineTotal = roundTo2Decimals(subtotalBase + taxAmount);

      const taxCode = taxType === 'INC' ? FACTUS_TAX_CODES.INC : FACTUS_TAX_CODES.IVA;
      const taxRateStr = (rateBp / 100).toFixed(2);
      taxes = [{ code: taxCode, rate: taxRateStr }];
    }

    totalFactus = roundTo2Decimals(totalFactus + factusLineTotal);

    factusItems.push({
      code_reference: item.code_reference || `ITEM-${idx + 1}`,
      name: item.name,
      quantity: qty.toFixed(2),
      discount_rate: '0.00',
      price: unitBasePrice.toFixed(2),
      tax_rate: (rateBp / 100).toFixed(2),
      unit_measure_code: '94',
      standard_code: '999',
      is_excluded: isExcluded,
      taxes,
    });

    processedItemsList.push({
      code_reference: item.code_reference || `ITEM-${idx + 1}`,
      name: item.name,
      quantity: qty,
      unitBasePrice,
      subtotalBase,
      taxAmount,
      factusLineTotal,
    });
  }

  // Domicilio
  if (delivery_fee_cop > 0) {
    const feeDec = roundTo2Decimals(delivery_fee_cop);
    totalFactus = roundTo2Decimals(totalFactus + feeDec);
    factusItems.push({
      code_reference: 'DOMICILIO',
      name: 'Servicio de domicilio',
      quantity: '1.00',
      discount_rate: '0.00',
      price: feeDec.toFixed(2),
      tax_rate: '0.00',
      unit_measure_code: '94',
      standard_code: '999',
      is_excluded: true,
      taxes: [{ is_excluded: true }],
    });
  }

  // Propina voluntaria en allowance_charges
  const allowanceCharges: FactusAllowanceChargeDto[] = [];
  if (tip_cop > 0) {
    totalFactus = roundTo2Decimals(totalFactus + tip_cop);
    allowanceCharges.push({
      concept_type: '03',
      is_surcharge: true,
      reason: 'Propina voluntaria',
      base_amount: subtotalProductsCop.toFixed(2),
      amount: tip_cop,
    });
  }

  // Conciliación de redondeo: (Total_Pagos - Total_Factus)
  const roundingDiff = roundTo2Decimals(paid_total_cop - totalFactus);
  const cashRoundingAmount = Math.abs(roundingDiff) < 0.001 ? '0.00' : roundingDiff.toFixed(2);

  // Construcción del nodo Customer
  let customerNode: FactusCustomerDto;
  let sendEmail = false;

  if (customer_mode === 'FINAL_CONSUMER') {
    customerNode = {
      identification_document_code: FACTUS_FINAL_CONSUMER_DEFAULTS.identification_document_code,
      identification: FACTUS_FINAL_CONSUMER_DEFAULTS.identification,
      names: FACTUS_FINAL_CONSUMER_DEFAULTS.names,
    };
    sendEmail = false;
  } else {
    sendEmail = true;
    const isNit = customer?.identification_document_code === '31';
    const legalOrg = customer?.legal_organization_code || (isNit ? '1' : '2');

    customerNode = {
      identification_document_code: customer?.identification_document_code || '13',
      identification: customer?.identification || FACTUS_FINAL_CONSUMER_DEFAULTS.identification,
      dv: customer?.dv || undefined,
      legal_organization_code: legalOrg,
      names: legalOrg === '2' ? (customer?.names || 'Cliente') : undefined,
      company: legalOrg === '1' ? (customer?.company || customer?.names || 'Empresa') : undefined,
      trade_name: customer?.trade_name || undefined,
      address: customer?.address || 'Calle 1 # 1-1',
      email: customer?.email || 'cliente@karta.app',
      phone: customer?.phone || '3000000000',
      tribute_code: customer?.tribute_code || (legalOrg === '1' ? '01' : 'ZZ'),
      country_code: customer?.country_code || 'CO',
      responsibilities: customer?.responsibilities || ['R-99-PN'],
      municipality_code: customer?.municipality_code || '66400',
    };
  }

  // Establecimiento
  const establishmentNode: FactusEstablishmentDto | undefined = branch
    ? {
        name: branch.name,
        email: branch.email || 'facturacion@karta.app',
        address: branch.address || 'Calle Principal',
        phone_number: branch.phone || '3000000000',
        municipality_code: branch.municipality_code || '66400',
      }
    : undefined;

  // Medios de pago
  const paymentDetails: FactusPaymentDetailDto[] = payments.length > 0
    ? payments.map((p, pIdx) => ({
        payment_form: p.payment_form || FACTUS_PAYMENT_FORMS.CASH_IMMEDIATE,
        payment_method_code: mapPaymentMethodToFactus(p.method),
        reference_code: p.reference_code || `${reference_code}-P${pIdx + 1}`,
        amount: p.amount_cop.toString(),
        due_date: p.due_date,
      }))
    : [
        {
          payment_form: FACTUS_PAYMENT_FORMS.CASH_IMMEDIATE,
          payment_method_code: FACTUS_PAYMENT_METHODS.CASH,
          reference_code: reference_code,
          amount: paid_total_cop.toString(),
        },
      ];

  const payload: FactusBillPayload = {
    numbering_range_id,
    reference_code,
    observation: observation || 'Factura POS emitida desde Karta',
    send_email: sendEmail,
    payment_form: FACTUS_PAYMENT_FORMS.CASH_IMMEDIATE,
    payment_method_code: paymentDetails[0]?.payment_method_code as FactusPaymentMethodCode || FACTUS_PAYMENT_METHODS.CASH,
    payment_details: paymentDetails,
    establishment: establishmentNode,
    customer: customerNode,
    items: factusItems,
    allowance_charges: allowanceCharges.length > 0 ? allowanceCharges : undefined,
    cash_rounding_amount: cashRoundingAmount,
  };

  return {
    payload,
    totalFactus,
    cashRoundingAmount,
    itemsProcessed: processedItemsList,
  };
}
