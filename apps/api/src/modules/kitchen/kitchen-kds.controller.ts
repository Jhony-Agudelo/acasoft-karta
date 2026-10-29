import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { CurrentUser, AuthenticatedUserPayload } from '../../common/decorators/current-user.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { KitchenService } from './kitchen.service';
import { PrismaService } from '../../database/prisma.service';
import {
  UpdateKitchenItemStatusSchema,
} from '@restaurante-saas/shared';

@Controller('kitchen/orders')
@RequireModule('kitchen')
export class KitchenKdsController {
  constructor(
    private readonly kitchenService: KitchenService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Obtiene la cola activa de comandas KDS para cocina.
   * GET /api/v1/kitchen/orders?branchId=...&stationKey=...
   */
  @Get()
  async getKitchenOrders(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Query('branchId') branchIdQuery?: string,
    @Query('stationKey') stationKey?: string,
  ) {
    const allowedRoles = ['KITCHEN', 'COOK', 'CHEF', 'BRANCH_MANAGER', 'TENANT_ADMIN', 'PLATFORM_ADMIN'];
    if (!allowedRoles.includes(user.roleKey)) {
      throw new ForbiddenException({
        errorCode: 'FORBIDDEN',
        message: 'No posee permisos para acceder a la pantalla de cocina KDS.',
      });
    }

    let branchId = branchIdQuery;

    // Si no se especifica branchId, resolver desde el alcance del usuario o la primera sucursal
    if (!branchId) {
      if (user.branchScope && user.branchScope.length > 0) {
        branchId = user.branchScope[0];
      } else {
        const firstBranch = await this.prisma.branch.findFirst({
          where: { tenant_id: user.tenantId },
          select: { id: true },
        });
        branchId = firstBranch?.id;
      }
    } else {
      // Validar que la sucursal indicada pertenezca al tenant del usuario autenticado
      const branch = await this.prisma.branch.findFirst({
        where: { id: branchId, tenant_id: user.tenantId },
        select: { id: true },
      });
      if (!branch) {
        throw new ForbiddenException({
          errorCode: 'FORBIDDEN',
          message: 'No posee acceso a la sucursal indicada o no pertenece a su restaurante.',
        });
      }
      if (user.branchScope && user.branchScope.length > 0 && !user.branchScope.includes(branchId)) {
        throw new ForbiddenException({
          errorCode: 'BRANCH_SCOPE_FORBIDDEN',
          message: 'Usuario no asignado a esta sucursal.',
        });
      }
    }

    if (!branchId) {
      throw new BadRequestException({
        errorCode: 'BRANCH_REQUIRED',
        message: 'Se requiere indicar la sucursal para consultar la cola de cocina.',
      });
    }

    return this.kitchenService.getKitchenOrders(
      user.tenantId,
      branchId,
      stationKey,
    );
  }

  /**
   * Actualiza el estado de preparación de los ítems de una orden en cocina
   * PATCH /api/v1/kitchen/orders/:orderId/status
   */
  @Patch(':orderId/status')
  async updateKitchenOrderStatus(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('orderId') orderId: string,
    @Body() body: unknown,
  ) {
    const allowedRoles = ['KITCHEN', 'COOK', 'CHEF', 'BRANCH_MANAGER', 'TENANT_ADMIN', 'PLATFORM_ADMIN'];
    if (!allowedRoles.includes(user.roleKey)) {
      throw new ForbiddenException({
        errorCode: 'FORBIDDEN',
        message: 'No posee permisos para actualizar comandas en cocina KDS.',
      });
    }

    const parseResult = UpdateKitchenItemStatusSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException({
        errorCode: 'VALIDATION_ERROR',
        message: 'Error de validación en la actualización del estado de cocina.',
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    return this.kitchenService.updateKitchenItemStatus(
      user.tenantId,
      orderId,
      user.id,
      parseResult.data,
    );
  }
}
