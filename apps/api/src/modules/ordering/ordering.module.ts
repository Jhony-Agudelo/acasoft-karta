import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { OrderCodeGeneratorService } from './order-code-generator.service';
import { CreatePublicOrderService } from './create-public-order.service';
import { CustomerModerationService } from './customer-moderation.service';
import { OrderExpirationScheduler } from './order-expiration.scheduler';
import { AdjustOrderService } from './adjust-order.service';
import { ProcessOrderService } from './process-order.service';
import { TransitionOrderStatusService } from './transition-order-status.service';
import { PublicOrderController } from './public-order.controller';
import { CustomerModerationController } from './customer-moderation.controller';
import { BranchOrderController } from './branch-order.controller';
import { OrderOperationsController } from './order-operations.controller';

@Module({
  imports: [AuditModule, DeliveryModule],
  controllers: [
    PublicOrderController,
    CustomerModerationController,
    BranchOrderController,
    OrderOperationsController,
  ],
  providers: [
    OrderCodeGeneratorService,
    CreatePublicOrderService,
    CustomerModerationService,
    OrderExpirationScheduler,
    AdjustOrderService,
    ProcessOrderService,
    TransitionOrderStatusService,
  ],
  exports: [
    OrderCodeGeneratorService,
    CreatePublicOrderService,
    CustomerModerationService,
    OrderExpirationScheduler,
    AdjustOrderService,
    ProcessOrderService,
    TransitionOrderStatusService,
  ],
})
export class OrderingModule {}
