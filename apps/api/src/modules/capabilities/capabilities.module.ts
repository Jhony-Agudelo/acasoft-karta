import { Module } from '@nestjs/common';
import { CapabilitiesService } from './capabilities.service';
import { CapabilitiesController } from './capabilities.controller';
import { OpenOperationsChecker } from './open-operations.checker';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [CapabilitiesController],
  providers: [CapabilitiesService, OpenOperationsChecker],
  exports: [CapabilitiesService, OpenOperationsChecker],
})
export class CapabilitiesModule {}
