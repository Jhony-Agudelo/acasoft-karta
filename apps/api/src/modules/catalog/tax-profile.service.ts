import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TaxProfileConfigDto, DIAN_FISCAL_DISCLAIMER_TEXT } from '@restaurante-saas/shared';

@Injectable()
export class TaxProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getTaxProfile(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        tax_profile_mode: true,
        default_tax_type: true,
        default_tax_rate_bp: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('Organización no encontrada.');
    }

    return {
      tax_profile_mode: tenant.tax_profile_mode,
      default_tax_type: tenant.default_tax_type,
      default_tax_rate_bp: tenant.default_tax_rate_bp,
      fiscal_disclaimer: DIAN_FISCAL_DISCLAIMER_TEXT,
    };
  }

  async updateTaxProfile(tenantId: string, actorId: string, dto: TaxProfileConfigDto) {
    const current = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        tax_profile_mode: true,
        default_tax_type: true,
        default_tax_rate_bp: true,
      },
    });

    if (!current) {
      throw new NotFoundException('Organización no encontrada.');
    }

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        tax_profile_mode: dto.tax_profile_mode,
        default_tax_type: dto.default_tax_type,
        default_tax_rate_bp: dto.default_tax_rate_bp,
      },
      select: {
        tax_profile_mode: true,
        default_tax_type: true,
        default_tax_rate_bp: true,
      },
    });

    await this.auditService.record({
      tenantId,
      actorId,
      action: 'TAX_PROFILE_UPDATED',
      entityType: 'Tenant',
      entityId: tenantId,
      metadata: {
        before: current,
        after: updated,
      },
    });

    return {
      ...updated,
      fiscal_disclaimer: DIAN_FISCAL_DISCLAIMER_TEXT,
    };
  }
}
