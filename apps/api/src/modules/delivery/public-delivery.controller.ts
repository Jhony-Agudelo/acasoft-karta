import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { DeliveryCoverageService } from './delivery-coverage.service';
import { PrismaService } from '../../database/prisma.service';

@Controller('public/branches/:branchId/delivery-zones')
export class PublicDeliveryController {
  constructor(
    private readonly deliveryCoverageService: DeliveryCoverageService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get()
  async getActiveZones(@Param('branchId') branchId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, tenant_id: true, status: true },
    });

    if (!branch || branch.status !== 'ACTIVE') {
      throw new NotFoundException({
        errorCode: 'BRANCH_NOT_FOUND',
        message: 'Sucursal no encontrada o inactiva.',
      });
    }

    return this.deliveryCoverageService.findActiveZonesForBranch(branch.tenant_id, branch.id);
  }
}
