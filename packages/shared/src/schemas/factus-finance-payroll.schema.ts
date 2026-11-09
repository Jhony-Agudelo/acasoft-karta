/**
 * Esquemas Zod para Configuración Factus v2, Facturación DIAN,
 * Gastos / Proveedores / Documento Soporte y Nómina Electrónica
 * Alineado con FASE_08_MODULO_FINANCIERO_NOMINA_Y_FACTUS_V2.md
 */

import { z } from 'zod';

export const FactusEnvironmentSchema = z.enum(['SANDBOX', 'PRODUCTION']);

export const FactusTenantConfigInputSchema = z.object({
  environment: FactusEnvironmentSchema.default('SANDBOX'),
  api_base_url: z.string().url().default('https://api-sandbox.factus.com.co'),
  client_id: z.string().min(1, 'El client_id es requerido'),
  client_secret: z.string().min(1, 'El client_secret es requerido'),
  username: z.string().min(1, 'El correo/usuario de Factus es requerido'),
  password: z.string().min(1, 'La contraseña de Factus es requerida'),
  invoicing_trigger_mode: z.enum(['AUTO_ALWAYS', 'CASHIER_CHOICE']).default('CASHIER_CHOICE'),
  default_municipality_code: z.string().default('66400'),
  default_tribute_code: z.string().default('01'),
  is_active: z.boolean().default(true),
});

export type FactusTenantConfigInputDto = z.infer<typeof FactusTenantConfigInputSchema>;

export const SyncNumberingRangesSchema = z.object({
  branch_id: z.string().uuid('ID de sucursal inválido'),
});

export const AcquirerLookupQuerySchema = z.object({
  doc_code: z.enum(['11', '12', '13', '22', '31', '41']).default('13'),
  doc_number: z.string().min(3, 'El documento debe tener al menos 3 dígitos').max(32),
});

export const TaxCustomerProfileSchema = z.object({
  identification_document_code: z.string().default('13'),
  identification: z.string().min(3),
  dv: z.string().max(2).optional().nullable(),
  legal_organization_code: z.enum(['1', '2']).default('2'),
  names: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  trade_name: z.string().optional().nullable(),
  email: z.string().email('Correo electrónico inválido').optional().nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  municipality_code: z.string().default('66400'),
  tribute_code: z.string().default('ZZ'),
  responsibilities: z.array(z.string()).default(['R-99-PN']),
});

export type TaxCustomerProfileDto = z.infer<typeof TaxCustomerProfileSchema>;

export const EmitElectronicInvoiceSchema = z.object({
  customer_mode: z.enum(['FINAL_CONSUMER', 'NAMED_CUSTOMER']).default('FINAL_CONSUMER'),
  customer: TaxCustomerProfileSchema.partial().optional(),
});

export type EmitElectronicInvoiceDto = z.infer<typeof EmitElectronicInvoiceSchema>;

export const EmitCreditNoteSchema = z.object({
  correction_concept_code: z.string().min(1, 'El código de concepto de corrección es requerido'),
  reason_description: z.string().min(3, 'Debe especificar el motivo de la nota crédito'),
});

export type EmitCreditNoteDto = z.infer<typeof EmitCreditNoteSchema>;

export const SupplierInputSchema = z.object({
  identification_document_code: z.enum(['11', '12', '13', '22', '31', '41']).default('31'),
  identification: z.string().min(3).max(32),
  dv: z.string().max(2).optional().nullable(),
  legal_organization_code: z.enum(['1', '2']).default('1'),
  name: z.string().min(2, 'El nombre o razón social es requerido'),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().min(3, 'La dirección fiscal es requerida'),
  municipality_code: z.string().default('66400'),
  is_obligated_to_invoice: z.boolean().default(false),
  is_active: z.boolean().default(true),
});

export type SupplierInputDto = z.infer<typeof SupplierInputSchema>;

export const ExpenseItemSchema = z.object({
  code_reference: z.string().optional(),
  name: z.string().min(1, 'El nombre del ítem es requerido'),
  quantity: z.number().positive('La cantidad debe ser mayor a 0'),
  price_cop: z.number().nonnegative('El precio debe ser mayor o igual a 0'),
  tax_code: z.string().optional(),
  tax_rate: z.number().nonnegative().optional(),
  ingredient_id: z.string().uuid().optional().nullable(),
});

