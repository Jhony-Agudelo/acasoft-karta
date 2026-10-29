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
  RecordManualPaymentDto,
  VoidPaymentDto,
  recalculatePaymentState,
  calculateCashChange,
} from '@restaurante-saas/shared';

@Injectable()
export class ManualPaymentsService {
  private readonly logger = new Logger(ManualPaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sseStream: SseStreamService,
  ) {}

  /**
   * Registra un pago manual sobre una orden existente con bloqueo transaccional
   * POST /api/v1/orders/:orderId/payments/manual
   */
  async recordManualPayment(
    tenantId: string,
    orderId: string,
    actorId: string,
    idempotencyKey: string,
    dto: RecordManualPaymentDto,
  ) {
    // 1. Verificación de Idempotencia por (tenant_id, idempotency_key)
    const existingPayment = await this.prisma.payment.findFirst({
      where: {
        tenant_id: tenantId,
        idempotency_key: idempotencyKey,
      },
      include: {
        order: true,
      },
    });

    if (existingPayment) {
      this.logger.log(
        `Idempotency hit para pago ${existingPayment.id} con key ${idempotencyKey}`,
      );
      return {
        payment: existingPayment,
        order: existingPayment.order,
        idempotent_replayed: true,
      };
    }

    return this.prisma.withTenant(tenantId, async (tx) => {
      // 2. Bloqueo pesimista de la fila de Order con SELECT ... FOR UPDATE
      await tx.$queryRawUnsafe(
        'SELECT id FROM orders WHERE id = $1::uuid AND tenant_id = $2::uuid FOR UPDATE',
        orderId,
        tenantId,
      );

      // 3. Obtener la orden bloqueada con sus pagos actuales
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

      // 4. Validar que no pertenezca a una cuenta de salón (dining_account_id)
      if (order.dining_account_id !== null) {
        throw new ConflictException({
          errorCode: 'PAY_VIA_DINING_ACCOUNT',
          message: 'Para pedidos de salón, los pagos deben registrarse a través de la cuenta de mesa.',
        });
      }

      // 5. Validar política de pago (debe ser OFFLINE_ONLY, no NONE)
      if (order.payment_policy !== 'OFFLINE_ONLY') {
        throw new ConflictException({
          errorCode: 'PAYMENT_NOT_ALLOWED_FOR_POLICY',
          message: 'La orden está bajo política de pago NONE y no admite registro de cobros.',
        });
      }

      // 6. Prohibición de cobros en REQUESTED
      if (order.status === 'REQUESTED') {
        throw new ConflictException({
          errorCode: 'ORDER_MUST_BE_ACCEPTED_BEFORE_PAYMENT',
          message: 'La orden debe ser aceptada/confirmada antes de registrar pagos.',
        });
      }

      // 7. Prohibición de cobros en órdenes canceladas, rechazadas o expiradas
      if (
        order.status === 'REJECTED' ||
        order.status === 'CANCELLED' ||
        order.status === 'EXPIRED_UNPROCESSED'
      ) {
        throw new ConflictException({
          errorCode: 'ORDER_TERMINATED',
          message: 'No se pueden registrar pagos en una orden cancelada, rechazada o expirada.',
        });
      }

      // 8. Congelamiento financiero si tiene resolución activa
      if (
        order.payment_status === 'COURTESY' ||
        order.payment_status === 'WRITTEN_OFF'
      ) {
        throw new ConflictException({
          errorCode: 'ORDER_RESOLUTION_ACTIVE',
          message: 'La orden tiene una resolución de saldo activa y no admite nuevos pagos hasta ser revertida.',
        });
      }

      // 9. Verificar prevención de sobrecobro
      const approvedPayments = order.payments.filter((p) => p.status === 'APPROVED');
      const currentPaidCop = approvedPayments.reduce((acc, p) => acc + p.amount_cop, 0);

      if (currentPaidCop + dto.amount_cop > order.grand_total_cop) {
        throw new ConflictException({
          errorCode: 'PAYMENT_EXCEEDS_BALANCE',
          message: `El monto ingresado ($${dto.amount_cop}) excede el saldo pendiente ($${
            order.grand_total_cop - currentPaidCop
          }).`,
        });
      }

      // 10. Calcular cambio en efectivo si aplica
      const changeGivenCop =
        dto.method === 'CASH' && dto.cash_received_cop != null
          ? calculateCashChange(dto.amount_cop, dto.cash_received_cop)
          : null;

      // 11. Insertar el registro en la tabla payments
      const payment = await tx.payment.create({
        data: {
          tenant_id: tenantId,
          branch_id: order.branch_id,
          order_id: order.id,
          method: dto.method,
          amount_cop: dto.amount_cop,
          cash_received_cop: dto.cash_received_cop ?? null,
          change_given_cop: changeGivenCop,
          reference_note: dto.reference_note ?? null,
          status: 'APPROVED',
          idempotency_key: idempotencyKey,
          created_by: actorId,
        },
      });

      // 12. Recalcular el estado financiero con la función determinista
      const allApprovedAmounts = [
        ...approvedPayments.map((p) => p.amount_cop),
        dto.amount_cop,
      ];

      const recalc = recalculatePaymentState({
        paymentPolicy: 'OFFLINE_ONLY',
        grandTotalCop: order.grand_total_cop,
        approvedPaymentsAmountsCop: allApprovedAmounts,
        activeResolutionType: null,
      });

      // 13. Actualizar la orden
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          paid_total_cop: recalc.paidTotalCop,
          uncollected_amount_cop: recalc.uncollectedAmountCop,
          payment_status: recalc.paymentStatus,
        },
      });

