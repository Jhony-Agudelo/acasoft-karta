import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UsePipes,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { QrCodeService } from './qr-code.service';
import { CurrentUser, AuthenticatedUserPayload } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CreateQrCodeLinkSchema, CreateQrCodeLinkDto } from '@restaurante-saas/shared';

@Controller('admin')
export class QrCodeAdminController {
  constructor(private readonly qrCodeService: QrCodeService) {}

  @Get('branches/:branchId/qr-codes')
  @RequirePermissions('branches:read')
  async getBranchQrCodes(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('branchId') branchId: string,
  ) {
    return this.qrCodeService.getBranchQrCodes(user.tenantId, branchId);
  }

  @Post('branches/:branchId/qr-codes')
  @RequirePermissions('branches:manage')
  @UsePipes(new ZodValidationPipe(CreateQrCodeLinkSchema))
  async createQrCode(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('branchId') branchId: string,
    @Body() dto: CreateQrCodeLinkDto,
  ) {
    return this.qrCodeService.createQrCode(user.tenantId, user.id, branchId, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('qr-codes/:qrId/revoke')
  @RequirePermissions('branches:manage')
  async revokeQrCode(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('qrId') qrId: string,
    @Query('replaceWithNew') replaceWithNew?: string,
    @Body('generate_replacement') generateReplacementBody?: boolean,
  ) {
    const replace =
      generateReplacementBody === true ||
      replaceWithNew === 'true' ||
      replaceWithNew === '1';
    return this.qrCodeService.revokeQrCode(user.tenantId, user.id, qrId, replace);
  }
}
