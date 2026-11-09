import { Module } from '@nestjs/common';
import { FactusCryptoService } from './factus-crypto.service';
import { FactusAuthService } from './factus-auth.service';
import { FactusV2ClientService } from './factus-v2-client.service';
import { PrismaService } from '../../database/prisma.service';

@Module({
  providers: [
    PrismaService,
    FactusCryptoService,
    FactusAuthService,
    FactusV2ClientService,
  ],
  exports: [
    FactusCryptoService,
    FactusAuthService,
    FactusV2ClientService,
  ],
})
export class FactusIntegrationModule {}