      // 14. Registrar evento de auditoría
      await tx.auditEvent.create({
        data: {
          tenant_id: tenantId,
          branch_id: order.branch_id,
          actor_id: actorId,
          action: 'PAYMENT_RECORDED',
          entity_type: 'Order',
          entity_id: order.id,
          metadata_json: {
            payment_id: payment.id,
            method: dto.method,
            amount_cop: dto.amount_cop,
            paid_total_cop: recalc.paidTotalCop,
            payment_status: recalc.paymentStatus,
          },
        },
      });

      // 15. Emitir eventos SSE en tiempo real
      this.sseStream.emitToBranch(tenantId, order.branch_id, 'order.payment_recorded', {
        orderId: order.id,
        orderCode: order.order_code,
        paymentId: payment.id,
        amountCop: payment.amount_cop,
        paidTotalCop: recalc.paidTotalCop,
        paymentStatus: recalc.paymentStatus,
      });

      this.sseStream.emitToTracking(order.public_token, {
        orderId: order.id,
        orderCode: order.order_code,
        status: order.status,
        paidTotalCop: recalc.paidTotalCop,
        paymentStatus: recalc.paymentStatus,
      });

      return {
        payment,
        order: updatedOrder,
        idempotent_replayed: false,
      };
    });
  }

  /**
   * Anula un cobro manual previamente aprobado
   * POST /api/v1/payments/:paymentId/void
   */
  async voidPayment(
    tenantId: string,
    paymentId: string,
    actorId: string,
    dto: VoidPaymentDto,
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      // 1. Obtener el pago con su orden asociada
      const payment = await tx.payment.findFirst({
        where: { id: paymentId, tenant_id: tenantId },
        include: {
          order: {
            include: {
              payments: true,
            },
          },
        },
      });

      if (!payment) {
        throw new NotFoundException({
          errorCode: 'PAYMENT_NOT_FOUND',
          message: 'El pago especificado no existe.',
        });
      }

      if (payment.status === 'VOIDED') {
        throw new ConflictException({
          errorCode: 'PAYMENT_ALREADY_VOIDED',
          message: 'Este pago ya se encuentra anulado.',
        });
      }

      if (!payment.order) {
        throw new BadRequestException({
          errorCode: 'PAYMENT_HAS_NO_ORDER',
          message: 'El pago no está asociado a una orden válida.',
        });
      }

      const order = payment.order;

      // 2. Bloqueo de la orden con SELECT ... FOR UPDATE
      await tx.$queryRawUnsafe(
        'SELECT id FROM orders WHERE id = $1::uuid AND tenant_id = $2::uuid FOR UPDATE',
        order.id,
        tenantId,
      );

      // 3. Prohibir anulación si la orden tiene resolución activa
      if (
        order.payment_status === 'COURTESY' ||
        order.payment_status === 'WRITTEN_OFF'
      ) {
        throw new ConflictException({
          errorCode: 'ORDER_RESOLUTION_ACTIVE',
          message: 'No se pueden anular pagos en una orden con resolución de saldo activa.',
        });
      }

      // 4. Marcar pago como VOIDED
      const voidedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'VOIDED',
          voided_by: actorId,
          voided_at: new Date(),
          voided_reason: dto.reason,
        },
      });

      // 5. Recalcular el estado financiero con los pagos APPROVED restantes
      const remainingApproved = order.payments.filter(
        (p) => p.id !== payment.id && p.status === 'APPROVED',
      );
      const remainingAmounts = remainingApproved.map((p) => p.amount_cop);

      const recalc = recalculatePaymentState({
        paymentPolicy: order.payment_policy as any,
        grandTotalCop: order.grand_total_cop,
        approvedPaymentsAmountsCop: remainingAmounts,
        activeResolutionType: null,
      });

      // 6. Actualizar la orden
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          paid_total_cop: recalc.paidTotalCop,
          uncollected_amount_cop: recalc.uncollectedAmountCop,
          payment_status: recalc.paymentStatus,
        },
      });

      // 7. Auditoría
      await tx.auditEvent.create({
        data: {
          tenant_id: tenantId,
          branch_id: order.branch_id,
          actor_id: actorId,
          action: 'PAYMENT_VOIDED',
          entity_type: 'Payment',
          entity_id: payment.id,
          metadata_json: {
            order_id: order.id,
            amount_cop: payment.amount_cop,
            reason: dto.reason,
            new_payment_status: recalc.paymentStatus,
            paid_total_cop: recalc.paidTotalCop,
          },
        },
      });

      // 8. Eventos SSE
      this.sseStream.emitToBranch(tenantId, order.branch_id, 'order.payment_voided', {
        orderId: order.id,
        orderCode: order.order_code,
        paymentId: payment.id,
        paidTotalCop: recalc.paidTotalCop,
        paymentStatus: recalc.paymentStatus,
      });

      this.sseStream.emitToTracking(order.public_token, {
        orderId: order.id,
        orderCode: order.order_code,
        status: order.status,
        paidTotalCop: recalc.paidTotalCop,
        paymentStatus: recalc.paymentStatus,
      });

      return {
        payment: voidedPayment,
        order: updatedOrder,
      };
    });
  }
}
