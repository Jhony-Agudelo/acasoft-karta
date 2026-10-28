import { Controller, Post, Body, UsePipes } from '@nestjs/common';
import { CatalogImportService } from './catalog-import.service';
import { CurrentUser, AuthenticatedUserPayload } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BulkProductImportSchema, BulkProductImportDto } from '@restaurante-saas/shared';

@Controller('admin/products')
export class CatalogImportController {
  constructor(private readonly catalogImportService: CatalogImportService) {}

  @Post('import')
  @RequirePermissions('catalog:manage')
  @UsePipes(new ZodValidationPipe(BulkProductImportSchema))
  async importProductsBulk(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: BulkProductImportDto,
  ) {
    return this.catalogImportService.importProductsBulk(user.tenantId, user.id, dto);
  }
}
