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

    // Pestañas operativas rápidas (soporta claves en español e inglés)
    const tab = (query as any).tab;
    if (tab === 'pending_requests' || tab === 'solicitudes' || tab === 'requests') {
      where.status = 'REQUESTED';
    } else if (tab === 'por_cobrar' || tab === 'unpaid') {
      where.payment_status = { in: ['UNPAID', 'PARTIALLY_PAID'] };
      where.status = { notIn: ['CANCELLED', 'REJECTED', 'EXPIRED_UNPROCESSED'] };
    } else if (tab === 'awaiting_prepayment') {
      where.require_payment_before_preparation = true;
      where.payment_status = { not: 'PAID' };
      where.status = { in: ['ACCEPTED', 'RECEIVED'] };
    } else if (tab === 'in_preparation' || tab === 'en_preparacion' || tab === 'preparing') {
      where.status = { in: ['ACCEPTED', 'PREPARING'] };
    } else if (tab === 'ready_or_in_transit' || tab === 'listos' || tab === 'ready') {
      where.status = { in: ['READY', 'OUT_FOR_DELIVERY'] };
    } else if (tab === 'uncollected_delivered') {
      where.status = { in: ['DELIVERED', 'PICKED_UP', 'SERVED'] };
      where.payment_status = { in: ['UNPAID', 'PARTIALLY_PAID'] };
    } else if (tab === 'entregados' || tab === 'delivered') {
      where.status = { in: ['DELIVERED', 'PICKED_UP', 'SERVED'] };
    } else if (tab === 'cancelados' || tab === 'cancelled') {
      where.status = { in: ['CANCELLED', 'REJECTED', 'EXPIRED_UNPROCESSED'] };
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

    // Filtros base para contadores de pestañas dentro del periodo seleccionado
    const countsBaseWhere: any = {
      tenant_id: user.tenantId,
      branch_id: branchId,
    };
    if (where.created_at) {
      countsBaseWhere.created_at = where.created_at;
    }
    if (query.origin) {
      countsBaseWhere.origin = query.origin;
    }
    if (query.fulfillment_type) {
      countsBaseWhere.fulfillment_type = query.fulfillment_type;
    }

    const [
      orders,
      total,
      totalInFilter,
      pendingRequestsCount,
      unpaidCount,
      inPreparationCount,
      readyOrInTransitCount,
      deliveredCount,
      uncollectedDeliveredCount,
      cancelledCount,
    ] = await Promise.all([
      (this.prisma as any).order.findMany({
        where,
        include: {
          items: true,
          customer: true,
          branch: {
            select: {
              id: true,
              name: true,
              phone_whatsapp_e164: true,
              channel_policies: true,
            },
          },
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
      (this.prisma as any).order.count({ where: countsBaseWhere }),
      (this.prisma as any).order.count({
        where: { ...countsBaseWhere, status: 'REQUESTED' },
      }),
      (this.prisma as any).order.count({
        where: {
          ...countsBaseWhere,
          payment_status: { in: ['UNPAID', 'PARTIALLY_PAID'] },
          status: { notIn: ['CANCELLED', 'REJECTED', 'EXPIRED_UNPROCESSED'] },
        },
      }),
      (this.prisma as any).order.count({
        where: {
          ...countsBaseWhere,
          status: { in: ['ACCEPTED', 'PREPARING'] },
        },
      }),
      (this.prisma as any).order.count({
        where: {
          ...countsBaseWhere,
          status: { in: ['READY', 'OUT_FOR_DELIVERY'] },
        },
      }),
      (this.prisma as any).order.count({
        where: {
          ...countsBaseWhere,
          status: { in: ['DELIVERED', 'PICKED_UP', 'SERVED'] },
        },
      }),
      (this.prisma as any).order.count({
        where: {
          ...countsBaseWhere,
          status: { in: ['DELIVERED', 'PICKED_UP', 'SERVED'] },
          payment_status: { in: ['UNPAID', 'PARTIALLY_PAID'] },
        },
      }),
      (this.prisma as any).order.count({
        where: {
          ...countsBaseWhere,
          status: { in: ['CANCELLED', 'REJECTED', 'EXPIRED_UNPROCESSED'] },
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
        tab_counts: {
          solicitudes: pendingRequestsCount,
          por_cobrar: unpaidCount,
          en_preparacion: inPreparationCount,
          listos: readyOrInTransitCount,
          entregados: deliveredCount,
          cancelados: cancelledCount,
          total: totalInFilter,
        },
      },
      counters: {
        pending_requests_count: pendingRequestsCount,
        awaiting_prepayment_count: unpaidCount,
        in_preparation_count: inPreparationCount,
        ready_or_in_transit_count: readyOrInTransitCount,
        uncollected_delivered_count: uncollectedDeliveredCount,
        delivered_count: deliveredCount,
        cancelled_count: cancelledCount,
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
