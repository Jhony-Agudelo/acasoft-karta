import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard';
import { ModuleCapabilityGuard } from '../../common/guards/module-capability.guard';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { DiningService } from './dining.service';
import {
  CreateDiningAreaSchema,
  UpdateDiningAreaSchema,
  CreateDiningAreaDto,
  UpdateDiningAreaDto,
} from '@restaurante-saas/shared';

@Controller(['admin/branches/:branchId/dining-areas', 'admin/branches/:branchId/areas'])
@UseGuards(JwtAuthGuard, TenantContextGuard, ModuleCapabilityGuard)
@RequireModule('dining')
export class DiningAreaAdminController {
  constructor(private readonly diningService: DiningService) {}

  @Post()
  async createArea(
    @Req() req: any,
    @Param('branchId') branchId: string,
    @Body() body: unknown,
  ) {
    const tenantId = req.user.tenantId;
    const dto: CreateDiningAreaDto = CreateDiningAreaSchema.parse(body);
    return this.diningService.createArea(tenantId, branchId, dto);
  }

  @Get()
  async listAreas(@Req() req: any, @Param('branchId') branchId: string) {
    const tenantId = req.user.tenantId;
    return this.diningService.listAreas(tenantId, branchId);
  }

  @Patch(':areaId')
  async updateArea(
    @Req() req: any,
    @Param('areaId') areaId: string,
    @Body() body: unknown,
  ) {
    const tenantId = req.user.tenantId;
    const dto: UpdateDiningAreaDto = UpdateDiningAreaSchema.parse(body);
    return this.diningService.updateArea(tenantId, areaId, dto);
  }

  @Delete(':areaId')
  async deleteArea(@Req() req: any, @Param('areaId') areaId: string) {
    const tenantId = req.user.tenantId;
    return this.diningService.deleteArea(tenantId, areaId);
  }
}
