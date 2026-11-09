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
import { DeliveryModule } from './modules/delivery/delivery.module';
import { OrderingModule } from './modules/ordering/ordering.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { KitchenModule } from './modules/kitchen/kitchen.module';
import { BillingSubscriptionModule } from './modules/billing-subscription/billing-subscription.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { DiningModule } from './modules/dining/dining.module';
import { CashShiftsModule } from './modules/cash-shifts/cash-shifts.module';
import { FactusIntegrationModule } from './modules/factus-integration/factus-integration.module';
import { InvoicingModule } from './modules/invoicing/invoicing.module';
import { FinanceModule } from './modules/finance/finance.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { ScheduleModule } from '@nestjs/schedule';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { TenantContextGuard } from './common/guards/tenant-context.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { ModuleCapabilityGuard } from './common/guards/module-capability.guard';
import { SubscriptionStatusGuard } from './common/guards/subscription-status.guard';
import { UnifiedExceptionFilter } from './common/filters/unified-exception.filter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    LoggerModule.forRoot(pinoLoggerOptions),
    ScheduleModule.forRoot(),
    DatabaseModule,
    HealthModule,
    IdentityAccessModule,
    AuditModule,
    TenancyModule,
    CapabilitiesModule,
    CatalogModule,
    DeliveryModule,
    OrderingModule,
    NotificationsModule,
    PaymentsModule,
    KitchenModule,
    BillingSubscriptionModule,
    ReportingModule,
    DiningModule,
    CashShiftsModule,
    FactusIntegrationModule,
    InvoicingModule,
    FinanceModule,
    PayrollModule,
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
      provide: APP_GUARD,
      useClass: SubscriptionStatusGuard,
    },
    {
      provide: APP_FILTER,
      useClass: UnifiedExceptionFilter,
    },
  ],
})
export class AppModule {}
