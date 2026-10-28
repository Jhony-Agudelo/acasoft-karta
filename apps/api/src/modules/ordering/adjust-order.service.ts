import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { SseStreamService } from '../notifications/sse-stream.service';
import {
  AdjustOrderItemsDto,
  calculateLinePricing,
  TaxProfileMode,
  TaxType,
  OrderItemModifierSnapshot,
  OrderItemProductSnapshot,
  OrderItemTaxSnapshot,
  OrderTaxSummarySnapshot,
  DIAN_FISCAL_DISCLAIMER_TEXT,
  maskCustomerSnapshot,
} from '@restaurante-saas/shared';

@Injectable()
export class AdjustOrderService {
  private readonly logger = new Logger(AdjustOrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sseStream: SseStreamService,
  ) {}

  async adjustOrderItems(
    tenantId: string,
    orderId: string,
    actorId: string | undefined,
    dto: AdjustOrderItemsDto,
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      // 1. Obtener la orden existente con sus relaciones
      const order = await (tx as any).order.findFirst({
        where: { id: orderId, tenant_id: tenantId },
        include: {
          items: true,
          branch: true,
          edits: true,
        },
      });

      if (!order) {
        throw new NotFoundException({
          errorCode: 'ORDER_NOT_FOUND',
          message: 'El pedido no fue encontrado.',
        });
      }

      // 2. Verificar que la orden no esté bloqueada ni en estados posteriores a RECEIVED
      if (order.is_locked || (order.status !== 'REQUESTED' && order.status !== 'RECEIVED')) {
        throw new ConflictException({
          errorCode: 'ORDER_ALREADY_LOCKED',
          message: 'El pedido ya fue procesado o se encuentra bloqueado para ajustes.',
        });
      }

      // 3. Tarifa de entrega: Si es PICKUP, obligatoriamente 0 COP
      const effectiveDeliveryFeeCop =
        order.fulfillment_type === 'PICKUP' ? 0 : dto.delivery_fee_cop ?? order.delivery_fee_cop;

      // 4. Construir el before_snapshot_json para la auditoría inmutable
      const before_snapshot_json = {
        subtotal_products_cop: order.subtotal_products_cop,
        discount_total_cop: order.discount_total_cop,
        delivery_fee_cop: order.delivery_fee_cop,
        tax_total_cop: order.tax_total_cop,
        grand_total_cop: order.grand_total_cop,
        items: order.items.map((item: any) => ({
          product_id: item.product_id,
          product_name: item.product_snapshot_json?.product_name || item.product_snapshot_json?.name || 'Producto',
          variant_name: item.product_snapshot_json?.variant_name || null,
          quantity: item.quantity,
          unit_price_cop: item.unit_price_cop,
          modifiers: (item.modifiers_snapshot_json || []).map((m: any) => ({
            option_name: m.option_name,
            extra_price_cop: m.extra_price_cop || 0,
          })),
          line_total_cop: item.line_total_cop,
          notes: item.notes || null,
        })),
      };

      // 5. Cargar productos y modificadores vigentes del catálogo
      const productIds: string[] = Array.from(new Set(dto.items.map((i: any) => i.product_id)));
      const products = await (tx as any).product.findMany({
        where: {
          id: { in: productIds },
          tenant_id: tenantId,
        },
        include: {
          category: true,
          variants: true,
          modifier_groups: {
            include: {
              group: {
                include: {
                  options: true,
                },
              },
            },
          },
        },
      });

      const productMap = new Map<string, any>(products.map((p: any) => [p.id, p]));

      // Obtener configuración fiscal del tenant
      const tenant = await (tx as any).tenant.findUnique({
        where: { id: tenantId },
      });
      const taxProfileMode: TaxProfileMode =
        (tenant?.tax_profile_mode as TaxProfileMode) || 'TAX_INCLUDED_DISCRIMINATED';

      let newSubtotalProductsCop = 0;
      let newTaxTotalCop = 0;
      const newItemsToInsert: any[] = [];
      const afterItemsSnapshotList: any[] = [];
      const lineTaxSnapshots: OrderItemTaxSnapshot[] = [];

      for (const itemDto of dto.items) {
        const product = productMap.get(itemDto.product_id);
        if (!product || product.status !== 'ACTIVE') {
          throw new BadRequestException({
            errorCode: 'PRODUCT_OR_MODIFIER_UNAVAILABLE',
            message: `El producto '${itemDto.product_id}' no está disponible.`,
          });
        }

        let effectiveBasePriceCop = product.price_cop;
        let variantName: string | null = null;
        if (itemDto.variant_id) {
          const variant = product.variants.find((v: any) => v.id === itemDto.variant_id);
          if (!variant || variant.status !== 'ACTIVE') {
            throw new BadRequestException({
              errorCode: 'PRODUCT_OR_MODIFIER_UNAVAILABLE',
              message: `La variante solicitada para '${product.name}' no está disponible.`,
            });
          }
          effectiveBasePriceCop = variant.price_cop;
          variantName = variant.name;
        }

        // Modificadores
        const chosenModifiers: OrderItemModifierSnapshot[] = [];
        const modifierPricings: Array<{ extra_price_cop: number }> = [];

        if (itemDto.modifiers && itemDto.modifiers.length > 0) {
          for (const modDto of itemDto.modifiers) {
            let foundOption: any = null;
            let groupName: string | null = null;
            let groupId: string | null = null;

            for (const mg of product.modifier_groups) {
              const opt = mg.group.options.find((o: any) => o.id === modDto.option_id);
              if (opt) {
                foundOption = opt;
                groupName = mg.group.name;
                groupId = mg.group.id;
                break;
              }
            }

            if (!foundOption || foundOption.status !== 'ACTIVE') {
              throw new BadRequestException({
                errorCode: 'PRODUCT_OR_MODIFIER_UNAVAILABLE',
                message: `La opción de modificador no está disponible.`,
              });
            }

            chosenModifiers.push({
              group_id: groupId || foundOption.group_id,
              group_name: groupName || '',
              option_id: foundOption.id,
              option_name: foundOption.name,
              extra_price_cop: foundOption.extra_price_cop,
            });

            modifierPricings.push({ extra_price_cop: foundOption.extra_price_cop });
          }
        }

        // Cálculo determinista de línea
        const pricing = calculateLinePricing({
          basePriceCop: effectiveBasePriceCop,
          modifiers: modifierPricings,
          quantity: itemDto.quantity,
          discountCop: 0,
          taxProfileMode,
          taxType: (product.tax_type as TaxType) || 'EXCLUDED',
          taxRateBp: product.tax_rate_bp || 0,
        });

        newSubtotalProductsCop += pricing.effective_unit_price_cop * itemDto.quantity;
        newTaxTotalCop += pricing.tax_amount_cop;

        const productSnapshot: OrderItemProductSnapshot = {
          product_id: product.id,
          category_id: product.category_id,
          category_name: product.category?.name || 'General',
          product_name: product.name,
          product_description: product.description || null,
          base_product_price_cop: product.price_cop,
          variant_id: itemDto.variant_id || null,
          variant_name: variantName,
          effective_base_price_cop: effectiveBasePriceCop,
        };

        const taxSnapshot: OrderItemTaxSnapshot = {
          tax_profile_mode: taxProfileMode,
          tax_type: (product.tax_type as TaxType) || 'EXCLUDED',
          tax_rate_bp: product.tax_rate_bp || 0,
          unit_base_plus_modifiers_cop: pricing.effective_unit_price_cop,
          gross_line_subtotal_cop: pricing.gross_subtotal_cop,
          discount_cop: 0,
          taxable_base_cop: pricing.taxable_base_cop,
          tax_amount_cop: pricing.tax_amount_cop,
          line_total_cop: pricing.line_total_cop,
        };
        lineTaxSnapshots.push(taxSnapshot);

        newItemsToInsert.push({
          tenant_id: tenantId,
          order_id: orderId,
          product_id: product.id,
          product_snapshot_json: productSnapshot,
          quantity: itemDto.quantity,
          unit_price_cop: effectiveBasePriceCop,
          discount_cop: 0,
          modifiers_snapshot_json: chosenModifiers,
          tax_snapshot_json: taxSnapshot,
          line_total_cop: pricing.line_total_cop,
          station_key: product.override_station_key || product.category?.default_station_key || 'COCINA',
          status: 'PENDING',
          notes: itemDto.notes || null,
        });

        afterItemsSnapshotList.push({
          product_id: product.id,
          product_name: product.name,
          variant_name: variantName,
          quantity: itemDto.quantity,
          unit_price_cop: effectiveBasePriceCop,
          modifiers: chosenModifiers.map((m) => ({
            option_name: m.option_name,
            extra_price_cop: m.extra_price_cop,
          })),
          line_total_cop: pricing.line_total_cop,
          notes: itemDto.notes || null,
        });
      }

      // 6. Nuevo total general
      const newGrandTotalCop =
        taxProfileMode === 'BASE_PLUS_TAX'
          ? newSubtotalProductsCop + newTaxTotalCop + effectiveDeliveryFeeCop
          : newSubtotalProductsCop + effectiveDeliveryFeeCop;

      // 7. Verificar que el total no quede por debajo de lo ya pagado
      if (newGrandTotalCop < order.paid_total_cop) {
        throw new ConflictException({
          errorCode: 'TOTAL_BELOW_PAID_AMOUNT',
          message: `El nuevo total ($${newGrandTotalCop}) no puede ser inferior al monto ya cobrado ($${order.paid_total_cop}).`,
        });
      }

      // 8. Resumen consolidado de impuestos
      const taxAddition = taxProfileMode === 'BASE_PLUS_TAX' ? newTaxTotalCop : 0;
      const taxSummarySnapshot: OrderTaxSummarySnapshot = {
        tax_profile_mode: taxProfileMode,
        breakdown_by_tax: [
          {
            tax_type: (tenant?.default_tax_type as TaxType) || 'EXCLUDED',
            tax_rate_bp: tenant?.default_tax_rate_bp || 0,
            taxable_base_cop: lineTaxSnapshots.reduce((acc, t) => acc + t.taxable_base_cop, 0),
            tax_amount_cop: newTaxTotalCop,
            total_with_tax_cop: newSubtotalProductsCop + taxAddition,
          },
        ],
        fiscal_disclaimer: DIAN_FISCAL_DISCLAIMER_TEXT,
      };

      // 9. Reemplazar líneas en order_items
      await (tx as any).orderItem.deleteMany({
        where: { order_id: orderId, tenant_id: tenantId },
      });

      await (tx as any).orderItem.createMany({
        data: newItemsToInsert,
      });

      // 10. Actualizar totales en la tabla orders
      const updatedOrder = await (tx as any).order.update({
        where: { id: orderId },
        data: {
          subtotal_products_cop: newSubtotalProductsCop,
          delivery_fee_cop: effectiveDeliveryFeeCop,
          tax_total_cop: newTaxTotalCop,
          grand_total_cop: newGrandTotalCop,
          tax_summary_snapshot_json: taxSummarySnapshot,
        },
        include: {
          items: true,
          branch: true,
          edits: true,
        },
      });

      // 11. Construir after_snapshot_json y registrar en order_edits
      const after_snapshot_json = {
        subtotal_products_cop: newSubtotalProductsCop,
        discount_total_cop: 0,
        delivery_fee_cop: effectiveDeliveryFeeCop,
        tax_total_cop: newTaxTotalCop,
        grand_total_cop: newGrandTotalCop,
        items: afterItemsSnapshotList,
      };

      await (tx as any).orderEdit.create({
        data: {
          tenant_id: tenantId,
          order_id: orderId,
          actor_id: actorId || null,
          before_snapshot_json,
          after_snapshot_json,
          reason: dto.reason || null,
        },
      });

      // 12. Auditoría
      await (tx as any).auditEvent.create({
        data: {
          tenant_id: tenantId,
          actor_id: actorId || null,
          action: 'ORDER_ADJUSTED_BEFORE_PROCESS',
          entity_name: 'Order',
          entity_id: orderId,
          metadata_json: {
            order_code: order.order_code,
            before_grand_total: order.grand_total_cop,
            after_grand_total: newGrandTotalCop,
            reason: dto.reason || null,
          },
        },
      });

      // 13. Emitir eventos SSE
      const editsCount = (order.edits?.length || 0) + 1;
      const orderPayload = {
        order_id: updatedOrder.id,
        order_code: updatedOrder.order_code,
        status: updatedOrder.status,
        grand_total_cop: updatedOrder.grand_total_cop,
        subtotal_products_cop: updatedOrder.subtotal_products_cop,
        delivery_fee_cop: updatedOrder.delivery_fee_cop,
        edits_count: editsCount,
        was_adjusted: true,
      };

      this.sseStream.emitToBranch(
        tenantId,
        order.branch_id,
        'order.adjusted',
        orderPayload,
      );

      this.sseStream.emitToTracking(order.public_token, {
        ...orderPayload,
        customer_snapshot: maskCustomerSnapshot(order.customer_snapshot_json as any),
      });

      return {
        ...updatedOrder,
        edits_count: editsCount,
        was_adjusted_by_restaurant: true,
      };
    });
  }
}
