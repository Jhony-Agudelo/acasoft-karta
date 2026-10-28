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
import { CustomerModerationService } from './customer-moderation.service';
import { CurrentUser, AuthenticatedUserPayload } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  BlockCustomerDtoSchema,
  BlockCustomerDto,
  CustomerFilterQuerySchema,
  CustomerFilterQuery,
} from '@restaurante-saas/shared';

@Controller('admin/customers')
export class CustomerModerationController {
  constructor(private readonly moderationService: CustomerModerationService) {}

  @Get()
  @RequirePermissions('users:read')
  @UsePipes(new ZodValidationPipe(CustomerFilterQuerySchema))
  async listCustomers(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Query() query: CustomerFilterQuery,
  ) {
    return this.moderationService.searchCustomers(user.tenantId, query);
  }

  @Patch(':customerId/block')
  @RequirePermissions('users:manage')
  @UsePipes(new ZodValidationPipe(BlockCustomerDtoSchema))
  async setBlockedStatus(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('customerId') customerId: string,
    @Body() dto: BlockCustomerDto,
  ) {
    return this.moderationService.setBlockedStatus(
      user.tenantId,
      customerId,
      dto.is_blocked,
      dto.reason,
      user.id,
    );
  }

  @Post(':customerId/anonymize')
  @RequirePermissions('users:manage')
  async anonymizeCustomer(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('customerId') customerId: string,
  ) {
    return this.moderationService.anonymizeCustomer(user.tenantId, customerId, user.id);
  }
}
