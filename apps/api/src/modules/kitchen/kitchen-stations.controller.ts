import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { CurrentUser, AuthenticatedUserPayload } from '../../common/decorators/current-user.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { KitchenStationsService } from './kitchen-stations.service';
import {
  CreateKitchenStationSchema,
  UpdateKitchenStationSchema,
} from '@restaurante-saas/shared';

@Controller('admin/branches/:branchId/kitchen-stations')
@RequireModule('kitchen')
export class KitchenStationsController {
  constructor(private readonly stationsService: KitchenStationsService) {}

  /**
   * Obtiene la lista de estaciones de cocina para la sucursal.
   * GET /api/v1/admin/branches/:branchId/kitchen-stations
   */
  @Get()
  async getBranchStations(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('branchId') branchId: string,
  ) {
    return this.stationsService.listStations(user.tenantId, branchId);
  }

  /**
   * Crea una nueva estación de cocina para la sucursal.
   * POST /api/v1/admin/branches/:branchId/kitchen-stations
   */
  @Post()
  async createStation(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('branchId') branchId: string,
    @Body() body: unknown,
  ) {
    const allowedRoles = ['BRANCH_MANAGER', 'TENANT_ADMIN', 'PLATFORM_ADMIN'];
    if (!allowedRoles.includes(user.roleKey)) {
      throw new ForbiddenException({
        errorCode: 'MANAGER_ROLE_REQUIRED',
        message: 'Se requiere rol de gerente o administrador para crear estaciones de cocina.',
      });
    }

    const parseResult = CreateKitchenStationSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException({
        errorCode: 'VALIDATION_ERROR',
        message: 'Error de validación en la estación de cocina.',
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    return this.stationsService.createStation(
      user.tenantId,
      branchId,
      parseResult.data,
    );
  }

  /**
   * Actualiza una estación de cocina existente.
   * PATCH /api/v1/admin/branches/:branchId/kitchen-stations/:stationId
   */
  @Patch(':stationId')
  async updateStation(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('branchId') branchId: string,
    @Param('stationId') stationId: string,
    @Body() body: unknown,
  ) {
    const allowedRoles = ['BRANCH_MANAGER', 'TENANT_ADMIN', 'PLATFORM_ADMIN'];
    if (!allowedRoles.includes(user.roleKey)) {
      throw new ForbiddenException({
        errorCode: 'MANAGER_ROLE_REQUIRED',
        message: 'Se requiere rol de gerente o administrador para modificar estaciones de cocina.',
      });
    }

    const parseResult = UpdateKitchenStationSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException({
        errorCode: 'VALIDATION_ERROR',
        message: 'Error de validación al actualizar la estación de cocina.',
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    return this.stationsService.updateStation(
      user.tenantId,
      branchId,
      stationId,
      parseResult.data,
    );
  }
}
