import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class OrderExpirationScheduler {
  private readonly logger = new Logger(OrderExpirationScheduler.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tarea programada para caducar automáticamente pedidos en 'REQUESTED' sin cobro
   * que excedan la ventana de expiración sin haber sido aceptados o procesados.
   * Alineado con TC-03A-I07.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpiredRequests(customExpiryMinutes?: number): Promise<number> {
    const expiryMinutes =
      customExpiryMinutes ??
      parseInt(process.env.ORDER_EXPIRY_MINUTES || '30', 10);

    const thresholdDate = new Date(Date.now() - expiryMinutes * 60 * 1000);

    // Búsqueda respaldada por el índice parcial idx_orders_expiration
    const expiredCandidates = await this.prisma.order.findMany({
      where: {
        status: 'REQUESTED',
        paid_total_cop: 0,
        created_at: {
          lte: thresholdDate,
        },
      },
      select: {
        id: true,
        tenant_id: true,
        order_code: true,
      },
    });

    if (expiredCandidates.length === 0) {
      return 0;
    }

    let expiredCount = 0;

    for (const order of expiredCandidates) {
      try {
        await this.prisma.withTenant(order.tenant_id, async (tx) => {
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: 'EXPIRED_UNPROCESSED',
            },
          });

          await tx.orderStatusEvent.create({
            data: {
              tenant_id: order.tenant_id,
              order_id: order.id,
              from_status: 'REQUESTED',
              to_status: 'EXPIRED_UNPROCESSED',
              reason: 'Caducidad automática por inactividad sin confirmar',
              visible_to_customer: true,
            },
          });
        });

        expiredCount++;
        this.logger.log(`Pedido ${order.order_code} (${order.id}) caducado automáticamente a EXPIRED_UNPROCESSED.`);
      } catch (err: any) {
        this.logger.error(`Error al caducar pedido ${order.id}: ${err?.message}`);
      }
    }

    return expiredCount;
  }
}
