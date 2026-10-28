import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuditModule } from '../audit/audit.module';
import { TaxProfileService } from './tax-profile.service';
import { TaxProfileController } from './tax-profile.controller';
import { CatalogAdminService } from './catalog-admin.service';
import { CatalogAdminController } from './catalog-admin.controller';
import { CatalogImportService } from './catalog-import.service';
import { CatalogImportController } from './catalog-import.controller';
import { QrCodeService } from './qr-code.service';
import { QrCodeAdminController } from './qr-code-admin.controller';
import { PublicCatalogService } from './public-catalog.service';
import { PublicCatalogController } from './public-catalog.controller';
import { OpenGraphController } from './opengraph.controller';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [
    TaxProfileController,
    CatalogAdminController,
    CatalogImportController,
    QrCodeAdminController,
    PublicCatalogController,
    OpenGraphController,
  ],
  providers: [
    TaxProfileService,
    CatalogAdminService,
    CatalogImportService,
    QrCodeService,
    PublicCatalogService,
  ],
  exports: [
    TaxProfileService,
    CatalogAdminService,
    CatalogImportService,
    QrCodeService,
    PublicCatalogService,
  ],
})
export class CatalogModule {}
