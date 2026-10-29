import { Module } from '@nestjs/common';
import { KitchenStationsService } from './kitchen-stations.service';
import { KitchenService } from './kitchen.service';
import { KitchenStationsController } from './kitchen-stations.controller';
import { KitchenKdsController } from './kitchen-kds.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [KitchenStationsController, KitchenKdsController],
  providers: [KitchenStationsService, KitchenService],
  exports: [KitchenStationsService, KitchenService],
})
export class KitchenModule {}
