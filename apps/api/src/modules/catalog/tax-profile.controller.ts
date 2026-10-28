import { Controller, Get, Patch, Body, UsePipes } from '@nestjs/common';
import { TaxProfileService } from './tax-profile.service';
import { CurrentUser, AuthenticatedUserPayload } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { TaxProfileConfigSchema, TaxProfileConfigDto } from '@restaurante-saas/shared';

@Controller('admin/tax-profile')
export class TaxProfileController {
  constructor(private readonly taxProfileService: TaxProfileService) {}

  @Get()
  @RequirePermissions('brand:read')
  async getTaxProfile(@CurrentUser() user: AuthenticatedUserPayload) {
    return this.taxProfileService.getTaxProfile(user.tenantId);
  }

  @Patch()
  @RequirePermissions('brand:manage')
  @UsePipes(new ZodValidationPipe(TaxProfileConfigSchema))
  async updateTaxProfile(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: TaxProfileConfigDto,
  ) {
    return this.taxProfileService.updateTaxProfile(user.tenantId, user.id, dto);
  }
}
