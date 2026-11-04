import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UsePipes,
  BadRequestException,
} from '@nestjs/common';
import { CurrentUser, AuthenticatedUserPayload } from '../../common/decorators/current-user.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CashShiftsService } from './cash-shifts.service';
import {
  OpenCashShiftSchema,
  OpenCashShiftDto,
  CreateCashShiftMovementSchema,
  CreateCashShiftMovementDto,
  CloseCashShiftSchema,
  CloseCashShiftDto,
  CashShiftFilterSchema,
} from '@restaurante-saas/shared';

@Controller()
@RequireModule('payments.cash_shifts')
export class CashShiftsController {
  constructor(private readonly cashShiftsService: CashShiftsService) {}

  /**
   * Consulta el turno abierto actual de la sucursal.
   * Si el usuario es CASHIER, los saldos teóricos esperados son enmascarados para garantizar arqueo ciego.
   */
  @Get('branches/:branchId/cash-shifts/current')
  @RequirePermissions('cash_shifts:read')
  async getCurrentShift(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('branchId') branchId: string,
  ) {
    return this.cashShiftsService.getCurrentShift(
      user.tenantId,
      branchId,
      user.roleKey,
    );
  }

  /**
   * Apertura un nuevo turno de caja con base inicial en efectivo.
   */
  @Post('branches/:branchId/cash-shifts/open')
  @RequirePermissions('cash_shifts:manage')
  @UsePipes(new ZodValidationPipe(OpenCashShiftSchema))
  async openShift(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('branchId') branchId: string,
    @Body() dto: OpenCashShiftDto,
  ) {
    return this.cashShiftsService.openShift(
      user.tenantId,
      branchId,
      user.id,
      dto,
    );
  }

  /**
   * Registra una entrada o salida menor de efectivo (CASH_IN / CASH_OUT) en el turno activo.
   */
  @Post(['cash-shifts/:shiftId/movements', 'branches/:branchId/cash-shifts/:shiftId/movements'])
  @RequirePermissions('cash_shifts:manage')
  @UsePipes(new ZodValidationPipe(CreateCashShiftMovementSchema))
  async addMovement(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('shiftId') shiftId: string,
    @Body() dto: CreateCashShiftMovementDto,
  ) {
    return this.cashShiftsService.addMovement(
      user.tenantId,
      shiftId,
      user.id,
      dto,
    );
  }

  /**
   * Realiza el arqueo ciego y cierre definitivo del turno de caja.
   */
  @Post(['cash-shifts/:shiftId/close', 'branches/:branchId/cash-shifts/:shiftId/close'])
  @RequirePermissions('cash_shifts:manage')
  @UsePipes(new ZodValidationPipe(CloseCashShiftSchema))
  async closeShift(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('shiftId') shiftId: string,
    @Body() dto: CloseCashShiftDto,
  ) {
    return this.cashShiftsService.closeShift(
      user.tenantId,
      shiftId,
      user.id,
      dto,
    );
  }

  /**
   * Consulta el historial de turnos cerrados y arqueos para administradores y gerentes.
   */
  @Get('branches/:branchId/cash-shifts')
  @RequirePermissions('cash_shifts:read')
  async listShifts(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('branchId') branchId: string,
    @Query() queryParams: Record<string, string | undefined>,
  ) {
    const parseResult = CashShiftFilterSchema.safeParse(queryParams);
    if (!parseResult.success) {
      throw new BadRequestException({
        errorCode: 'VALIDATION_ERROR',
        message: 'Parámetros de búsqueda o paginación inválidos.',
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    return this.cashShiftsService.listShifts(
      user.tenantId,
      branchId,
      parseResult.data,
      user.roleKey,
    );
  }
}
