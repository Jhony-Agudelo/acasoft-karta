import { Module } from '@nestjs/common';
import { CashShiftsService } from './cash-shifts.service';
import { CashShiftsController } from './cash-shifts.controller';

@Module({
  controllers: [CashShiftsController],
  providers: [CashShiftsService],
  exports: [CashShiftsService],
})
export class CashShiftsModule {}

