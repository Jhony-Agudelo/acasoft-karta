import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { OrderCodeGeneratorService } from './order-code-generator.service';
import { CreatePublicOrderService } from './create-public-order.service';
import { CustomerModerationService } from './customer-moderation.service';
import { OrderExpirationScheduler } from './order-expiration.scheduler';
import { PublicOrderController } from './public-order.controller';
import { CustomerModerationController } from './customer-moderation.controller';

@Module({
  imports: [AuditModule, DeliveryModule],
  controllers: [PublicOrderController, CustomerModerationController],
  providers: [
    OrderCodeGeneratorService,
    CreatePublicOrderService,
    CustomerModerationService,
    OrderExpirationScheduler,
  ],
  exports: [
    OrderCodeGeneratorService,
    CreatePublicOrderService,
    CustomerModerationService,
    OrderExpirationScheduler,
  ],
})
export class OrderingModule {}
