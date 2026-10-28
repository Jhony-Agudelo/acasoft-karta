import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { CustomerFilterQuery } from '@restaurante-saas/shared';

@Injectable()
export class CustomerModerationService {
  private readonly fraudPepperSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {
    this.fraudPepperSecret =
      process.env.FRAUD_PEPPER_SECRET || 'karta-default-fraud-pepper-secret-2026';
  }

  /**
   * Calcula la firma HMAC-SHA256 del teléfono para persistir el bloqueo antifraude sin guardar PII en claro.
   */
  computePhoneHmac(tenantId: string, phoneE164: string): string {
    return crypto
      .createHmac('sha256', this.fraudPepperSecret)
      .update(`${tenantId}:${phoneE164}`)
      .digest('hex');
  }

  /**
   * Búsqueda paginada y filtrada de clientes del restaurante.
   */
  async searchCustomers(tenantId: string, query: CustomerFilterQuery) {
    const { q, is_blocked, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: any = { tenant_id: tenantId };

    if (is_blocked !== undefined) {
      where.is_blocked = is_blocked;
    }

    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { phone_e164: { contains: q } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { last_order_at: { sort: 'desc', nulls: 'last' } },
        include: {
          _count: {
            select: { orders: true },
          },
        },
      }),
    ]);

    return {
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
      items: items.map((c) => ({
        id: c.id,
        name: c.name,
        phone_e164: c.phone_e164,
        privacy_consent_at: c.privacy_consent_at,
        is_blocked: c.is_blocked,
        blocked_reason: c.blocked_reason,
        blocked_at: c.blocked_at,
        anonymized_at: c.anonymized_at,
        last_order_at: c.last_order_at,
        created_at: c.created_at,
        orders_count: c._count.orders,
      })),
    };
  }

  /**
   * Bloquea o desbloquea un cliente para prevención de fraude.
   * Si se bloquea, calcula y almacena su HMAC con el secreto de servidor FRAUD_PEPPER_SECRET.
   */
  async setBlockedStatus(
    tenantId: string,
    customerId: string,
    isBlocked: boolean,
    reason?: string | null,
    actorId?: string,
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const customer = await tx.customer.findFirst({
        where: { id: customerId, tenant_id: tenantId },
      });

      if (!customer) {
        throw new NotFoundException({
          errorCode: 'CUSTOMER_NOT_FOUND',
          message: 'Cliente no encontrado.',
        });
      }

      let blockedPhoneHmac: string | null = customer.blocked_phone_hmac;

      if (isBlocked) {
        if (!customer.phone_e164.startsWith('ANON_')) {
          blockedPhoneHmac = this.computePhoneHmac(tenantId, customer.phone_e164);
        }
      } else {
        blockedPhoneHmac = null;
      }

      const updated = await tx.customer.update({
        where: { id: customerId },
        data: {
          is_blocked: isBlocked,
          blocked_reason: isBlocked ? reason || 'Bloqueado por moderación antifraude' : null,
          blocked_at: isBlocked ? new Date() : null,
          blocked_phone_hmac: blockedPhoneHmac,
        },
      });

      // Auditoría sin registrar PII en claro
      await this.auditService.record({
        tenantId,
        actorId,
        action: isBlocked ? 'CUSTOMER_BLOCKED' : 'CUSTOMER_UNBLOCKED',
        entityType: 'CUSTOMER',
        entityId: customerId,
        metadata: {
          customer_id: customerId,
          is_blocked: isBlocked,
          reason: reason || null,
        },
      });

      return {
        id: updated.id,
        is_blocked: updated.is_blocked,
        blocked_reason: updated.blocked_reason,
        blocked_at: updated.blocked_at,
      };
    });
  }

  /**
   * Anonimización verdaderamente irreversible conforme al régimen de Habeas Data colombiano (Ley 1581 de 2012).
   * Genera un UUID v4 puro aleatorio para el teléfono, elimina direcciones y redacta los snapshots en pedidos.
   */
  async anonymizeCustomer(tenantId: string, customerId: string, actorId?: string) {
    // 1. Verificar existencia y ausencia de órdenes activas
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenant_id: tenantId },
    });

    if (!customer) {
      throw new NotFoundException({
        errorCode: 'CUSTOMER_NOT_FOUND',
        message: 'Cliente no encontrado.',
      });
    }

    const activeStatuses = [
      'REQUESTED',
      'RECEIVED',
      'ACCEPTED',
      'PREPARING',
      'READY',
      'OUT_FOR_DELIVERY',
    ];

    const activeOrdersCount = await this.prisma.order.count({
      where: {
        tenant_id: tenantId,
        customer_id: customerId,
        status: { in: activeStatuses },
      },
    });

    if (activeOrdersCount > 0) {
      throw new ConflictException({
        errorCode: 'CUSTOMER_HAS_ACTIVE_ORDERS',
        message: 'No es posible suprimir datos personales de un cliente con pedidos activos en curso.',
      });
    }

    // 2. Transacción de supresión y anonimización
    return this.prisma.withTenant(tenantId, async (tx) => {
      // Si el cliente está bloqueado por fraude, preservar la firma HMAC para mantener el bloqueo
      let phoneHmac = customer.blocked_phone_hmac;
      if (customer.is_blocked && !phoneHmac && !customer.phone_e164.startsWith('ANON_')) {
        phoneHmac = this.computePhoneHmac(tenantId, customer.phone_e164);
      }

      const anonUuid = crypto.randomUUID();
      const anonymizedPhone = `ANON_${anonUuid}`;
      const now = new Date();

      // Actualizar registro de cliente
      await tx.customer.update({
        where: { id: customerId },
        data: {
          name: 'Cliente Anonimizado',
          phone_e164: anonymizedPhone,
          anonymized_at: now,
          blocked_phone_hmac: phoneHmac,
        },
      });

      // Eliminar direcciones vinculadas
      await tx.deliveryAddress.deleteMany({
        where: {
          tenant_id: tenantId,
          customer_id: customerId,
        },
      });

      // Redactar customer_snapshot_json en todas las órdenes históricas sin alterar cifras contables
      const orders = await tx.order.findMany({
        where: {
          tenant_id: tenantId,
          customer_id: customerId,
        },
        select: { id: true, customer_snapshot_json: true },
      });

      for (const order of orders) {
        const origSnapshot = (order.customer_snapshot_json as any) || {};
        const redactedSnapshot = {
          name: 'Anonimizado',
          phone_e164: 'REDACTED',
          delivery_zone_id: null,
          delivery_zone_name: null,
          address_line: 'REDACTED',
          neighborhood: 'REDACTED',
          reference_notes: 'REDACTED',
          privacy_consent_at: origSnapshot.privacy_consent_at || now.toISOString(),
          anonymized_at: now.toISOString(),
        };

        await tx.order.update({
          where: { id: order.id },
          data: {
            customer_snapshot_json: redactedSnapshot as any,
          },
        });
      }

      // Registro en auditoría libre de PII
      await this.auditService.record({
        tenantId,
        actorId,
        action: 'CUSTOMER_PII_ANONYMIZED',
        entityType: 'CUSTOMER',
        entityId: customerId,
        metadata: {
          customer_id: customerId,
        },
      });

      return {
        success: true,
        message: 'Datos personales suprimidos y anonimizados de forma irreversible conforme a la Ley 1581 de 2012.',
        anonymized_at: now.toISOString(),
      };
    });
  }
}
