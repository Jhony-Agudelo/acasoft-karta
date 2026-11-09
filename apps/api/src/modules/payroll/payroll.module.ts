import { Module } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { PayrollController } from './payroll.controller';
import { FactusIntegrationModule } from '../factus-integration/factus-integration.module';
import { PrismaService } from '../../database/prisma.service';

@Module({
  imports: [FactusIntegrationModule],
  controllers: [PayrollController],
  providers: [PrismaService, PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}

