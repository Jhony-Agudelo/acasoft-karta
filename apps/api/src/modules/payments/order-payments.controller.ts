import {
  Controller,
  Post,
  Param,
  Body,
  Headers,
  ForbiddenException,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { CurrentUser, AuthenticatedUserPayload } from '../../common/decorators/current-user.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { ManualPaymentsService } from './manual-payments.service';
import { OrderResolutionService } from './order-resolution.service';
import {
  RecordManualPaymentSchema,
  RecordManualPaymentDto,
  VoidPaymentSchema,
  VoidPaymentDto,
  ResolveUncollectedOrderSchema,
  ResolveUncollectedOrderDto,
  RevertResolutionSchema,
  RevertResolutionDto,
} from '@restaurante-saas/shared';
import * as crypto from 'crypto';

@Controller()
@RequireModule('payments.manual')
export class OrderPaymentsController {
  constructor(
    private readonly manualPaymentsService: ManualPaymentsService,
    private readonly orderResolutionService: OrderResolutionService,
  ) {}

  /**
   * Registra un cobro manual sobre una orden
   * POST /api/v1/orders/:orderId/payments/manual
   */
  @Post('orders/:orderId/payments/manual')
  async recordManualPayment(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('orderId') orderId: string,
    @Headers('idempotency-key') idempotencyKeyHeader: string | undefined,
    @Headers('x-idempotency-key') xIdempotencyKeyHeader: string | undefined,
    @Body() body: unknown,
  ) {
    const allowedRoles = ['CASHIER', 'BRANCH_MANAGER', 'TENANT_ADMIN', 'PLATFORM_ADMIN'];
    if (!allowedRoles.includes(user.roleKey)) {
      throw new ForbiddenException({
        errorCode: 'FORBIDDEN',
        message: 'No posee permisos para registrar cobros manuales.',
      });
    }

    const parseResult = RecordManualPaymentSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException({
        errorCode: 'VALIDATION_ERROR',
        message: 'Error de validación en los datos del pago.',
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    const idempotencyKey = idempotencyKeyHeader || xIdempotencyKeyHeader || `pay-${crypto.randomUUID()}`;

    return this.manualPaymentsService.recordManualPayment(
      user.tenantId,
      orderId,
      user.id,
      idempotencyKey,
      parseResult.data,
    );
  }

  /**
   * Anula un cobro manual previamente aprobado
   * POST /api/v1/payments/:paymentId/void
   */
  @Post('payments/:paymentId/void')
  async voidPayment(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('paymentId') paymentId: string,
    @Body() body: unknown,
  ) {
    const allowedRoles = ['BRANCH_MANAGER', 'TENANT_ADMIN', 'PLATFORM_ADMIN'];
    if (!allowedRoles.includes(user.roleKey)) {
      throw new ForbiddenException({
        errorCode: 'MANAGER_ROLE_REQUIRED',
        message: 'Se requiere rol de gerente o administrador para anular cobros.',
      });
    }

    const parseResult = VoidPaymentSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException({
        errorCode: 'VALIDATION_ERROR',
        message: 'Error de validación en la anulación del pago.',
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    return this.manualPaymentsService.voidPayment(
      user.tenantId,
      paymentId,
      user.id,
      parseResult.data,
    );
  }

  /**
   * Resuelve el saldo pendiente de una orden (COURTESY o WRITTEN_OFF)
   * POST /api/v1/orders/:orderId/resolve-uncollected
   */
  @Post('orders/:orderId/resolve-uncollected')
  async resolveUncollected(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('orderId') orderId: string,
    @Body() body: unknown,
  ) {
    const allowedRoles = ['BRANCH_MANAGER', 'TENANT_ADMIN', 'PLATFORM_ADMIN'];
    if (!allowedRoles.includes(user.roleKey)) {
      throw new ForbiddenException({
        errorCode: 'MANAGER_ROLE_REQUIRED',
        message: 'Se requiere rol de gerente o administrador para resolver saldos no cobrados.',
      });
    }

    const parseResult = ResolveUncollectedOrderSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException({
        errorCode: 'VALIDATION_ERROR',
        message: 'Error de validación en la resolución del saldo.',
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    return this.orderResolutionService.resolveUncollected(
      user.tenantId,
      orderId,
      user.id,
      parseResult.data,
    );
  }

  /**
   * Revierte una resolución de saldo activa
   * POST /api/v1/orders/:orderId/revert-resolution
   */
  @Post('orders/:orderId/revert-resolution')
  async revertResolution(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('orderId') orderId: string,
    @Body() body: unknown,
  ) {
    const allowedRoles = ['BRANCH_MANAGER', 'TENANT_ADMIN', 'PLATFORM_ADMIN'];
    if (!allowedRoles.includes(user.roleKey)) {
      throw new ForbiddenException({
        errorCode: 'MANAGER_ROLE_REQUIRED',
        message: 'Se requiere rol de gerente o administrador para revertir resoluciones de saldo.',
      });
    }

    const parseResult = RevertResolutionSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException({
        errorCode: 'VALIDATION_ERROR',
        message: 'Error de validación en la reversión de resolución.',
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    return this.orderResolutionService.revertResolution(
      user.tenantId,
      orderId,
      user.id,
      parseResult.data,
    );
  }
}
