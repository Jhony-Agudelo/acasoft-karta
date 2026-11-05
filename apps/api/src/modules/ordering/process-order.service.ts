import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { SseStreamService } from '../notifications/sse-stream.service';
import {
  buildBranchToCustomerProcessedWhatsapp,
  maskCustomerSnapshot,
} from '@restaurante-saas/shared';

@Injectable()
export class ProcessOrderService {
  private readonly logger = new Logger(ProcessOrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sseStream: SseStreamService,
  ) {}

  async processOrder(tenantId: string, orderId: string, actorId: string | undefined, actorRole?: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      // 1. Obtener la orden existente
      const order = await (tx as any).order.findFirst({
        where: { id: orderId, tenant_id: tenantId },
        include: {
          branch: true,
          items: true,
          edits: true,
          dining_account: {
            include: { opener: true },
          },
        },
      });

      if (!order) {
        throw new NotFoundException({
          errorCode: 'ORDER_NOT_FOUND',
          message: 'El pedido no fue encontrado.',
        });
      }

      // Regla de control exclusivo: Si la comanda es de salón y quien confirma es MESERO, solo el que abrió la cuenta puede confirmarla
      if (order.dining_account && actorRole === 'WAITER' && order.dining_account.opened_by !== actorId) {
        throw new ForbiddenException({
          errorCode: 'TABLE_LOCKED_BY_ANOTHER_SERVER',
          message: `Esta mesa está asignada exclusivamente al mesero ${order.dining_account.opener?.name || 'otro mesero'}. Solo dicho mesero o un administrador pueden confirmar pedidos en ella.`,
        });
      }

      // 2. Verificar que no haya sido procesado previamente ni esté bloqueado
      if (order.is_locked || (order.status !== 'REQUESTED' && order.status !== 'RECEIVED')) {
        throw new ConflictException({
          errorCode: 'ORDER_ALREADY_LOCKED',
          message: 'El pedido ya fue procesado o no se encuentra en estado procesable.',
        });
      }

      // 3. Transicionar a ACCEPTED y bloquear modificaciones directas
      const processedAt = new Date();
      const updatedOrder = await (tx as any).order.update({
        where: { id: orderId },
        data: {
          status: 'ACCEPTED',
          is_locked: true,
          processed_at: processedAt,
          processed_by: actorId || null,
        },
        include: {
          branch: true,
          items: true,
          edits: true,
        },
      });

      // 4. Registrar evento de estado
      await (tx as any).orderStatusEvent.create({
        data: {
          tenant_id: tenantId,
          order_id: orderId,
          from_status: order.status,
          to_status: 'ACCEPTED',
          actor_id: actorId || null,
          visible_to_customer: true,
        },
      });

      // 5. Auditoría
      await (tx as any).auditEvent.create({
        data: {
          tenant_id: tenantId,
          actor_id: actorId || null,
          action: 'ORDER_PROCESSED',
          entity_type: 'Order',
          entity_id: orderId,
          metadata_json: {
            order_code: order.order_code,
            processed_at: processedAt.toISOString(),
          },
        },
      });

      // 6. Si pertenece a una cuenta de salón (DiningAccount), sumar sus importes e incrementar version
      if (order.dining_account_id) {
        const activeOrders = await (tx as any).order.findMany({
          where: {
            dining_account_id: order.dining_account_id,
            status: { notIn: ['REJECTED', 'CANCELLED', 'EXPIRED_UNPROCESSED'] },
          },
          select: {
            subtotal_products_cop: true,
            tax_total_cop: true,
          },
        });

        const newSubtotal = activeOrders.reduce(
          (acc: number, o: any) => acc + o.subtotal_products_cop,
          0,
        );
        const newTaxTotal = activeOrders.reduce(
          (acc: number, o: any) => acc + o.tax_total_cop,
          0,
        );

        const account = await (tx as any).diningAccount.findUnique({
          where: { id: order.dining_account_id },
        });

        if (account) {
          const newGrandTotal = Math.max(
            0,
            newSubtotal - account.discount_total_cop + account.tip_cop,
          );
          const newVersion = account.version + 1;

          await (tx as any).diningAccount.update({
            where: { id: account.id },
            data: {
              subtotal_products_cop: newSubtotal,
              tax_total_cop: newTaxTotal,
              grand_total_cop: newGrandTotal,
              version: newVersion,
            },
          });

          this.sseStream.emitToBranch(tenantId, order.branch_id, 'dining.order_added', {
            account_id: account.id,
            order_id: order.id,
            order_code: order.order_code,
            version: newVersion,
            grand_total_cop: newGrandTotal,
          });
        }
      }

      // 7. Construir mensaje y enlace de WhatsApp hacia el cliente (sin PII sensible)
      const customerSnapshot = order.customer_snapshot_json as any;
      const baseUrl = process.env.PUBLIC_APP_URL || 'http://localhost:5173';

      let whatsappClientUrl = '';
      let copyableMsg = '';
      try {
        const { whatsapp_client_url, copyable_message } = buildBranchToCustomerProcessedWhatsapp({
          customerName: customerSnapshot?.name || 'Cliente',
          customerPhoneE164: customerSnapshot?.phone_e164 || '',
          restaurantName: order.branch?.name || 'Restaurante',
          orderCode: order.order_code,
          grandTotalCop: order.grand_total_cop,
          publicToken: order.public_token,
          trackingBaseUrl: baseUrl,
        });
        whatsappClientUrl = whatsapp_client_url;
        copyableMsg = copyable_message;
      } catch {
        // En comandas de salón o pedidos sin teléfono de contacto, omitir enlace wa.me
      }

      // 8. Notificación en tiempo real vía Server-Sent Events
      const editsCount = order.edits?.length || 0;
      const trackingUrl = `${baseUrl.replace(/\/+$/, '')}/t/${order.public_token}`;

      this.sseStream.emitToBranch(tenantId, order.branch_id, 'order.status_changed', {
        order_id: updatedOrder.id,
        order_code: updatedOrder.order_code,
        status: 'ACCEPTED',
        is_locked: true,
        grand_total_cop: updatedOrder.grand_total_cop,
        edits_count: editsCount,
      });

      this.sseStream.emitToBranch(tenantId, order.branch_id, 'kitchen.order_updated', {
        order_id: updatedOrder.id,
        status: 'ACCEPTED',
      });

      this.sseStream.emitToTracking(order.public_token, {
        order_id: updatedOrder.id,
        order_code: updatedOrder.order_code,
        status: 'ACCEPTED',
        grand_total_cop: updatedOrder.grand_total_cop,
        customer_snapshot: maskCustomerSnapshot(customerSnapshot),
        tracking_url: trackingUrl,
      });

      return {
        order_id: updatedOrder.id,
        order_code: updatedOrder.order_code,
        status: 'ACCEPTED',
        is_locked: true,
        processed_at: processedAt,
        grand_total_cop: updatedOrder.grand_total_cop,
        tracking_url: trackingUrl,
        whatsapp_client_url: whatsappClientUrl,
        whatsapp_redirect_url: whatsappClientUrl,
        copyable_message: copyableMsg,
      };
    });
  }
}
