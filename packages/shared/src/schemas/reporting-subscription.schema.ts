import { z } from 'zod';

/**
 * Esquemas Zod y Contratos DTO para Reportes Financieros y Suscripciones SaaS (Fase 05)
 * Alineados con DEFINICION_TECNICA.md (v2.4.0) y FASE_05_REPORTES_SUSCRIPCION_MANUAL_Y_PWA.md
 */

// ---------------------------------------------------------------------------
// 1. Reporte de Ventas y Conciliación Financiera (reporting)
// ---------------------------------------------------------------------------

export const SalesReportQuerySchema = z.object({
  branch_id: z.string().uuid('branch_id debe ser un UUID válido').optional(),
  date_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date_from debe tener formato YYYY-MM-DD'),
  date_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date_to debe tener formato YYYY-MM-DD'),
  origin: z.enum(['WHATSAPP', 'WEB_DIRECT', 'PHONE_MANUAL', 'WAITER']).optional(),
  fulfillment_type: z.enum(['PICKUP', 'DELIVERY', 'DINE_IN']).optional(),
});

export type SalesReportQueryDto = z.infer<typeof SalesReportQuerySchema>;

export interface BillingSummaryDto {
  confirmed_orders_count: number;
  net_products_sales_cop: number;
  taxable_base_cop: number;
  tax_inc_cop: number;
  tax_iva_cop: number;
  discount_total_cop: number;
  delivery_fees_total_cop: number;
  tips_total_cop: number;
  gross_billed_total_cop: number;
}

export interface ReconciliationSummaryDto {
  collected_total_cop: number;
  collected_products_cop: number;
  collected_delivery_cop: number;
  collected_tips_cop: number;
  pending_receivable_cop: number;
  courtesy_total_cop: number;
  written_off_total_cop: number;
  is_balanced: boolean;
}

export interface CollectionsByMethodDto {
  CASH: number;
  POS_TERMINAL: number;
  MANUAL_TRANSFER: number;
}

export interface NotTrackedOrdersSummaryDto {
  count: number;
  nominal_total_cop: number;
}

export interface UncollectedResolutionItemDto {
  order_id: string;
  order_code: string;
  occurred_at: string;
  resolution_type: 'COURTESY' | 'WRITTEN_OFF';
  uncollected_amount_cop: number;
  resolution_reason: string;
  resolved_by_name?: string | null;
}

export interface ExcludedOrdersSummaryDto {
  requested_unprocessed_count: number;
  rejected_count: number;
  cancelled_count: number;
  expired_count: number;
}

export interface OperationalMetricsDto {
  top_products: Array<{
    product_name: string;
    quantity_sold: number;
    total_cop: number;
  }>;
  avg_prep_minutes: number | null;
  avg_delivery_minutes: number | null;
}

export interface SalesReportResponseDto {
  period: {
    date_from: string;
    date_to: string;
    timezone: string;
  };
  billing_summary: BillingSummaryDto;
  reconciliation_summary: ReconciliationSummaryDto;
  collections_by_method: CollectionsByMethodDto;
  not_tracked_orders_summary: NotTrackedOrdersSummaryDto;
  uncollected_resolutions_detail: UncollectedResolutionItemDto[];
  excluded_orders_summary: ExcludedOrdersSummaryDto;
  operational_metrics: OperationalMetricsDto;
}

// ---------------------------------------------------------------------------
// 2. Suscripciones SaaS Manuales (billing-subscription)
// ---------------------------------------------------------------------------

export const SubscriptionPlanIdSchema = z.enum([
  'PLAN_STARTER_WHATSAPP',
  'PLAN_OPERATIONS_PRO',
  'PLAN_ENTERPRISE_DINING',
]);
export type SubscriptionPlanId = z.infer<typeof SubscriptionPlanIdSchema>;

export const SubscriptionStatusSchema = z.enum([
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'SUSPENDED',
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

export const UpdateTenantSubscriptionSchema = z.object({
  plan_id: SubscriptionPlanIdSchema,
  status: SubscriptionStatusSchema,
  current_period_start: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  current_period_end: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  invoice_amount_cop: z
    .number()
    .int('El monto de la factura debe ser entero en COP')
    .nonnegative('El monto de la factura debe ser mayor o igual a 0')
    .optional(),
  payment_reference_note: z.string().trim().max(255).optional(),
  reason: z
    .string()
    .trim()
    .min(3, 'El motivo de actualización de suscripción debe tener al menos 3 caracteres')
    .max(500),
});

export type UpdateTenantSubscriptionDto = z.infer<typeof UpdateTenantSubscriptionSchema>;

export interface SubscriptionInvoiceItemDto {
  id: string;
  invoice_code: string;
  plan_id: string;
  amount_cop: number;
  status: string;
  payment_reference_note?: string | null;
  issued_at: string;
  recorded_by?: { name: string; email: string } | null;
}

export interface TenantSubscriptionResponseDto {
  id: string;
  tenant_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  updated_at: string;
  invoices: SubscriptionInvoiceItemDto[];
  entitled_modules: string[];
}
