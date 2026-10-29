import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  CreateKitchenStationDto,
  UpdateKitchenStationDto,
} from '@restaurante-saas/shared';

@Injectable()
export class KitchenStationsService {
  private readonly logger = new Logger(KitchenStationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Obtiene todas las estaciones de cocina activas de una sucursal.
   * Si no existe ninguna, crea automáticamente la estación por defecto 'GENERAL'.
   */
  async listStations(tenantId: string, branchId: string) {
    const stations = await this.prisma.kitchenStation.findMany({
      where: {
        tenant_id: tenantId,
        branch_id: branchId,
      },
      orderBy: {
        sort_order: 'asc',
      },
    });

    if (stations.length === 0) {
      const defaultStation = await this.prisma.kitchenStation.create({
        data: {
          tenant_id: tenantId,
          branch_id: branchId,
          key: 'GENERAL',
          name: 'Cocina General',
          sort_order: 0,
          is_active: true,
        },
      });
      return [defaultStation];
    }

    return stations;
  }

  /**
   * Crea una nueva estación de cocina para la sucursal.
   */
  async createStation(
    tenantId: string,
    branchId: string,
    dto: CreateKitchenStationDto,
  ) {
    const existing = await this.prisma.kitchenStation.findFirst({
      where: {
        tenant_id: tenantId,
        branch_id: branchId,
        key: dto.key,
      },
    });

    if (existing) {
      throw new ConflictException({
        errorCode: 'STATION_KEY_EXISTS',
        message: `Ya existe una estación de cocina con la clave '${dto.key}' en esta sucursal.`,
      });
    }

    return this.prisma.kitchenStation.create({
      data: {
        tenant_id: tenantId,
        branch_id: branchId,
        key: dto.key,
        name: dto.name,
        sort_order: dto.sort_order ?? 0,
        is_active: dto.is_active ?? true,
      },
    });
  }

  /**
   * Actualiza una estación de cocina existente.
   */
  async updateStation(
    tenantId: string,
    branchId: string,
    stationId: string,
    dto: UpdateKitchenStationDto,
  ) {
    const station = await this.prisma.kitchenStation.findFirst({
      where: {
        id: stationId,
        tenant_id: tenantId,
        branch_id: branchId,
      },
    });

    if (!station) {
      throw new NotFoundException({
        errorCode: 'STATION_NOT_FOUND',
        message: 'La estación de cocina especificada no existe.',
      });
    }

    if (dto.key && dto.key !== station.key) {
      const duplicate = await this.prisma.kitchenStation.findFirst({
        where: {
          tenant_id: tenantId,
          branch_id: branchId,
          key: dto.key,
          id: { not: stationId },
        },
      });

      if (duplicate) {
        throw new ConflictException({
          errorCode: 'STATION_KEY_EXISTS',
          message: `Ya existe otra estación con la clave '${dto.key}'.`,
        });
      }
    }

    return this.prisma.kitchenStation.update({
      where: { id: stationId },
      data: {
        ...(dto.key ? { key: dto.key } : {}),
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.sort_order != null ? { sort_order: dto.sort_order } : {}),
        ...(dto.is_active != null ? { is_active: dto.is_active } : {}),
      },
    });
  }
}
