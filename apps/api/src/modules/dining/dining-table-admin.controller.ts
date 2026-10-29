import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
  CreateTableSchema,
  UpdateTableSchema,
  CreateTableDto,
  UpdateTableDto,
} from '@restaurante-saas/shared';

@Controller('admin/branches/:branchId/tables')
@UseGuards(JwtAuthGuard, TenantContextGuard, ModuleCapabilityGuard)
@RequireModule('dining')
export class DiningTableAdminController {
  constructor(private readonly diningService: DiningService) {}

  @Post()
  async createTable(
    @Req() req: any,
    @Param('branchId') branchId: string,
    @Body() body: unknown,
  ) {
    const tenantId = req.user.tenantId;
    const dto: CreateTableDto = CreateTableSchema.parse(body);
    return this.diningService.createTable(tenantId, branchId, dto);
  }

  @Get()
  async listTables(@Req() req: any, @Param('branchId') branchId: string) {
    const tenantId = req.user.tenantId;
    return this.diningService.listTablesAdmin(tenantId, branchId);
  }

  @Patch(':tableId')
  async updateTable(
    @Req() req: any,
    @Param('tableId') tableId: string,
    @Body() body: unknown,
  ) {
    const tenantId = req.user.tenantId;
    const dto: UpdateTableDto = UpdateTableSchema.parse(body);
    return this.diningService.updateTable(tenantId, tableId, dto);
  }

  @Delete(':tableId')
  async deleteTable(@Req() req: any, @Param('tableId') tableId: string) {
    const tenantId = req.user.tenantId;
    return this.diningService.deleteTable(tenantId, tableId);
  }
}
