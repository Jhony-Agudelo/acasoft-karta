import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  UsePipes,
  NotFoundException,
} from '@nestjs/common';
import { CurrentUser, AuthenticatedUserPayload } from '../../common/decorators/current-user.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PrismaService } from '../../database/prisma.service';
import { AdjustOrderService } from './adjust-order.service';
import { ProcessOrderService } from './process-order.service';
import { TransitionOrderStatusService } from './transition-order-status.service';
import {
  AdjustOrderItemsSchema,
  AdjustOrderItemsDto,
  TransitionOrderStatusSchema,
  TransitionOrderStatusDto,
} from '@restaurante-saas/shared';

@Controller('orders')
@RequireModule('order_panel')
export class OrderOperationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adjustOrderService: AdjustOrderService,
    private readonly processOrderService: ProcessOrderService,
    private readonly transitionOrderStatusService: TransitionOrderStatusService,
  ) {}

  /**
   * Obtiene la cronología de eventos de estado y el historial de ajustes de una orden.
   * GET /api/v1/orders/:orderId/status-history
   */
  @Get(':orderId/status-history')
  async getOrderStatusHistory(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('orderId') orderId: string,
  ) {
    const order = await (this.prisma as any).order.findFirst({
      where: { id: orderId, tenant_id: user.tenantId },
      include: {
        status_events: {
          orderBy: { occurred_at: 'asc' },
        },
        edits: {
          orderBy: { occurred_at: 'desc' },
        },
        payments: {
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundException({
        errorCode: 'ORDER_NOT_FOUND',
        message: 'Pedido no encontrado.',
      });
    }

    return {
      order_id: order.id,
      order_code: order.order_code,
      current_status: order.status,
      payment_status: order.payment_status,
      paid_total_cop: order.paid_total_cop,
      uncollected_amount_cop: order.uncollected_amount_cop,
      resolution_type: order.resolution_type,
      resolution_reason: order.resolution_reason,
      resolved_at: order.resolved_at,
      is_locked: order.is_locked,
      status_events: order.status_events,
      edits: order.edits,
      payments: order.payments,
    };
  }

  /**
   * Ajusta los productos o la tarifa de domicilio de una orden antes de procesarla.
   * PATCH /api/v1/orders/:orderId/items
   */
  @Patch(':orderId/items')
  @RequirePermissions('orders:adjust')
  @UsePipes(new ZodValidationPipe(AdjustOrderItemsSchema))
  async adjustOrderItems(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('orderId') orderId: string,
    @Body() dto: AdjustOrderItemsDto,
  ) {
    return this.adjustOrderService.adjustOrderItems(
      user.tenantId,
      orderId,
      user.id,
      dto,
    );
  }

  /**
   * Acción de 1 toque: Procesa el pedido (ACCEPTED + is_locked=true + enlaces WhatsApp).
   * POST /api/v1/orders/:orderId/process
   */
  @Post(':orderId/process')
  @RequirePermissions('orders:process')
  async processOrder(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('orderId') orderId: string,
  ) {
    return this.processOrderService.processOrder(user.tenantId, orderId, user.id);
  }

  /**
   * Avanza el pedido en el ciclo de vida según la máquina de estados determinista.
   * PATCH /api/v1/orders/:orderId/status
   */
  @Patch(':orderId/status')
  @UsePipes(new ZodValidationPipe(TransitionOrderStatusSchema))
  async transitionStatus(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('orderId') orderId: string,
    @Body() dto: TransitionOrderStatusDto,
  ) {
    return this.transitionOrderStatusService.transitionStatus(
      user.tenantId,
      orderId,
      user.id,
      dto,
    );
  }
}
