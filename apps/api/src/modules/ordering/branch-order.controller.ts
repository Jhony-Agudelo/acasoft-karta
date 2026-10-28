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

    // 2. Construir filtros
    const where: any = {
      tenant_id: user.tenantId,
      branch_id: branchId,
    };

    if (query.status) {
      where.status = query.status;
    }
    if (query.origin) {
      where.origin = query.origin;
    }
    if (query.fulfillment_type) {
      where.fulfillment_type = query.fulfillment_type;
    }
    if (query.q) {
      where.OR = [
        { order_code: { contains: query.q, mode: 'insensitive' } },
        {
          customer: {
            name: { contains: query.q, mode: 'insensitive' },
          },
        },
      ];
    }

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      (this.prisma as any).order.findMany({
        where,
        include: {
          items: true,
          customer: true,
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
