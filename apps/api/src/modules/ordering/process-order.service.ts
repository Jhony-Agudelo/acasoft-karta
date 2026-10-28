import {
  Injectable,
  NotFoundException,
  ConflictException,
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

  async processOrder(tenantId: string, orderId: string, actorId: string | undefined) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      // 1. Obtener la orden existente
      const order = await (tx as any).order.findFirst({
        where: { id: orderId, tenant_id: tenantId },
        include: {
          branch: true,
          items: true,
          edits: true,
        },
      });

      if (!order) {
        throw new NotFoundException({
          errorCode: 'ORDER_NOT_FOUND',
          message: 'El pedido no fue encontrado.',
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

      // 6. Construir mensaje y enlace de WhatsApp hacia el cliente (sin PII sensible)
      const customerSnapshot = order.customer_snapshot_json as any;
      const baseUrl = process.env.PUBLIC_APP_URL || 'http://localhost:5173';

      const { whatsapp_client_url, copyable_message } = buildBranchToCustomerProcessedWhatsapp({
        customerName: customerSnapshot?.name || 'Cliente',
        customerPhoneE164: customerSnapshot?.phone_e164 || '',
        restaurantName: order.branch?.name || 'Restaurante',
        orderCode: order.order_code,
        grandTotalCop: order.grand_total_cop,
        publicToken: order.public_token,
        trackingBaseUrl: baseUrl,
      });

      // 7. Notificación en tiempo real vía Server-Sent Events
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
        whatsapp_client_url,
        copyable_message,
      };
    });
  }
}
