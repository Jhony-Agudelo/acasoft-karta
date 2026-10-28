import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  Query,
  UsePipes,
} from '@nestjs/common';
import { CapabilitiesService } from './capabilities.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUserPayload } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  BatchUpdateModulesSchema,
  BatchUpdateModulesDto,
} from '@restaurante-saas/shared';

@Controller()
export class CapabilitiesController {
  constructor(private readonly capabilitiesService: CapabilitiesService) {}

  @Public()
  @Get('branches/:branchId/capabilities')
  async getBranchCapabilities(
    @Param('branchId') branchId: string,
    @Query('tenantId') tenantId?: string,
  ) {
    // Si la ruta pública no trae tenantId en query, lo resuelve desde la sucursal
    let resolvedTenantId = tenantId;
    if (!resolvedTenantId) {
      // Buscar tenantId de la sucursal
      const branchRes = await (this.capabilitiesService as any).prisma.branch.findUnique({
        where: { id: branchId },
        select: { tenant_id: true },
      });
      resolvedTenantId = branchRes?.tenant_id;
    }

    return this.capabilitiesService.getBranchCapabilities(resolvedTenantId || '', branchId);
  }

  @Get('admin/capabilities')
  async getAdminCapabilities(@CurrentUser() user: AuthenticatedUserPayload) {
    return this.capabilitiesService.getBranchCapabilities(user.tenantId);
  }

  @Get('admin/branches/:branchId/capabilities')
  async getAdminBranchCapabilities(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('branchId') branchId: string,
  ) {
    return this.capabilitiesService.getBranchCapabilities(user.tenantId, branchId);
  }

  @Get('admin/modules')
  @RequirePermissions('modules:read')
  async getTenantModules(@CurrentUser() user: AuthenticatedUserPayload) {
    return this.capabilitiesService.getTenantModules(user.tenantId);
  }

  @Patch('admin/modules')
  @RequirePermissions('modules:manage')
  @UsePipes(new ZodValidationPipe(BatchUpdateModulesSchema))
  async updateTenantModules(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: BatchUpdateModulesDto,
  ) {
    return this.capabilitiesService.updateTenantModules(user.tenantId, user.id, dto);
  }

  @Get('admin/branches/:branchId/modules')
  @RequirePermissions('modules:read')
  async getBranchModules(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('branchId') branchId: string,
  ) {
    return this.capabilitiesService.getBranchModules(user.tenantId, branchId);
  }

  @Patch('admin/branches/:branchId/modules')
  @RequirePermissions('modules:manage')
  @UsePipes(new ZodValidationPipe(BatchUpdateModulesSchema))
  async updateBranchModules(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('branchId') branchId: string,
    @Body() dto: BatchUpdateModulesDto,
  ) {
    return this.capabilitiesService.updateBranchModules(user.tenantId, user.id, branchId, dto);
  }

  @Get('admin/operating-profiles')
  @RequirePermissions('modules:read')
  async listOperatingProfiles() {
    return this.capabilitiesService.listOperatingProfiles();
  }

  @Post('admin/operating-profiles/:key/apply')
  @RequirePermissions('modules:manage')
  async applyOperatingProfile(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('key') key: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.capabilitiesService.applyOperatingProfile(user.tenantId, user.id, key, branchId);
  }
}
