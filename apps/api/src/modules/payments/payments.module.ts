import { Module } from '@nestjs/common';
import { ManualPaymentsService } from './manual-payments.service';
import { OrderResolutionService } from './order-resolution.service';
import { OrderPaymentsController } from './order-payments.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [OrderPaymentsController],
  providers: [ManualPaymentsService, OrderResolutionService],
  exports: [ManualPaymentsService, OrderResolutionService],
})
export class PaymentsModule {}
