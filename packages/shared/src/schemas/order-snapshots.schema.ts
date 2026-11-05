import { z } from 'zod';
import { TaxProfileModeSchema, TaxTypeSchema } from './catalog.schema';

/**
 * Snapshots Inmutables para Órdenes y Líneas de Pedido (JSONB)
 * Alineado con DEFINICION_TECNICA.md (v2.4.0) y FASE_03A_MOTOR_PEDIDOS_ANTIFRAUDE_Y_WHATSAPP.md
 */

// ---------------------------------------------------------------------------
// 1. Snapshot de datos del cliente en Order.customer_snapshot_json
// ---------------------------------------------------------------------------
export const CustomerSnapshotSchema = z.object({
  name: z.string(),
  phone_e164: z.string().nullable().optional(),
  delivery_zone_id: z.string().uuid().nullable().optional(),
  delivery_zone_name: z.string().nullable().optional(),
  address_line: z.string().nullable().optional(),
  neighborhood: z.string().nullable().optional(),
  reference_notes: z.string().nullable().optional(),
  privacy_consent_at: z.string().optional(), // ISO-8601
  anonymized_at: z.string().nullable().optional(), // ISO-8601
  payment_method: z.enum(['CASH', 'TRANSFER']).nullable().optional(),
  cash_amount_delivered_cop: z.number().int().nullable().optional(),
  change_to_give_cop: z.number().int().nullable().optional(),
});

export type CustomerSnapshot = z.infer<typeof CustomerSnapshotSchema>;

// ---------------------------------------------------------------------------
// 2. Snapshot de resumen tributario en Order.tax_summary_snapshot_json
// ---------------------------------------------------------------------------
export const OrderTaxBreakdownItemSchema = z.object({
  tax_type: TaxTypeSchema,
  tax_rate_bp: z.number().int().min(0),
  taxable_base_cop: z.number().int().min(0),
  tax_amount_cop: z.number().int().min(0),
  total_with_tax_cop: z.number().int().min(0),
});

export type OrderTaxBreakdownItem = z.infer<typeof OrderTaxBreakdownItemSchema>;

export const OrderTaxSummarySnapshotSchema = z.object({
  tax_profile_mode: TaxProfileModeSchema,
  breakdown_by_tax: z.array(OrderTaxBreakdownItemSchema),
  fiscal_disclaimer: z.string(),
});

export type OrderTaxSummarySnapshot = z.infer<typeof OrderTaxSummarySnapshotSchema>;

// ---------------------------------------------------------------------------
// 3. Snapshot del producto en OrderItem.product_snapshot_json
// ---------------------------------------------------------------------------
export const OrderItemProductSnapshotSchema = z.object({
  product_id: z.string().uuid(),
  category_id: z.string().uuid(),
  category_name: z.string(),
  product_name: z.string(),
  product_description: z.string().nullable(),
  base_product_price_cop: z.number().int().min(0),
  variant_id: z.string().uuid().nullable(),
  variant_name: z.string().nullable(),
  effective_base_price_cop: z.number().int().min(0),
});

export type OrderItemProductSnapshot = z.infer<typeof OrderItemProductSnapshotSchema>;

// ---------------------------------------------------------------------------
// 4. Snapshot de modificador en OrderItem.modifiers_snapshot_json
// ---------------------------------------------------------------------------
export const OrderItemModifierSnapshotSchema = z.object({
  group_id: z.string().uuid(),
  group_name: z.string(),
  option_id: z.string().uuid(),
  option_name: z.string(),
  extra_price_cop: z.number().int().min(0),
});

export type OrderItemModifierSnapshot = z.infer<typeof OrderItemModifierSnapshotSchema>;

// ---------------------------------------------------------------------------
// 5. Snapshot tributario de línea en OrderItem.tax_snapshot_json
// ---------------------------------------------------------------------------
export const OrderItemTaxSnapshotSchema = z.object({
  tax_profile_mode: TaxProfileModeSchema,
  tax_type: TaxTypeSchema,
  tax_rate_bp: z.number().int().min(0),
  unit_base_plus_modifiers_cop: z.number().int().min(0),
  gross_line_subtotal_cop: z.number().int().min(0),
  discount_cop: z.number().int().min(0),
  taxable_base_cop: z.number().int().min(0),
  tax_amount_cop: z.number().int().min(0),
  line_total_cop: z.number().int().min(0),
});

export type OrderItemTaxSnapshot = z.infer<typeof OrderItemTaxSnapshotSchema>;
