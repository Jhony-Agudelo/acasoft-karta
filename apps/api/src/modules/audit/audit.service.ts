import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface RecordAuditParams {
  tenantId: string;
  branchId?: string | null;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra un evento de auditoría asegurando la exclusión estricta de PII y secretos.
   */
  async record(params: RecordAuditParams) {
    const { tenantId, branchId, actorId, action, entityType, entityId, metadata = {} } = params;

    // Sanitización obligatoria: eliminar claves sensibles
    const sanitizedMetadata = { ...metadata };
    const sensitiveKeys = [
      'password',
      'new_password',
      'current_password',
      'temp_password',
      'token',
      'invite_token',
      'secret',
      'customer_phone',
      'phone_e164',
    ];

    for (const key of sensitiveKeys) {
      if (key in sanitizedMetadata) {
        delete (sanitizedMetadata as Record<string, unknown>)[key];
      }
    }

    return this.prisma.auditEvent.create({
      data: {
        tenant_id: tenantId,
        branch_id: branchId || null,
        actor_id: actorId || null,
        action,
        entity_type: entityType,
        entity_id: entityId,
        metadata_json: sanitizedMetadata as any,
      },
    });
  }

  /**
   * Consulta eventos de auditoría paginados para el tenant.
   */
  async findPaginated(params: {
    tenantId: string;
    branchId?: string;
    entityType?: string;
    limit?: number;
    cursor?: string;
  }) {
    const { tenantId, branchId, entityType, limit = 20, cursor } = params;
    const take = Math.min(Math.max(1, limit), 100);

    const where: any = { tenant_id: tenantId };
    if (branchId) where.branch_id = branchId;
    if (entityType) where.entity_type = entityType;

    const items = await this.prisma.auditEvent.findMany({
      where,
      take: take + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      orderBy: { occurred_at: 'desc' },
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    let nextCursor: string | undefined = undefined;
    if (items.length > take) {
      const nextItem = items.pop();
      nextCursor = nextItem?.id;
    }

    return {
      items,
      nextCursor,
    };
  }
}
