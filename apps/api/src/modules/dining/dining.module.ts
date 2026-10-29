import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrderingModule } from '../ordering/ordering.module';
import { DiningService } from './dining.service';
import { DiningAreaAdminController } from './dining-area-admin.controller';
import { DiningTableAdminController } from './dining-table-admin.controller';
import { DiningController } from './dining.controller';

@Module({
  imports: [AuditModule, NotificationsModule, OrderingModule],
  controllers: [
    DiningAreaAdminController,
    DiningTableAdminController,
    DiningController,
  ],
  providers: [DiningService],
  exports: [DiningService],
})
export class DiningModule {}
