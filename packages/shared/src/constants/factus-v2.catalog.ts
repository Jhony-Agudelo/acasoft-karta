/**
 * Catálogo Oficial de Códigos y Constantes DIAN para Factus API v2
 * Alineado con FASE_08_MODULO_FINANCIERO_NOMINA_Y_FACTUS_V2.md y api-factus-v2.json
 */

export const FACTUS_DOCUMENT_TYPES = {
  BILL: '21',
  CREDIT_NOTE: '22',
  DEBIT_NOTE: '23',
  SUPPORT_DOCUMENT: '24',
  SUPPORT_ADJUSTMENT_NOTE: '25',
  PAYROLL: '26',
  PAYROLL_ADJUSTMENT_NOTE: '27',
} as const;

export type FactusDocumentTypeCode =
  (typeof FACTUS_DOCUMENT_TYPES)[keyof typeof FACTUS_DOCUMENT_TYPES];

export const FACTUS_PAYMENT_FORMS = {
  CASH_IMMEDIATE: '1', // Contado
  CREDIT: '2', // Crédito
} as const;

export type FactusPaymentFormCode =
  (typeof FACTUS_PAYMENT_FORMS)[keyof typeof FACTUS_PAYMENT_FORMS];

export const FACTUS_PAYMENT_METHODS = {
  CASH: '10', // Efectivo
  TRANSFER: '42', // Consignación / Transferencia (Nequi, DaviPlata, Bre-B, Bancolombia)
  CREDIT_CARD: '48', // Tarjeta Crédito
  DEBIT_CARD: '49', // Tarjeta Débito
} as const;

export type FactusPaymentMethodCode =
  (typeof FACTUS_PAYMENT_METHODS)[keyof typeof FACTUS_PAYMENT_METHODS];

export const FACTUS_IDENTIFICATION_TYPES = {
  CIVIL_REGISTRATION: '11',
  IDENTITY_CARD: '12',
  CITIZENSHIP_CARD: '13', // Cédula de ciudadanía
  FOREIGNER_IDENTITY_CARD: '22', // Cédula de extranjería
  NIT: '31', // NIT
  PASSPORT: '41', // Pasaporte
} as const;

export type FactusIdentificationTypeCode =
  (typeof FACTUS_IDENTIFICATION_TYPES)[keyof typeof FACTUS_IDENTIFICATION_TYPES];

export const FACTUS_LEGAL_ORGANIZATION_TYPES = {
  LEGAL_ENTITY: '1', // Persona Jurídica
  NATURAL_PERSON: '2', // Persona Natural
} as const;

export type FactusLegalOrganizationTypeCode =
  (typeof FACTUS_LEGAL_ORGANIZATION_TYPES)[keyof typeof FACTUS_LEGAL_ORGANIZATION_TYPES];

export const FACTUS_FINAL_CONSUMER_DEFAULTS = {
  identification_document_code: '13',
  identification: '222222222222',
  names: 'Consumidor Final',
  send_email: false,
} as const;

export const FACTUS_TAX_CODES = {
  IVA: '01',
  INC: '04',
} as const;

export type FactusTaxCode =
  (typeof FACTUS_TAX_CODES)[keyof typeof FACTUS_TAX_CODES];

export interface FactusOvertimeDefinition {
  readonly code: string;
  readonly name: string;
  readonly percentage: number;
  readonly is_surcharge_only: boolean;
}

export const FACTUS_OVERTIME_CODES: Record<string, FactusOvertimeDefinition> = {
  '1': { code: '1', name: 'Hora Extra Diurna', percentage: 25, is_surcharge_only: false },
  '2': { code: '2', name: 'Hora Extra Nocturna', percentage: 75, is_surcharge_only: false },
  '3': { code: '3', name: 'Hora Recargo Nocturno', percentage: 35, is_surcharge_only: true },
  '4': { code: '4', name: 'Hora Extra Diurna Dominical y Festiva', percentage: 100, is_surcharge_only: false },
  '5': { code: '5', name: 'Hora Recargo Diurno Dominical y Festivo', percentage: 75, is_surcharge_only: true },
  '6': { code: '6', name: 'Hora Extra Nocturna Dominical y Festiva', percentage: 150, is_surcharge_only: false },
  '7': { code: '7', name: 'Hora Recargo Nocturno Dominical y Festivo', percentage: 110, is_surcharge_only: true },
};

export const FACTUS_CREDIT_NOTE_CORRECTION_CONCEPTS = {
  '1': 'Devolución parcial de los bienes y/o no aceptación parcial del servicio',
  '2': 'Anulación de factura electrónica',
  '3': 'Rebaja o descuento parcial o total',
  '4': 'Ajuste de precio',
  '5': 'Otros',
} as const;

export const FACTUS_DEBIT_NOTE_CORRECTION_CONCEPTS = {
  '1': 'Intereses',
  '2': 'Gastos por cobrar',
  '3': 'Cambio del valor',
  '4': 'Otros',
} as const;

export const FACTUS_SUPPORT_ADJUSTMENT_CONCEPTS = {
  '1': 'Devolución de bienes y/o no aceptación del servicio',
  '2': 'Anulación de documento soporte',
  '3': 'Rebaja o descuento parcial o total',
  '4': 'Ajuste de precio',
} as const;

export const FACTUS_RADIAN_EVENT_CODES = {
  RECEIPT_ACQUIRER: '030', // Acuse de recibo de la factura electrónica
  RECEIPT_MERCHANDISE: '032', // Recibo del bien o prestación del servicio
  EXPRESS_ACCEPTANCE: '033', // Aceptación expresa
  TACIT_ACCEPTANCE: '034', // Aceptación tácita
} as const;

export type FactusRadianEventCode =
  (typeof FACTUS_RADIAN_EVENT_CODES)[keyof typeof FACTUS_RADIAN_EVENT_CODES];

export const FACTUS_PAYROLL_PERIOD_CODES = {
  WEEKLY: '1',
  DECENNIAL: '2',
  FORTNIGHTLY_14: '3',
  BIWEEKLY_15: '4',
  MONTHLY: '5',
} as const;

export const FACTUS_PAYROLL_WORKER_TYPES = {
  DEPENDENT: '01',
  DOMESTIC_SERVICE: '02',
  PART_TIME: '51',
} as const;

export const FACTUS_PAYROLL_CONTRACT_TYPES = {
  FIXED_TERM: '1',
  INDEFINITE_TERM: '2',
  WORK_OR_LABOR: '3',
  APPRENTICESHIP: '4',
  INTERNSHIP: '5',
} as const;

