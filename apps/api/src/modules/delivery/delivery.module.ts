import { Module } from '@nestjs/common';
import { DeliveryCoverageService } from './delivery-coverage.service';
import { DeliveryAdminService } from './delivery-admin.service';
import { DeliveryAdminController } from './delivery-admin.controller';
import { PublicDeliveryController } from './public-delivery.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [DeliveryAdminController, PublicDeliveryController],
  providers: [DeliveryCoverageService, DeliveryAdminService],
  exports: [DeliveryCoverageService, DeliveryAdminService],
})
export class DeliveryModule {}
