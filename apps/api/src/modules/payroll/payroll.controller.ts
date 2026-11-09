import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UsePipes,
} from '@nestjs/common';
import { CurrentUser, AuthenticatedUserPayload } from '../../common/decorators/current-user.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PayrollService } from './payroll.service';
import {
  CreateEmployeeProfileSchema,
  CreateEmployeeProfileDto,
  UpdateEmployeeProfileSchema,
  UpdateEmployeeProfileDto,
  PayrollLiquidationPreviewSchema,
  PayrollLiquidationPreviewDto,
} from '@restaurante-saas/shared';

@Controller()
@RequireModule('payroll.electronic_dian')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  // ---------------------------------------------------------------------------
  // 1. EMPLEADOS Y PERSONAL (SISTEMA Y NO-SISTEMA)
  // ---------------------------------------------------------------------------

  @Get('admin/branches/:branchId/employees')
  @RequirePermissions('tenancy:manage')
  async listEmployees(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('branchId') branchId: string,
  ) {
    return this.payrollService.listEmployees(user.tenantId, branchId);
  }

  @Post('admin/branches/:branchId/employees')
  @RequirePermissions('tenancy:manage')
  @UsePipes(new ZodValidationPipe(CreateEmployeeProfileSchema))
  async createEmployee(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('branchId') branchId: string,
    @Body() dto: CreateEmployeeProfileDto,
  ) {
    return this.payrollService.createEmployee(user.tenantId, branchId, dto);
  }

  @Patch('admin/branches/:branchId/employees/:id')
  @RequirePermissions('tenancy:manage')
  @UsePipes(new ZodValidationPipe(UpdateEmployeeProfileSchema))
  async updateEmployee(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeProfileDto,
  ) {
    return this.payrollService.updateEmployee(user.tenantId, id, dto);
  }

  // ---------------------------------------------------------------------------
  // 2. LIQUIDACIÓN Y TRANSMISIÓN DE NÓMINA ELECTRÓNICA
  // ---------------------------------------------------------------------------

  @Post('branches/:branchId/payrolls/calculate-preview')
  @RequirePermissions('orders:manage')
  @UsePipes(new ZodValidationPipe(PayrollLiquidationPreviewSchema))
  async calculatePreview(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('branchId') branchId: string,
    @Body() dto: PayrollLiquidationPreviewDto,
  ) {
    return this.payrollService.calculatePreview(user.tenantId, branchId, dto);
  }

  @Post('branches/:branchId/payrolls')
  @RequirePermissions('orders:manage')
  @UsePipes(new ZodValidationPipe(PayrollLiquidationPreviewSchema))
  async settleAndTransmitPayroll(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('branchId') branchId: string,
    @Body() dto: PayrollLiquidationPreviewDto,
  ) {
    return this.payrollService.settleAndTransmitPayroll(
      user.tenantId,
      branchId,
      user.id,
      dto,
    );
  }

  @Get('branches/:branchId/payrolls')
  @RequirePermissions('orders:read')
  async listSettlements(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('branchId') branchId: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.payrollService.listSettlements(
      user.tenantId,
      branchId,
      year ? parseInt(year, 10) : undefined,
      month ? parseInt(month, 10) : undefined,
    );
  }

  @Get('payrolls/:settlementId/pdf')
  @RequirePermissions('orders:read')
  async downloadPdf(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('settlementId') settlementId: string,
  ) {
    return this.payrollService.downloadPayrollPdf(user.tenantId, settlementId);
  }
}

