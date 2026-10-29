import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UsePipes,
} from '@nestjs/common';
import { TenancyService } from './tenancy.service';
import { CurrentUser, AuthenticatedUserPayload } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  UpdateBrandSettingsSchema,
  UpdateBrandSettingsDto,
  CreateBranchSchema,
  UpdateBranchChannelPolicySchema,
} from '@restaurante-saas/shared';

@Controller('admin')
export class TenancyController {
  constructor(private readonly tenancyService: TenancyService) {}

  @Get('brand')
  @RequirePermissions('tenancy:read')
  async getBrand(@CurrentUser() user: AuthenticatedUserPayload) {
    return this.tenancyService.getBrand(user.tenantId);
  }

  @Patch('brand')
  @RequirePermissions('tenancy:manage')
  @UsePipes(new ZodValidationPipe(UpdateBrandSettingsSchema))
  async updateBrand(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: UpdateBrandSettingsDto,
  ) {
    return this.tenancyService.updateBrand(user.tenantId, user.id, dto);
  }

  @Get('branches')
  @RequirePermissions('tenancy:read')
  async listBranches(@CurrentUser() user: AuthenticatedUserPayload) {
    return this.tenancyService.listBranches(user.tenantId, user);
  }

  @Get('branches/:branchId')
  @RequirePermissions('tenancy:read')
  async getBranch(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('branchId') branchId: string,
  ) {
    return this.tenancyService.getBranch(user.tenantId, branchId);
  }

  @Post('branches')
  @RequirePermissions('tenancy:manage')
  @UsePipes(new ZodValidationPipe(CreateBranchSchema))
  async createBranch(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: any,
  ) {
    return this.tenancyService.createBranch(user.tenantId, user.id, dto);
  }

  @Patch('branches/:branchId')
  @RequirePermissions('tenancy:manage')
  async updateBranch(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('branchId') branchId: string,
    @Body() dto: any,
  ) {
    return this.tenancyService.updateBranch(user.tenantId, user.id, branchId, dto);
  }

  @Get('branches/:branchId/channel-policies')
  @RequirePermissions('channels:read')
  async getChannelPolicies(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('branchId') branchId: string,
  ) {
    return this.tenancyService.getChannelPolicies(user.tenantId, branchId);
  }

  @Patch('branches/:branchId/channel-policies/:fulfillmentType')
  @RequirePermissions('channels:manage')
  @UsePipes(new ZodValidationPipe(UpdateBranchChannelPolicySchema))
  async updateChannelPolicy(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('branchId') branchId: string,
    @Param('fulfillmentType') fulfillmentType: string,
    @Body() dto: any,
  ) {
    return this.tenancyService.updateChannelPolicy(
      user.tenantId,
      user.id,
      branchId,
      fulfillmentType,
      dto,
    );
  }
}
