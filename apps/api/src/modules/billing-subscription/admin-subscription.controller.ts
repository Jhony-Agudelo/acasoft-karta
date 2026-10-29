import { Controller, Get } from '@nestjs/common';
import { CurrentUser, AuthenticatedUserPayload } from '../../common/decorators/current-user.decorator';
import { BillingSubscriptionService } from './billing-subscription.service';

@Controller('admin/subscription')
export class AdminSubscriptionController {
  constructor(private readonly subscriptionService: BillingSubscriptionService) {}

  /**
   * Obtiene la suscripción del tenant autenticado, fechas de periodo y facturas.
   * GET /api/v1/admin/subscription
   */
  @Get()
  async getSubscription(@CurrentUser() user: AuthenticatedUserPayload) {
    return this.subscriptionService.getTenantSubscription(user.tenantId);
  }
}
