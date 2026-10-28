/**
 * Esquemas Zod para el Panel de Pedidos (Ajustes, Transiciones y Consultas)
 * Alineado con DEFINICION_TECNICA.md (v2.4.0) y FASE_03B_PANEL_LIVIANO_AJUSTES_Y_TRACKING_SSE.md
 */

import { z } from 'zod';

export const OrderStatusEnum = z.enum([
  'REQUESTED',
  'RECEIVED',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'PICKED_UP',
  'SERVED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED_UNPROCESSED',
]);

export const OrderOriginEnum = z.enum(['WHATSAPP', 'WEB_DIRECT', 'TABLE_QR', 'STAFF']);
export const FulfillmentTypeEnum = z.enum(['PICKUP', 'DELIVERY', 'DINE_IN']);

export const AdjustOrderItemModifierSchema = z.object({
  modifier_group_id: z.string().optional().nullable(),
  modifier_group_name: z.string().optional().nullable(),
  option_id: z.string().min(1, 'El option_id es requerido'),
  option_name: z.string().optional().nullable(),
  price_cop: z.number().int().nonnegative('El precio extra debe ser mayor o igual a 0').default(0),
});

export const AdjustOrderItemSchema = z.object({
  product_id: z.string().min(1, 'El product_id es requerido'),
  variant_id: z.string().optional().nullable(),
  quantity: z.number().int().min(1, 'La cantidad debe ser al menos 1'),
  modifiers: z.array(AdjustOrderItemModifierSchema).default([]),
  notes: z.string().max(255).optional().nullable(),
});

export const AdjustOrderItemsSchema = z.object({
  items: z.array(AdjustOrderItemSchema).min(1, 'El pedido debe contener al menos 1 producto'),
  delivery_fee_cop: z.number().int().nonnegative('La tarifa de domicilio debe ser mayor o igual a 0').default(0),
  reason: z.string().max(500).optional().nullable(),
});

export const TransitionOrderStatusSchema = z
  .object({
    to_status: OrderStatusEnum,
    reason: z.string().max(500).optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.to_status === 'REJECTED' || data.to_status === 'CANCELLED') {
        return !!data.reason && data.reason.trim().length >= 3;
      }
      return true;
    },
    {
      message: 'Se requiere un motivo de al menos 3 caracteres al rechazar o cancelar un pedido',
      path: ['reason'],
    },
  );

export const BranchOrdersQuerySchema = z.object({
  status: OrderStatusEnum.optional(),
  origin: OrderOriginEnum.optional(),
  fulfillment_type: FulfillmentTypeEnum.optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type AdjustOrderItemDto = z.infer<typeof AdjustOrderItemSchema>;
export type AdjustOrderItemsDto = z.infer<typeof AdjustOrderItemsSchema>;
export type TransitionOrderStatusDto = z.infer<typeof TransitionOrderStatusSchema>;
export type BranchOrdersQueryDto = z.infer<typeof BranchOrdersQuerySchema>;
