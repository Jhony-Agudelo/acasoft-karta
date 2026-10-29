import {
  Controller,
  Patch,
  Param,
  Body,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { CurrentUser, AuthenticatedUserPayload } from '../../common/decorators/current-user.decorator';
import { BillingSubscriptionService } from './billing-subscription.service';
import { UpdateTenantSubscriptionSchema } from '@restaurante-saas/shared';

@Controller('platform/tenants/:tenantId/subscription')
export class PlatformSubscriptionController {
  constructor(private readonly subscriptionService: BillingSubscriptionService) {}

  /**
   * Actualiza el plan, estado y facturación de suscripción de un tenant.
   * Exclusivo para rol PLATFORM_ADMIN.
   * PATCH /api/v1/platform/tenants/:tenantId/subscription
   */
  @Patch()
  async updateSubscription(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('tenantId') targetTenantId: string,
    @Body() body: unknown,
  ) {
    if (user.roleKey !== 'PLATFORM_ADMIN') {
      throw new ForbiddenException({
        errorCode: 'PLATFORM_ADMIN_REQUIRED',
        message: 'Solo el administrador de la plataforma puede actualizar suscripciones SaaS.',
      });
    }

    const parseResult = UpdateTenantSubscriptionSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException({
        errorCode: 'VALIDATION_ERROR',
        message: 'Error en los datos de actualización de la suscripción.',
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    return this.subscriptionService.updateTenantSubscription(
      user.id,
      targetTenantId,
      parseResult.data,
    );
  }
}
