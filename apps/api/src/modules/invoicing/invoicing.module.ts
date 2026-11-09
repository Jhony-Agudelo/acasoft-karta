import { Module } from '@nestjs/common';
import { InvoicingService } from './invoicing.service';
import { InvoicingController } from './invoicing.controller';
import { FactusIntegrationModule } from '../factus-integration/factus-integration.module';
import { PrismaService } from '../../database/prisma.service';

@Module({
  imports: [FactusIntegrationModule],
  controllers: [InvoicingController],
  providers: [PrismaService, InvoicingService],
  exports: [InvoicingService],
})
export class InvoicingModule {}