export const ExpenseCategoryEnum = z.enum([
  'INGREDIENTS_PURCHASE',
  'UTILITIES',
  'RENT',
  'MAINTENANCE',
  'PACKAGING',
  'MARKETING',
  'SERVICES',
  'OTHER',
]);

export const CreateExpenseSchema = z.object({
  supplier_id: z.string().uuid('ID de proveedor inválido'),
  expense_code: z.string().optional(),
  category: ExpenseCategoryEnum,
  payment_form: z.enum(['1', '2']).default('1'),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD').optional().nullable(),
  requires_support_document: z.boolean().default(false),
  items: z.array(ExpenseItemSchema).min(1, 'Debe incluir al menos un ítem'),
  notes: z.string().optional().nullable(),
  occurred_at: z.string().optional(),
});

export type CreateExpenseDto = z.infer<typeof CreateExpenseSchema>;

export const ExpensePaymentSchema = z.object({
  method: z.enum(['CASH', 'POS_TERMINAL', 'MANUAL_TRANSFER']),
  amount_cop: z.number().int().positive('El monto debe ser un entero positivo en COP'),
  reference_note: z.string().optional().nullable(),
});

export type ExpensePaymentDto = z.infer<typeof ExpensePaymentSchema>;

export const CreateEmployeeProfileSchema = z.object({
  employee_code: z.string().min(1, 'El código de empleado es requerido'),
  // user_id es opcional/nullable para permitir registrar personal operativo sin login (aseo, logística, etc.)
  user_id: z.string().uuid().optional().nullable(),
  job_title: z.string().min(1, 'El cargo o rol de trabajo es requerido'),
  department: z.string().optional().nullable(),
  has_system_access: z.boolean().default(false),
  identification_document_code: z.string().default('13'),
  identification_number: z.string().min(3).max(32),
  first_name: z.string().min(1, 'El primer nombre es requerido'),
  first_surname: z.string().min(1, 'El primer apellido es requerido'),
  second_surname: z.string().optional().nullable(),
  address: z.string().min(3, 'La dirección de residencia es requerida'),
  municipality_code: z.string().default('66400'),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  worker_type_code: z.string().default('01'),
  worker_subtype: z.string().default('00'),
  contract_type: z.string().default('1'),
  has_integral_salary: z.boolean().default(false),
  has_high_risk: z.boolean().default(false),
  base_salary_cop: z.number().int().positive('El salario base mensual debe ser mayor a 0'),
  receives_transport_allowance: z.boolean().default(true),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido'),
  retirement_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  payment_method_code: z.string().default('42'),
  bank_name: z.string().optional().nullable(),
  account_type: z.string().optional().nullable(),
  account_number: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
});

export type CreateEmployeeProfileDto = z.infer<typeof CreateEmployeeProfileSchema>;

export const UpdateEmployeeProfileSchema = CreateEmployeeProfileSchema.partial();
export type UpdateEmployeeProfileDto = z.infer<typeof UpdateEmployeeProfileSchema>;

export const OvertimeInputItemSchema = z.object({
  accrual_type_code: z.string(),
  quantity: z.number().positive(),
  percentage: z.number().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

export const PayrollLiquidationPreviewSchema = z.object({
  employee_id: z.string().uuid(),
  year: z.number().int().min(2024).max(2099),
  month: z.number().int().min(1).max(12),
  days_worked: z.number().int().min(1).max(30),
  commissions_cop: z.number().int().nonnegative().default(0),
  overtime_entries: z.array(OvertimeInputItemSchema).default([]),
  other_deductions_cop: z.number().int().nonnegative().default(0),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type PayrollLiquidationPreviewDto = z.infer<typeof PayrollLiquidationPreviewSchema>;

export const ProfitAndLossQuerySchema = z.object({
  branch_id: z.string().uuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
});

export type ProfitAndLossQueryDto = z.infer<typeof ProfitAndLossQuerySchema>;

