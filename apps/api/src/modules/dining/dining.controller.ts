import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard';
import { ModuleCapabilityGuard } from '../../common/guards/module-capability.guard';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { DiningService } from './dining.service';
import {
  OpenDiningAccountSchema,
  AddOrderToAccountSchema,
  TransferTableSchema,
  UpdateBillPreviewSchema,
  PutConsumptionDistributionSchema,
  CloseDiningAccountSchema,
  ReopenDiningAccountSchema,
  OpenDiningAccountDto,
  AddOrderToAccountDto,
  TransferTableDto,
  UpdateBillPreviewDto,
  PutConsumptionDistributionDto,
  CloseDiningAccountDto,
  ReopenDiningAccountDto,
} from '@restaurante-saas/shared';

@Controller()
@UseGuards(JwtAuthGuard, TenantContextGuard, ModuleCapabilityGuard)
@RequireModule('dining')
export class DiningController {
  constructor(private readonly diningService: DiningService) {}

  @Get('branches/:branchId/tables')
  async getTablePlan(@Req() req: any, @Param('branchId') branchId: string) {
    const tenantId = req.user.tenantId;
    return this.diningService.getTablePlan(tenantId, branchId);
  }

  @Post('branches/:branchId/accounts')
  async openAccount(
    @Req() req: any,
    @Param('branchId') branchId: string,
    @Body() body: unknown,
  ) {
    const tenantId = req.user.tenantId;
    const actorId = req.user.id || req.user.sub;
    const dto: OpenDiningAccountDto = OpenDiningAccountSchema.parse(body);
    return this.diningService.openAccount(tenantId, branchId, actorId, dto);
  }

  @Get('accounts/:accountId')
  async getAccount(@Req() req: any, @Param('accountId') accountId: string) {
    const tenantId = req.user.tenantId;
    return this.diningService.getAccount(tenantId, accountId);
  }

  @Post('accounts/:accountId/orders')
  async addOrderToAccount(
    @Req() req: any,
    @Param('accountId') accountId: string,
    @Body() body: unknown,
  ) {
    const tenantId = req.user.tenantId;
    const actorId = req.user.id || req.user.sub;
    const dto: AddOrderToAccountDto = AddOrderToAccountSchema.parse(body);
    return this.diningService.addOrderToAccount(tenantId, accountId, actorId, dto, req.user.roleKey);
  }

  @Post('accounts/:accountId/transfer-table')
  async transferTable(
    @Req() req: any,
    @Param('accountId') accountId: string,
    @Body() body: unknown,
  ) {
    const tenantId = req.user.tenantId;
    const actorId = req.user.id || req.user.sub;
    const dto: TransferTableDto = TransferTableSchema.parse(body);
    return this.diningService.transferTable(tenantId, accountId, actorId, dto, req.user.roleKey);
  }

  @Patch('accounts/:accountId/bill-preview')
  async updateBillPreview(
    @Req() req: any,
    @Param('accountId') accountId: string,
    @Body() body: unknown,
  ) {
    const tenantId = req.user.tenantId;
    const actorId = req.user.id || req.user.sub;
    const dto: UpdateBillPreviewDto = UpdateBillPreviewSchema.parse(body);
    return this.diningService.updateBillPreview(tenantId, accountId, actorId, dto, req.user.roleKey);
  }

  @Get('accounts/:accountId/consumption-distribution')
  async getConsumptionDistribution(
    @Req() req: any,
    @Param('accountId') accountId: string,
  ) {
    const tenantId = req.user.tenantId;
    return this.diningService.getConsumptionDistribution(tenantId, accountId);
  }

  @Put('accounts/:accountId/consumption-distribution')
  async putConsumptionDistribution(
    @Req() req: any,
    @Param('accountId') accountId: string,
    @Body() body: unknown,
  ) {
    const tenantId = req.user.tenantId;
    const actorId = req.user.id || req.user.sub;
    const dto: PutConsumptionDistributionDto = PutConsumptionDistributionSchema.parse(body);
    return this.diningService.putConsumptionDistribution(tenantId, accountId, actorId, dto);
  }

  @Post('accounts/:accountId/close')
  async closeAccount(
    @Req() req: any,
    @Param('accountId') accountId: string,
    @Body() body: unknown,
  ) {
    const tenantId = req.user.tenantId;
    const actorId = req.user.id || req.user.sub;
    const actorRoles: string[] = [req.user.roleKey, ...(req.user.roles || []), req.user.role].filter(Boolean);
    const dto: CloseDiningAccountDto = CloseDiningAccountSchema.parse(body);
    return this.diningService.closeAccount(tenantId, accountId, actorId, actorRoles, dto);
  }

  @Post('accounts/:accountId/reopen')
  async reopenAccount(
    @Req() req: any,
    @Param('accountId') accountId: string,
    @Body() body: unknown,
  ) {
    const tenantId = req.user.tenantId;
    const actorId = req.user.id || req.user.sub;
    const actorRoles: string[] = [req.user.roleKey, ...(req.user.roles || []), req.user.role].filter(Boolean);
    const dto: ReopenDiningAccountDto = ReopenDiningAccountSchema.parse(body);
    return this.diningService.reopenAccount(tenantId, accountId, actorId, actorRoles, dto);
  }
}
