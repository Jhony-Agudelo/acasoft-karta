import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { SseStreamService } from '../notifications/sse-stream.service';
import {
  UpdateKitchenItemStatusDto,
  computeAggregatedOrderKitchenStatus,
  OrderStatus,
} from '@restaurante-saas/shared';

@Injectable()
export class KitchenService {
  private readonly logger = new Logger(KitchenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sseStream: SseStreamService,
  ) {}

  /**
   * Obtiene la cola de comandas de cocina KDS para la sucursal.
   * Regla de negocio crítica: Excluye obligatoriamente cualquier pedido donde
   * require_payment_before_preparation = true y payment_status != 'PAID'.
   */
  async getKitchenOrders(
    tenantId: string,
    branchId: string,
    stationKey?: string,
  ) {
    const orders = await this.prisma.order.findMany({
      where: {
        tenant_id: tenantId,
        branch_id: branchId,
        OR: [
          { status: { in: ['ACCEPTED', 'PREPARING', 'READY'] } },
          { status: 'RECEIVED', origin: 'WEB_DIRECT' },
        ],
        NOT: {
          require_payment_before_preparation: true,
          payment_status: { not: 'PAID' },
        },
      },
      include: {
        items: true,
        customer: true,
        table: {
          include: {
            area: true,
          },
        },
        dining_account: {
          include: {
            table: {
              include: {
                area: true,
              },
            },
            opener: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        status_events: {
          orderBy: { occurred_at: 'asc' },
        },
      },
      orderBy: {
        created_at: 'asc', // FIFO: ordenes más antiguas primero
      },
    });

    const processedByIds = [
      ...new Set(orders.map((o) => o.processed_by).filter((id): id is string => !!id)),
    ];
    const processedByUsers = processedByIds.length > 0
      ? await this.prisma.user.findMany({
          where: { id: { in: processedByIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const usersMap = new Map(processedByUsers.map((u) => [u.id, u]));

    const enrichedOrders = orders.map((order) => {
      const effectiveTable = order.table || order.dining_account?.table;
      const tableLabel = effectiveTable?.code ? `Mesa ${effectiveTable.code}` : null;
      const areaName = effectiveTable?.area?.name || null;
      const waiterUser = order.processed_by ? usersMap.get(order.processed_by) : null;
      const openerUser = order.dining_account?.opener;
      const serverName = waiterUser?.name || openerUser?.name || null;

      return {
        ...order,
        table_label: tableLabel,
        table_code: effectiveTable?.code || null,
        area_name: areaName,
        server_name: serverName,
        opener_name: openerUser?.name || null,
        waiter_name: waiterUser?.name || null,
      };
    });

    if (stationKey) {
      return enrichedOrders
        .map((order) => ({
          ...order,
          items: order.items.filter((item) => item.station_key === stationKey),
        }))
        .filter((order) => order.items.length > 0);
    }

    return enrichedOrders;
  }

  /**
   * Actualiza el estado de preparación de los ítems de una comanda
   * y sincroniza automáticamente el estado de la orden (PREPARING / READY).
   */
  async updateKitchenItemStatus(
    tenantId: string,
    orderId: string,
    actorId: string | undefined,
    dto: UpdateKitchenItemStatusDto,
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      // 1. Obtener la orden existente
      const order = await tx.order.findFirst({
        where: { id: orderId, tenant_id: tenantId },
        include: {
          items: true,
          branch: true,
          table: { include: { area: true } },
          dining_account: {
            include: {
              table: { include: { area: true } },
              opener: { select: { id: true, name: true, email: true } },
            },
          },
        },
      });

      if (!order) {
        throw new NotFoundException({
          errorCode: 'ORDER_NOT_FOUND',
          message: 'La comanda especificada no existe.',
        });
      }

      // 2. Puerta de pre-cobro: no permitir preparar si exige pago y aún no está PAID
      if (
        order.require_payment_before_preparation &&
        order.payment_status !== 'PAID'
      ) {
        throw new ConflictException({
          errorCode: 'PAYMENT_REQUIRED_BEFORE_PREPARATION',
          message:
            'Esta orden exige registrar el pago completo antes de iniciar la preparación en cocina.',
        });
      }

      // 3. Actualizar ítems indicados o todos los ítems de la orden
      if (dto.item_ids && dto.item_ids.length > 0) {
        await tx.orderItem.updateMany({
          where: {
            order_id: order.id,
            tenant_id: tenantId,
            id: { in: dto.item_ids },
          },
          data: {
            status: dto.to_status,
          },
        });
      } else {
        await tx.orderItem.updateMany({
          where: {
            order_id: order.id,
            tenant_id: tenantId,
            status: { not: 'CANCELLED' },
          },
          data: {
            status: dto.to_status,
          },
        });
      }

      // 4. Obtener todos los ítems actualizados
      const allItems = await tx.orderItem.findMany({
        where: { order_id: order.id, tenant_id: tenantId },
        orderBy: { id: 'asc' },
      });

      // 5. Calcular estado de orden agregado mediante función determinista
      const newOrderStatus = computeAggregatedOrderKitchenStatus(
        order.status as OrderStatus,
        allItems,
      );

      let updatedOrder = order;

      // 6. Si el estado general de la orden cambió, actualizar orden y registrar evento
      if (newOrderStatus !== order.status) {
        updatedOrder = await tx.order.update({
          where: { id: order.id },
          data: {
            status: newOrderStatus,
          },
          include: {
            items: true,
            branch: true,
            table: { include: { area: true } },
            dining_account: {
              include: {
                table: { include: { area: true } },
                opener: { select: { id: true, name: true, email: true } },
              },
            },
          },
        });

        await tx.orderStatusEvent.create({
          data: {
            tenant_id: tenantId,
            order_id: order.id,
            from_status: order.status,
            to_status: newOrderStatus,
            actor_id: actorId || null,
            reason: `Actualización automática de KDS a ${newOrderStatus}`,
          },
        });

        // Emitir cambios de estado generales por SSE
        this.sseStream.emitToBranch(tenantId, order.branch_id, 'order.status_changed', {
          orderId: order.id,
          orderCode: order.order_code,
          fromStatus: order.status,
          toStatus: newOrderStatus,
        });

        this.sseStream.emitToTracking(order.public_token, {
          orderId: order.id,
          orderCode: order.order_code,
          status: newOrderStatus,
          paidTotalCop: order.paid_total_cop,
          paymentStatus: order.payment_status,
        });

        if (newOrderStatus === 'READY') {
          const effectiveTable = order.table || order.dining_account?.table;
          const waiterId = order.processed_by || order.dining_account?.opened_by;
          const waiterName = order.dining_account?.opener?.name || null;

          this.sseStream.emitToBranch(tenantId, order.branch_id, 'kitchen.order_ready', {
            orderId: order.id,
            orderCode: order.order_code,
            tableCode: effectiveTable?.code || null,
            tableLabel: effectiveTable?.code ? `Mesa ${effectiveTable.code}` : null,
            areaName: effectiveTable?.area?.name || null,
            waiterId: waiterId || null,
            waiterName: waiterName,
            readyAt: new Date().toISOString(),
            message: `¡Comanda #${order.order_code} lista en cocina para ${effectiveTable?.code ? `Mesa ${effectiveTable.code}` : 'Despacho'}!`,
          });
        }
      }

      // 7. Emitir evento KDS especializado hacia la pantalla de cocina
      this.sseStream.emitToBranch(tenantId, order.branch_id, 'kitchen.order_updated', {
        orderId: order.id,
        orderCode: order.order_code,
        status: newOrderStatus,
        items: allItems,
      });

      return {
        order: updatedOrder,
        items: allItems,
      };
    });
  }
}
