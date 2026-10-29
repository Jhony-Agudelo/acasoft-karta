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
  ResolveUncollectedOrderDto,
  RevertResolutionDto,
  recalculatePaymentState,
} from '@restaurante-saas/shared';

@Injectable()
export class OrderResolutionService {
  private readonly logger = new Logger(OrderResolutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sseStream: SseStreamService,
  ) {}

  /**
   * Resuelve el saldo no cobrado de una orden como COURTESY o WRITTEN_OFF
   * POST /api/v1/orders/:orderId/resolve-uncollected
   */
  async resolveUncollected(
    tenantId: string,
    orderId: string,
    actorId: string,
    dto: ResolveUncollectedOrderDto,
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      // 1. Bloqueo pesimista con SELECT ... FOR UPDATE
      await tx.$queryRawUnsafe(
        'SELECT id FROM orders WHERE id = $1::uuid AND tenant_id = $2::uuid FOR UPDATE',
        orderId,
        tenantId,
      );

      // 2. Obtener la orden con sus pagos
      const order = await tx.order.findFirst({
        where: { id: orderId, tenant_id: tenantId },
        include: {
          payments: true,
        },
      });

      if (!order) {
        throw new NotFoundException({
          errorCode: 'ORDER_NOT_FOUND',
          message: 'La orden especificada no existe.',
        });
      }

      // 3. Validar que no pertenezca a cuenta de salón
      if (order.dining_account_id !== null) {
        throw new ConflictException({
          errorCode: 'PAY_VIA_DINING_ACCOUNT',
          message: 'Para pedidos de salón, las resoluciones se efectúan sobre la cuenta de mesa.',
        });
      }

      // 4. Validar política de pago
      if (order.payment_policy !== 'OFFLINE_ONLY') {
        throw new ConflictException({
          errorCode: 'PAYMENT_NOT_ALLOWED_FOR_POLICY',
          message: 'La orden está bajo política de pago NONE y no requiere resolución de saldo.',
        });
      }

      // 5. Validar que tenga saldo pendiente por resolver
      if (
        order.payment_status === 'PAID' ||
        order.payment_status === 'COURTESY' ||
        order.payment_status === 'WRITTEN_OFF'
      ) {
        throw new ConflictException({
          errorCode: 'ORDER_RESOLUTION_ACTIVE',
          message: 'La orden ya está saldada o cuenta con una resolución activa.',
        });
      }

      if (order.paid_total_cop >= order.grand_total_cop) {
        throw new ConflictException({
          errorCode: 'ORDER_ALREADY_SETTLED',
          message: 'La orden no presenta saldo pendiente por cobrar.',
        });
      }

      // 6. Validar estado operativo según el tipo de resolución
      if (dto.resolution_type === 'COURTESY') {
        const allowedStatuses = [
          'ACCEPTED',
          'PREPARING',
          'READY',
          'OUT_FOR_DELIVERY',
          'DELIVERED',
          'PICKED_UP',
          'SERVED',
        ];
        if (!allowedStatuses.includes(order.status)) {
          throw new BadRequestException({
            errorCode: 'INVALID_ORDER_STATUS_FOR_RESOLUTION',
            message: `Una cortesía no puede aplicarse a una orden en estado ${order.status}.`,
          });
        }
      } else if (dto.resolution_type === 'WRITTEN_OFF') {
        const allowedStatuses = [
          'READY',
          'OUT_FOR_DELIVERY',
          'DELIVERED',
          'PICKED_UP',
          'SERVED',
        ];
        if (!allowedStatuses.includes(order.status)) {
          throw new BadRequestException({
            errorCode: 'INVALID_ORDER_STATUS_FOR_RESOLUTION',
            message:
              'El castigo de saldo (WRITTEN_OFF) exige que la orden esté al menos en estado READY o entregada.',
          });
        }
      }

      // 7. Recalcular estado financiero
      const approvedPayments = order.payments.filter((p) => p.status === 'APPROVED');
      const recalc = recalculatePaymentState({
        paymentPolicy: 'OFFLINE_ONLY',
        grandTotalCop: order.grand_total_cop,
        approvedPaymentsAmountsCop: approvedPayments.map((p) => p.amount_cop),
        activeResolutionType: dto.resolution_type,
      });

      // 8. Actualizar orden
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          payment_status: recalc.paymentStatus,
          uncollected_amount_cop: recalc.uncollectedAmountCop,
          resolution_type: dto.resolution_type,
          resolution_reason: dto.reason,
          resolved_by: actorId,
          resolved_at: new Date(),
        },
      });

      // 9. Registrar evento de auditoría
      await tx.auditEvent.create({
        data: {
          tenant_id: tenantId,
          branch_id: order.branch_id,
          actor_id: actorId,
          action: 'ORDER_UNCOLLECTED_RESOLVED',
          entity_type: 'Order',
          entity_id: order.id,
          metadata_json: {
            resolution_type: dto.resolution_type,
            reason: dto.reason,
            uncollected_amount_cop: recalc.uncollectedAmountCop,
            paid_total_cop: recalc.paidTotalCop,
          },
        },
      });

      // 10. Emitir SSE
      this.sseStream.emitToBranch(tenantId, order.branch_id, 'order.uncollected_resolved', {
        orderId: order.id,
        orderCode: order.order_code,
        resolutionType: dto.resolution_type,
        uncollectedAmountCop: recalc.uncollectedAmountCop,
        paymentStatus: recalc.paymentStatus,
      });

      this.sseStream.emitToTracking(order.public_token, {
        orderId: order.id,
        orderCode: order.order_code,
        status: order.status,
        paidTotalCop: recalc.paidTotalCop,
        paymentStatus: recalc.paymentStatus,
      });

      return updatedOrder;
    });
  }

  /**
   * Revierte una resolución de saldo previa (COURTESY o WRITTEN_OFF)
   * POST /api/v1/orders/:orderId/revert-resolution
   */
  async revertResolution(
    tenantId: string,
    orderId: string,
    actorId: string,
    dto: RevertResolutionDto,
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      // 1. Bloqueo pesimista con SELECT ... FOR UPDATE
      await tx.$queryRawUnsafe(
        'SELECT id FROM orders WHERE id = $1::uuid AND tenant_id = $2::uuid FOR UPDATE',
        orderId,
        tenantId,
      );

      // 2. Obtener orden con pagos
      const order = await tx.order.findFirst({
        where: { id: orderId, tenant_id: tenantId },
        include: {
          payments: true,
        },
      });

      if (!order) {
        throw new NotFoundException({
          errorCode: 'ORDER_NOT_FOUND',
          message: 'La orden especificada no existe.',
        });
      }

      // 3. Validar que tenga una resolución activa
      if (
        order.payment_status !== 'COURTESY' &&
        order.payment_status !== 'WRITTEN_OFF'
      ) {
        throw new ConflictException({
          errorCode: 'ORDER_HAS_NO_ACTIVE_RESOLUTION',
          message: 'La orden no cuenta con una resolución de saldo activa para revertir.',
        });
      }

      // 4. Recalcular estado financiero sin resolución activa
      const approvedPayments = order.payments.filter((p) => p.status === 'APPROVED');
      const recalc = recalculatePaymentState({
        paymentPolicy: order.payment_policy as any,
        grandTotalCop: order.grand_total_cop,
        approvedPaymentsAmountsCop: approvedPayments.map((p) => p.amount_cop),
        activeResolutionType: null,
      });

      // 5. Actualizar orden limpiando resolución
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          payment_status: recalc.paymentStatus,
          uncollected_amount_cop: 0,
          resolution_type: null,
          resolution_reason: null,
          resolved_by: null,
          resolved_at: null,
        },
      });

      // 6. Registrar en auditoría
      await tx.auditEvent.create({
        data: {
          tenant_id: tenantId,
          branch_id: order.branch_id,
          actor_id: actorId,
          action: 'ORDER_RESOLUTION_REVERTED',
          entity_type: 'Order',
          entity_id: order.id,
          metadata_json: {
            reason: dto.reason,
            restored_payment_status: recalc.paymentStatus,
            paid_total_cop: recalc.paidTotalCop,
          },
        },
      });

      // 7. Emitir SSE
      this.sseStream.emitToBranch(tenantId, order.branch_id, 'order.resolution_reverted', {
        orderId: order.id,
        orderCode: order.order_code,
        paymentStatus: recalc.paymentStatus,
        uncollectedAmountCop: 0,
      });

      this.sseStream.emitToTracking(order.public_token, {
        orderId: order.id,
        orderCode: order.order_code,
        status: order.status,
        paidTotalCop: recalc.paidTotalCop,
        paymentStatus: recalc.paymentStatus,
      });

      return updatedOrder;
    });
  }
}
