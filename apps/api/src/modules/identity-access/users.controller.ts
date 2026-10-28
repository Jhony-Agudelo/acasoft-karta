import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UsePipes,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CurrentUser, AuthenticatedUserPayload } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CreateStaffUserSchema,
  CreateStaffUserDto,
  UpdateStaffUserSchema,
  UpdateStaffUserDto,
} from '@restaurante-saas/shared';

@Controller('admin/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions('users:read')
  async listStaff(@CurrentUser() user: AuthenticatedUserPayload) {
    return this.usersService.listStaff(user.tenantId);
  }

  @Post()
  @RequirePermissions('users:manage')
  @UsePipes(new ZodValidationPipe(CreateStaffUserSchema))
  async createStaff(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: CreateStaffUserDto,
  ) {
    return this.usersService.createStaff(user.tenantId, user.id, dto);
  }

  @Patch(':userId')
  @RequirePermissions('users:manage')
  @UsePipes(new ZodValidationPipe(UpdateStaffUserSchema))
  async updateStaff(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('userId') userId: string,
    @Body() dto: UpdateStaffUserDto,
  ) {
    return this.usersService.updateStaff(user.tenantId, user.id, userId, dto);
  }

  @Post(':userId/reset-password')
  @RequirePermissions('users:manage')
  async resetPassword(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('userId') userId: string,
  ) {
    return this.usersService.resetStaffPassword(user.tenantId, user.id, userId);
  }
}
