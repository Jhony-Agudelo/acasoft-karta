import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UsePipes,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser, AuthenticatedUserPayload } from '../../common/decorators/current-user.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { FinanceService } from './finance.service';
import {
  SupplierInputSchema,
  SupplierInputDto,
  CreateExpenseSchema,
  CreateExpenseDto,
  ExpensePaymentSchema,
  ExpensePaymentDto,
  ProfitAndLossQuerySchema,
  ProfitAndLossQueryDto,
} from '@restaurante-saas/shared';

@Controller()
@RequireModule('finance.expenses_dse')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  // ---------------------------------------------------------------------------
  // 1. PROVEEDORES
  // ---------------------------------------------------------------------------

  @Get('admin/suppliers')
  @RequirePermissions('tenancy:manage')
  async listSuppliers(@CurrentUser() user: AuthenticatedUserPayload) {
    return this.financeService.listSuppliers(user.tenantId);
  }

  @Post('admin/suppliers')
  @RequirePermissions('tenancy:manage')
  @UsePipes(new ZodValidationPipe(SupplierInputSchema))
  async createSupplier(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: SupplierInputDto,
  ) {
    return this.financeService.createSupplier(user.tenantId, dto);
  }

  @Patch('admin/suppliers/:id')
  @RequirePermissions('tenancy:manage')
  async updateSupplier(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Body() dto: Partial<SupplierInputDto>,
  ) {
    return this.financeService.updateSupplier(user.tenantId, id, dto);
  }

  // ---------------------------------------------------------------------------
  // 2. GASTOS Y COMPRAS
  // ---------------------------------------------------------------------------

  @Get('branches/:branchId/expenses')
  @RequirePermissions('orders:read')
  async listExpenses(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('branchId') branchId: string,
    @Query('status') status?: string,
  ) {
    return this.financeService.listExpenses(user.tenantId, branchId, status);
  }

  @Post('branches/:branchId/expenses')
  @RequirePermissions('orders:manage')
  @UsePipes(new ZodValidationPipe(CreateExpenseSchema))
  async createExpense(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('branchId') branchId: string,
    @Body() dto: CreateExpenseDto,
  ) {
    return this.financeService.createExpense(
      user.tenantId,
      branchId,
      user.id,
      dto,
    );
  }

  @Post('expenses/:expenseId/payments')
  @RequirePermissions('orders:manage')
  @UsePipes(new ZodValidationPipe(ExpensePaymentSchema))
  async registerExpensePayment(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('expenseId') expenseId: string,
    @Body() dto: ExpensePaymentDto,
  ) {
    return this.financeService.registerExpensePayment(
      user.tenantId,
      expenseId,
      user.id,
      dto,
    );
  }

  @Post('expenses/:expenseId/support-document')
  @RequirePermissions('orders:manage')
  async emitSupportDocument(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('expenseId') expenseId: string,
  ) {
    return this.financeService.emitSupportDocument(
      user.tenantId,
      expenseId,
      user.id,
    );
  }

  // ---------------------------------------------------------------------------
  // 3. RADIAN / FACTURAS RECIBIDAS
  // ---------------------------------------------------------------------------

  @Get('branches/:branchId/receptions')
  @RequirePermissions('orders:read')
  async listReceivedInvoices(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('branchId') branchId: string,
  ) {
    return this.financeService.listReceivedInvoices(user.tenantId, branchId);
  }

  @Post('branches/:branchId/receptions/upload')
  @RequirePermissions('orders:manage')
  @UseInterceptors(FileInterceptor('file'))
  async uploadReceptionInvoice(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('branchId') branchId: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string },
  ) {
    return this.financeService.uploadReceptionInvoice(
      user.tenantId,
      branchId,
      file.buffer,
      file.originalname,
    );
  }

  @Patch('receptions/:id/radian-events/:eventType')
  @RequirePermissions('orders:manage')
  async emitRadianEvent(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Param('eventType') eventType: string,
  ) {
    return this.financeService.emitRadianEvent(user.tenantId, id, eventType);
  }

  // ---------------------------------------------------------------------------
  // 4. ESTADO DE RESULTADOS OPERATIVO (P&L)
  // ---------------------------------------------------------------------------

  @Get('reports/profit-and-loss')
  @RequirePermissions('orders:read')
  @UsePipes(new ZodValidationPipe(ProfitAndLossQuerySchema))
  async getProfitAndLoss(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Query() query: ProfitAndLossQueryDto,
  ) {
    return this.financeService.getProfitAndLoss(
      user.tenantId,
      query.branch_id,
      query.from,
      query.to,
    );
  }
}
