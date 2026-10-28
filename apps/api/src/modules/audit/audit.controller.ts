import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { CurrentUser, AuthenticatedUserPayload } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

@Controller('admin/audit-events')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermissions('audit:read')
  async getAuditEvents(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Query('branchId') branchId?: string,
    @Query('entityType') entityType?: string,
    @Query('limit') limitStr?: string,
    @Query('cursor') cursor?: string,
  ) {
    const limit = limitStr ? parseInt(limitStr, 10) : 20;
    return this.auditService.findPaginated({
      tenantId: user.tenantId,
      branchId,
      entityType,
      limit,
      cursor,
    });
  }
}
