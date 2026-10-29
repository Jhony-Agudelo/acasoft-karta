import {
  Controller,
  Get,
  Param,
  Query,
  Sse,
  NotFoundException,
  ForbiddenException,
  MessageEvent,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaService } from '../../database/prisma.service';
import { SseStreamService } from '../notifications/sse-stream.service';
import { CurrentUser, AuthenticatedUserPayload } from '../../common/decorators/current-user.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { BranchOrdersQueryDto } from '@restaurante-saas/shared';

@Controller('branches/:branchId/orders')
@RequireModule('order_panel')
export class BranchOrderController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sseStream: SseStreamService,
  ) {}

  /**
   * Lista los pedidos de la sucursal para el panel operativo con filtros y estado de edición.
   * GET /api/v1/branches/:branchId/orders
   */
  @Get()
  async getBranchOrders(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('branchId') branchId: string,
    @Query() query: BranchOrdersQueryDto,
  ) {
    // 1. Validar pertenencia de la sucursal al tenant del usuario
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenant_id: user.tenantId },
    });

    if (!branch) {
      throw new NotFoundException({
        errorCode: 'BRANCH_NOT_FOUND',
        message: 'Sucursal no encontrada.',
      });
    }

    // 2. Construir filtros avanzados
    const where: any = {
      tenant_id: user.tenantId,
      branch_id: branchId,
    };

    if (query.status) {
      where.status = query.status;
    }
    if ((query as any).payment_status) {
      where.payment_status = (query as any).payment_status;
    }
    if (query.origin) {
      where.origin = query.origin;
    }
    if (query.fulfillment_type) {
      where.fulfillment_type = query.fulfillment_type;
    }

    // Filtro por rango de fechas
    if ((query as any).date_from || (query as any).date_to) {
      where.created_at = {};
      if ((query as any).date_from) {
        where.created_at.gte = new Date((query as any).date_from);
      }
      if ((query as any).date_to) {
        where.created_at.lte = new Date((query as any).date_to);
      }
    }

    // Pestañas operativas rápidas
    const tab = (query as any).tab;
    if (tab === 'pending_requests') {
      where.status = 'REQUESTED';
    } else if (tab === 'awaiting_prepayment') {
      where.require_payment_before_preparation = true;
      where.payment_status = { not: 'PAID' };
      where.status = { in: ['ACCEPTED', 'RECEIVED'] };
    } else if (tab === 'in_preparation') {
      where.status = { in: ['ACCEPTED', 'PREPARING'] };
    } else if (tab === 'ready_or_in_transit') {
      where.status = { in: ['READY', 'OUT_FOR_DELIVERY'] };
    } else if (tab === 'uncollected_delivered') {
      where.status = { in: ['DELIVERED', 'PICKED_UP', 'SERVED'] };
      where.payment_status = { in: ['UNPAID', 'PARTIALLY_PAID'] };
    }

    if (query.q) {
      where.OR = [
        { order_code: { contains: query.q, mode: 'insensitive' } },
        {
          customer: {
            name: { contains: query.q, mode: 'insensitive' },
          },
        },
        {
          customer: {
            phone: { contains: query.q, mode: 'insensitive' },
          },
        },
      ];
    }

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const [
      orders,
      total,
      pendingRequestsCount,
      awaitingPrepaymentCount,
      inPreparationCount,
      readyOrInTransitCount,
      uncollectedDeliveredCount,
    ] = await Promise.all([
      (this.prisma as any).order.findMany({
        where,
        include: {
          items: true,
          customer: true,
          payments: {
            select: {
              id: true,
              method: true,
              amount_cop: true,
              cash_received_cop: true,
              change_given_cop: true,
              reference_note: true,
              status: true,
              created_at: true,
              voided_at: true,
              voided_reason: true,
            },
          },
          edits: {
            select: {
              id: true,
              occurred_at: true,
              reason: true,
            },
          },
          status_events: {
            orderBy: { occurred_at: 'asc' },
          },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      (this.prisma as any).order.count({ where }),
      (this.prisma as any).order.count({
        where: { tenant_id: user.tenantId, branch_id: branchId, status: 'REQUESTED' },
      }),
      (this.prisma as any).order.count({
        where: {
          tenant_id: user.tenantId,
          branch_id: branchId,
          require_payment_before_preparation: true,
          payment_status: { not: 'PAID' },
          status: { in: ['ACCEPTED', 'RECEIVED'] },
        },
      }),
      (this.prisma as any).order.count({
        where: {
          tenant_id: user.tenantId,
          branch_id: branchId,
          status: { in: ['ACCEPTED', 'PREPARING'] },
        },
      }),
      (this.prisma as any).order.count({
        where: {
          tenant_id: user.tenantId,
          branch_id: branchId,
          status: { in: ['READY', 'OUT_FOR_DELIVERY'] },
        },
      }),
      (this.prisma as any).order.count({
        where: {
          tenant_id: user.tenantId,
          branch_id: branchId,
          status: { in: ['DELIVERED', 'PICKED_UP', 'SERVED'] },
          payment_status: { in: ['UNPAID', 'PARTIALLY_PAID'] },
        },
      }),
    ]);

    const mappedOrders = orders.map((order: any) => ({
      ...order,
      edits_count: order.edits?.length || 0,
      was_adjusted_by_restaurant: (order.edits?.length || 0) > 0,
    }));

    return {
      data: mappedOrders,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      counters: {
        pending_requests_count: pendingRequestsCount,
        awaiting_prepayment_count: awaitingPrepaymentCount,
        in_preparation_count: inPreparationCount,
        ready_or_in_transit_count: readyOrInTransitCount,
        uncollected_delivered_count: uncollectedDeliveredCount,
      },
    };
  }

  /**
   * Stream reactivo Server-Sent Events (SSE) autenticado para la sucursal.
   * GET /api/v1/branches/:branchId/orders/events
   */
  @Sse('events')
  streamBranchEvents(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('branchId') branchId: string,
  ): Observable<MessageEvent> {
    return this.sseStream.subscribeToBranch(user.tenantId, branchId) as Observable<MessageEvent>;
  }
}
