import { Module } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { FinanceController } from './finance.controller';
import { FactusIntegrationModule } from '../factus-integration/factus-integration.module';
import { PrismaService } from '../../database/prisma.service';

@Module({
  imports: [FactusIntegrationModule],
  controllers: [FinanceController],
  providers: [PrismaService, FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}

