import { Module } from '@nestjs/common';
import { BillingSubscriptionService } from './billing-subscription.service';
import { AdminSubscriptionController } from './admin-subscription.controller';
import { PlatformSubscriptionController } from './platform-subscription.controller';
import { DatabaseModule } from '../../database/database.module';
import { SubscriptionStatusGuard } from '../../common/guards/subscription-status.guard';

@Module({
  imports: [DatabaseModule],
  controllers: [AdminSubscriptionController, PlatformSubscriptionController],
  providers: [BillingSubscriptionService, SubscriptionStatusGuard],
  exports: [BillingSubscriptionService, SubscriptionStatusGuard],
})
export class BillingSubscriptionModule {}
