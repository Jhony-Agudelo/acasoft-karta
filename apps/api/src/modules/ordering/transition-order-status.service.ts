import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { SseStreamService } from '../notifications/sse-stream.service';
import {
  TransitionOrderStatusDto,
  canTransitionOrderStatus,
  OrderStatus,
  buildBranchToCustomerStatusWhatsapp,
  maskCustomerSnapshot,
} from '@restaurante-saas/shared';

@Injectable()
export class TransitionOrderStatusService {
  private readonly logger = new Logger(TransitionOrderStatusService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sseStream: SseStreamService,
  ) {}

  async transitionStatus(
    tenantId: string,
    orderId: string,
    actorId: string | undefined,
    dto: TransitionOrderStatusDto,
  ) {
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

      // 2. Validar con la máquina de estados determinista
      const validation = canTransitionOrderStatus({
        fromStatus: order.status as OrderStatus,
        toStatus: dto.to_status as OrderStatus,
        origin: order.origin as any,
        fulfillmentType: order.fulfillment_type as any,
        requirePaymentBeforePreparation: order.require_payment_before_preparation,
        paymentStatus: order.payment_status as any,
        paidTotalCop: order.paid_total_cop,
      });

      if (!validation.allowed) {
        throw new ConflictException({
          errorCode: validation.errorCode || 'INVALID_STATUS_TRANSITION',
          message: validation.message || 'Transición de estado no permitida.',
        });
      }

      // 3. Regla estricta: Pago previo requerido antes de preparación
      if (
        dto.to_status === 'PREPARING' &&
        order.require_payment_before_preparation &&
        order.payment_status !== 'PAID'
      ) {
        throw new ConflictException({
          errorCode: 'PAYMENT_REQUIRED_BEFORE_PREPARATION',
          message: 'Se requiere pago completo confirmado antes de iniciar la preparación del pedido.',
        });
      }

      // 4. Regla estricta: Rechazo o cancelación con cobros activos
      if (
        (dto.to_status === 'REJECTED' || dto.to_status === 'CANCELLED') &&
        order.paid_total_cop > 0
      ) {
        throw new ConflictException({
          errorCode: 'ORDER_HAS_ACTIVE_PAYMENTS',
          message: 'No es posible cancelar o rechazar un pedido con cobros activos. Requiere resolución previa.',
        });
      }

      // 5. Expiración de token público a las 24 horas si entra a estado terminal
      const terminalStatuses = ['DELIVERED', 'PICKED_UP', 'SERVED', 'REJECTED', 'CANCELLED'];
      let publicTokenExpiresAt: Date | undefined = undefined;
      if (terminalStatuses.includes(dto.to_status)) {
        publicTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      }

      // 6. Actualizar orden
      const updatedOrder = await (tx as any).order.update({
        where: { id: orderId },
        data: {
          status: dto.to_status,
          ...(publicTokenExpiresAt ? { public_token_expires_at: publicTokenExpiresAt } : {}),
        },
        include: {
          branch: true,
          items: true,
          edits: true,
        },
      });

      // 7. Registrar evento de estado
      await (tx as any).orderStatusEvent.create({
        data: {
          tenant_id: tenantId,
          order_id: orderId,
          from_status: order.status,
          to_status: dto.to_status,
          actor_id: actorId || null,
          reason: dto.reason || null,
          visible_to_customer: true,
        },
      });

      // 8. Auditoría
      await (tx as any).auditEvent.create({
        data: {
          tenant_id: tenantId,
          actor_id: actorId || null,
          action: 'ORDER_STATUS_CHANGED',
          entity_name: 'Order',
          entity_id: orderId,
          metadata_json: {
            order_code: order.order_code,
            from_status: order.status,
            to_status: dto.to_status,
            reason: dto.reason || null,
          },
        },
      });

      // 9. Plantilla de retorno opcional hacia WhatsApp
      const customerSnapshot = order.customer_snapshot_json as any;
      const baseUrl = process.env.PUBLIC_APP_URL || 'http://localhost:5173';

      const whatsapp = buildBranchToCustomerStatusWhatsapp({
        customerName: customerSnapshot?.name || 'Cliente',
        customerPhoneE164: customerSnapshot?.phone_e164 || '',
        restaurantName: order.branch?.name || 'Restaurante',
        orderCode: order.order_code,
        status: dto.to_status as OrderStatus,
        publicToken: order.public_token,
        trackingBaseUrl: baseUrl,
      });

      // 10. Emisión de eventos SSE en tiempo real
      const editsCount = order.edits?.length || 0;
      this.sseStream.emitToBranch(tenantId, order.branch_id, 'order.status_changed', {
        order_id: updatedOrder.id,
        order_code: updatedOrder.order_code,
        status: dto.to_status,
        grand_total_cop: updatedOrder.grand_total_cop,
        edits_count: editsCount,
      });

      this.sseStream.emitToTracking(order.public_token, {
        order_id: updatedOrder.id,
        order_code: updatedOrder.order_code,
        status: dto.to_status,
        grand_total_cop: updatedOrder.grand_total_cop,
        customer_snapshot: maskCustomerSnapshot(customerSnapshot),
      });

      return {
        order: updatedOrder,
        whatsapp_status_url: whatsapp.whatsapp_client_url,
        copyable_status_message: whatsapp.copyable_message,
      };
    });
  }
}
