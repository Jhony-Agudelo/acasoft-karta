import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateQrCodeLinkDto } from '@restaurante-saas/shared';
import * as crypto from 'crypto';

@Injectable()
export class QrCodeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private generateSecureQrToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  async getBranchQrCodes(tenantId: string, branchId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      return tx.qrCodeLink.findMany({
        where: {
          tenant_id: tenantId,
          branch_id: branchId,
        },
        orderBy: { created_at: 'desc' },
      });
    });
  }

  async createQrCode(
    tenantId: string,
    actorId: string,
    branchId: string,
    dto: CreateQrCodeLinkDto,
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const branch = await tx.branch.findUnique({
        where: { id: branchId },
      });

      if (!branch || branch.tenant_id !== tenantId) {
        throw new NotFoundException('Sucursal no encontrada.');
      }

      if (dto.target_type === 'DINING_TABLE' && !dto.table_id) {
        throw new BadRequestException('table_id es obligatorio para códigos QR de mesa.');
      }

      const qr_token = this.generateSecureQrToken();

      const qrCode = await tx.qrCodeLink.create({
        data: {
          tenant_id: tenantId,
          branch_id: branchId,
          qr_token,
          target_type: dto.target_type,
          table_id: dto.table_id || null,
          label: dto.label,
          is_active: true,
        },
      });

      await this.auditService.record({
        tenantId,
        branchId,
        actorId,
        action: 'QR_CODE_CREATED',
        entityType: 'QrCodeLink',
        entityId: qrCode.id,
        metadata: {
          target_type: qrCode.target_type,
          label: qrCode.label,
          table_id: qrCode.table_id,
        },
      });

      return qrCode;
    });
  }

  async revokeQrCode(
    tenantId: string,
    actorId: string,
    qrId: string,
    replaceWithNew = false,
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.qrCodeLink.findUnique({
        where: { id: qrId },
      });

      if (!existing || existing.tenant_id !== tenantId) {
        throw new NotFoundException('Código QR no encontrado.');
      }

      const revoked = await tx.qrCodeLink.update({
        where: { id: qrId },
        data: {
          is_active: false,
          revoked_at: new Date(),
        },
      });

      await this.auditService.record({
        tenantId,
        branchId: existing.branch_id,
        actorId,
        action: 'QR_CODE_REVOKED',
        entityType: 'QrCodeLink',
        entityId: qrId,
        metadata: {
          label: existing.label,
          target_type: existing.target_type,
          revoked_at: revoked.revoked_at,
        },
      });

      let replacement = null;
      if (replaceWithNew) {
        const new_token = this.generateSecureQrToken();
        replacement = await tx.qrCodeLink.create({
          data: {
            tenant_id: tenantId,
            branch_id: existing.branch_id,
            qr_token: new_token,
            target_type: existing.target_type,
            table_id: existing.table_id,
            label: `${existing.label} (Regenerado)`,
            is_active: true,
          },
        });

        await this.auditService.record({
          tenantId,
          branchId: existing.branch_id,
          actorId,
          action: 'QR_CODE_REPLACED',
          entityType: 'QrCodeLink',
          entityId: replacement.id,
          metadata: {
            replaced_id: qrId,
            target_type: replacement.target_type,
          },
        });
      }

      return {
        success: true,
        revoked,
        replacement,
      };
    });
  }
}
