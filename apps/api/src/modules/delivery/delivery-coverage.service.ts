import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { formatMoneyCop } from '@restaurante-saas/shared';

@Injectable()
export class DeliveryCoverageService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Valida que una zona de entrega exista, pertenezca a la sucursal, esté activa y cumpla el pedido mínimo.
   */
  async validateDeliveryRequest(params: {
    tenantId: string;
    branchId: string;
    deliveryZoneId: string;
    subtotalProductsCop: number;
  }) {
    const { tenantId, branchId, deliveryZoneId, subtotalProductsCop } = params;

    const zone = await this.prisma.deliveryZone.findFirst({
      where: {
        id: deliveryZoneId,
        tenant_id: tenantId,
        branch_id: branchId,
      },
    });

    if (!zone) {
      throw new NotFoundException({
        errorCode: 'DELIVERY_ZONE_NOT_FOUND',
        message: 'La zona de entrega seleccionada no existe o no pertenece a esta sucursal.',
      });
    }

    if (!zone.is_active) {
      throw new BadRequestException({
        errorCode: 'DELIVERY_ZONE_INACTIVE',
        message: `La zona de entrega '${zone.name}' no se encuentra activa en este momento.`,
      });
    }

    if (subtotalProductsCop < zone.min_order_cop) {
      throw new BadRequestException({
        errorCode: 'MIN_ORDER_AMOUNT_NOT_MET',
        message: `El pedido mínimo para la zona '${zone.name}' es de ${formatMoneyCop(zone.min_order_cop)}. Subtotal actual: ${formatMoneyCop(subtotalProductsCop)}.`,
        min_order_cop: zone.min_order_cop,
        current_subtotal_cop: subtotalProductsCop,
      });
    }

    return zone;
  }

  /**
   * Obtiene las zonas activas de una sucursal para la vitrina pública.
   */
  async findActiveZonesForBranch(tenantId: string, branchId: string) {
    return this.prisma.deliveryZone.findMany({
      where: {
        tenant_id: tenantId,
        branch_id: branchId,
        is_active: true,
      },
      orderBy: {
        delivery_fee_cop: 'asc',
      },
    });
  }
}
