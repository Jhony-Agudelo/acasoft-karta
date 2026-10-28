import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';

import { pinoLoggerOptions } from './common/logger/logger.config';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './modules/health/health.module';
import { IdentityAccessModule } from './modules/identity-access/identity-access.module';
import { AuditModule } from './modules/audit/audit.module';
import { TenancyModule } from './modules/tenancy/tenancy.module';
import { CapabilitiesModule } from './modules/capabilities/capabilities.module';
import { CatalogModule } from './modules/catalog/catalog.module';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { TenantContextGuard } from './common/guards/tenant-context.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { ModuleCapabilityGuard } from './common/guards/module-capability.guard';
import { UnifiedExceptionFilter } from './common/filters/unified-exception.filter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    LoggerModule.forRoot(pinoLoggerOptions),
    DatabaseModule,
    HealthModule,
    IdentityAccessModule,
    AuditModule,
    TenancyModule,
    CapabilitiesModule,
    CatalogModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: TenantContextGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ModuleCapabilityGuard,
    },
    {
      provide: APP_FILTER,
      useClass: UnifiedExceptionFilter,
    },
  ],
})
export class AppModule {}
