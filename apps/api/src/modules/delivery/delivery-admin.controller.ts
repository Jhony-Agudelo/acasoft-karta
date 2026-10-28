import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UsePipes,
} from '@nestjs/common';
import { DeliveryAdminService } from './delivery-admin.service';
import { CurrentUser, AuthenticatedUserPayload } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CreateDeliveryZoneDtoSchema,
  CreateDeliveryZoneDto,
  UpdateDeliveryZoneDtoSchema,
  UpdateDeliveryZoneDto,
} from '@restaurante-saas/shared';

@Controller('admin/branches/:branchId/delivery-zones')
export class DeliveryAdminController {
  constructor(private readonly deliveryAdminService: DeliveryAdminService) {}

  @Get()
  @RequirePermissions('settings:manage')
  async listZones(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('branchId') branchId: string,
  ) {
    return this.deliveryAdminService.listZones(user.tenantId, branchId);
  }

  @Post()
  @RequirePermissions('settings:manage')
  @UsePipes(new ZodValidationPipe(CreateDeliveryZoneDtoSchema))
  async createZone(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('branchId') branchId: string,
    @Body() dto: CreateDeliveryZoneDto,
  ) {
    return this.deliveryAdminService.createZone(user.tenantId, branchId, dto, user.id);
  }

  @Patch(':zoneId')
  @RequirePermissions('settings:manage')
  @UsePipes(new ZodValidationPipe(UpdateDeliveryZoneDtoSchema))
  async updateZone(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('branchId') branchId: string,
    @Param('zoneId') zoneId: string,
    @Body() dto: UpdateDeliveryZoneDto,
  ) {
    return this.deliveryAdminService.updateZone(user.tenantId, branchId, zoneId, dto, user.id);
  }

  @Delete(':zoneId')
  @RequirePermissions('settings:manage')
  async deleteZone(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('branchId') branchId: string,
    @Param('zoneId') zoneId: string,
  ) {
    return this.deliveryAdminService.deleteZone(user.tenantId, branchId, zoneId, user.id);
  }
}
