import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { CreateDeliveryZoneDto, UpdateDeliveryZoneDto } from '@restaurante-saas/shared';

@Injectable()
export class DeliveryAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listZones(tenantId: string, branchId: string) {
    return this.prisma.deliveryZone.findMany({
      where: {
        tenant_id: tenantId,
        branch_id: branchId,
      },
      orderBy: {
        created_at: 'asc',
      },
    });
  }

  async getZoneById(tenantId: string, branchId: string, zoneId: string) {
    const zone = await this.prisma.deliveryZone.findFirst({
      where: {
        id: zoneId,
        tenant_id: tenantId,
        branch_id: branchId,
      },
    });

    if (!zone) {
      throw new NotFoundException({
        errorCode: 'DELIVERY_ZONE_NOT_FOUND',
        message: 'Zona de entrega no encontrada.',
      });
    }

    return zone;
  }

  async createZone(
    tenantId: string,
    branchId: string,
    dto: CreateDeliveryZoneDto,
    actorId?: string,
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const zone = await tx.deliveryZone.create({
        data: {
          tenant_id: tenantId,
          branch_id: branchId,
          name: dto.name,
          polygon_or_neighborhoods_json: dto.polygon_or_neighborhoods_json as any,
          delivery_fee_cop: dto.delivery_fee_cop,
          min_order_cop: dto.min_order_cop,
          estimated_minutes_min: dto.estimated_minutes_min,
          estimated_minutes_max: dto.estimated_minutes_max,
          is_active: dto.is_active ?? true,
        },
      });

      await this.auditService.record({
        tenantId,
        branchId,
        actorId,
        action: 'DELIVERY_ZONE_CREATED',
        entityType: 'DELIVERY_ZONE',
        entityId: zone.id,
        metadata: {
          name: zone.name,
          delivery_fee_cop: zone.delivery_fee_cop,
          min_order_cop: zone.min_order_cop,
        },
      });

      return zone;
    });
  }

  async updateZone(
    tenantId: string,
    branchId: string,
    zoneId: string,
    dto: UpdateDeliveryZoneDto,
    actorId?: string,
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.deliveryZone.findFirst({
        where: {
          id: zoneId,
          tenant_id: tenantId,
          branch_id: branchId,
        },
      });

      if (!existing) {
        throw new NotFoundException({
          errorCode: 'DELIVERY_ZONE_NOT_FOUND',
          message: 'Zona de entrega no encontrada.',
        });
      }

      const updated = await tx.deliveryZone.update({
        where: { id: zoneId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.polygon_or_neighborhoods_json !== undefined && {
            polygon_or_neighborhoods_json: dto.polygon_or_neighborhoods_json as any,
          }),
          ...(dto.delivery_fee_cop !== undefined && { delivery_fee_cop: dto.delivery_fee_cop }),
          ...(dto.min_order_cop !== undefined && { min_order_cop: dto.min_order_cop }),
          ...(dto.estimated_minutes_min !== undefined && {
            estimated_minutes_min: dto.estimated_minutes_min,
          }),
          ...(dto.estimated_minutes_max !== undefined && {
            estimated_minutes_max: dto.estimated_minutes_max,
          }),
          ...(dto.is_active !== undefined && { is_active: dto.is_active }),
        },
      });

      await this.auditService.record({
        tenantId,
        branchId,
        actorId,
        action: 'DELIVERY_ZONE_UPDATED',
        entityType: 'DELIVERY_ZONE',
        entityId: zoneId,
        metadata: {
          changes: dto,
        },
      });

      return updated;
    });
  }

  async deleteZone(tenantId: string, branchId: string, zoneId: string, actorId?: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.deliveryZone.findFirst({
        where: {
          id: zoneId,
          tenant_id: tenantId,
          branch_id: branchId,
        },
      });

      if (!existing) {
        throw new NotFoundException({
          errorCode: 'DELIVERY_ZONE_NOT_FOUND',
          message: 'Zona de entrega no encontrada.',
        });
      }

      await tx.deliveryZone.delete({
        where: { id: zoneId },
      });

      await this.auditService.record({
        tenantId,
        branchId,
        actorId,
        action: 'DELIVERY_ZONE_DELETED',
        entityType: 'DELIVERY_ZONE',
        entityId: zoneId,
        metadata: {
          name: existing.name,
        },
      });

      return { success: true, message: `Zona '${existing.name}' eliminada exitosamente.` };
    });
  }
}
