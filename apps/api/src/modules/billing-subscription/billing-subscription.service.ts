import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  UpdateTenantSubscriptionDto,
  PLAN_ENTITLEMENTS,
  SubscriptionStatus,
} from '@restaurante-saas/shared';

@Injectable()
export class BillingSubscriptionService {
  private readonly logger = new Logger(BillingSubscriptionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Obtiene la suscripción del tenant. Si aún no existe, aprovisiona
   * una suscripción por defecto en TRIALING según el plan actual del tenant.
   */
  async getTenantSubscription(tenantId: string) {
    let sub = await this.prisma.subscription.findUnique({
      where: { tenant_id: tenantId },
      include: {
        invoices: {
          orderBy: { issued_at: 'desc' },
          include: {
            recorder: {
              select: { name: true, email: true },
            },
          },
        },
      },
    });

    if (!sub) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { plan_id: true },
      });

      if (!tenant) {
        throw new NotFoundException({
          errorCode: 'TENANT_NOT_FOUND',
          message: 'Restaurante no encontrado.',
        });
      }

      const planId = tenant.plan_id || 'PLAN_STARTER_WHATSAPP';
      const now = new Date();
      const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 días de periodo

      sub = await this.prisma.subscription.create({
        data: {
          tenant_id: tenantId,
          plan_id: planId,
          status: 'TRIALING',
          current_period_start: now,
          current_period_end: periodEnd,
        },
        include: {
          invoices: {
            orderBy: { issued_at: 'desc' },
            include: {
              recorder: {
                select: { name: true, email: true },
              },
            },
          },
        },
      });
    }

    const entitled = PLAN_ENTITLEMENTS[sub.plan_id] || [];

    return {
      id: sub.id,
      tenant_id: sub.tenant_id,
      plan_id: sub.plan_id,
      status: sub.status as SubscriptionStatus,
      current_period_start: sub.current_period_start.toISOString(),
      current_period_end: sub.current_period_end.toISOString(),
      updated_at: sub.updated_at.toISOString(),
      invoices: sub.invoices.map((inv) => ({
        id: inv.id,
        invoice_code: inv.invoice_code,
        plan_id: inv.plan_id,
        amount_cop: inv.amount_cop,
        status: inv.status,
        payment_reference_note: inv.payment_reference_note,
        issued_at: inv.issued_at.toISOString(),
        recorded_by: inv.recorder ? { name: inv.recorder.name, email: inv.recorder.email } : null,
      })),
      entitled_modules: [...entitled],
    };
  }

  /**
   * Actualiza la suscripción de un tenant (exclusivo para PLATFORM_ADMIN).
   * Sincroniza atómicamente Subscription y Tenant.plan_id.
   * Si se envía invoice_amount_cop, genera la factura y audita el evento.
   */
  async updateTenantSubscription(
    platformAdminUserId: string,
    targetTenantId: string,
    dto: UpdateTenantSubscriptionDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Verificar existencia del tenant
      const tenant = await tx.tenant.findUnique({
        where: { id: targetTenantId },
      });

      if (!tenant) {
        throw new NotFoundException({
          errorCode: 'TENANT_NOT_FOUND',
          message: 'El restaurante objetivo no existe.',
        });
      }

      const periodStart = new Date(dto.current_period_start);
      const periodEnd = new Date(dto.current_period_end);

      if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime())) {
        throw new BadRequestException({
          errorCode: 'INVALID_PERIOD_DATES',
          message: 'Las fechas del periodo de suscripción son inválidas.',
        });
      }

      // 2. Upsert de la suscripción
      const sub = await tx.subscription.upsert({
        where: { tenant_id: targetTenantId },
        create: {
          tenant_id: targetTenantId,
          plan_id: dto.plan_id,
          status: dto.status,
          current_period_start: periodStart,
          current_period_end: periodEnd,
          updated_by: platformAdminUserId,
        },
        update: {
          plan_id: dto.plan_id,
          status: dto.status,
          current_period_start: periodStart,
          current_period_end: periodEnd,
          updated_by: platformAdminUserId,
        },
      });

      // 3. Sincronizar el plan en el Tenant
      await tx.tenant.update({
        where: { id: targetTenantId },
        data: { plan_id: dto.plan_id },
      });

      // 4. Si se especifica cobro de factura, registrarla
      let createdInvoice = null;
      if (dto.invoice_amount_cop != null && dto.invoice_amount_cop > 0) {
        const count = await tx.subscriptionInvoice.count({
          where: { tenant_id: targetTenantId },
        });
        const randomHex = Math.random().toString(36).slice(2, 6).toUpperCase();
        const invoiceCode = `INV-${targetTenantId.slice(0, 4).toUpperCase()}-${String(count + 1).padStart(3, '0')}-${randomHex}`;

        createdInvoice = await tx.subscriptionInvoice.create({
          data: {
            tenant_id: targetTenantId,
            subscription_id: sub.id,
            invoice_code: invoiceCode,
            plan_id: dto.plan_id,
            amount_cop: dto.invoice_amount_cop,
            status: 'PAID',
            payment_reference_note: dto.payment_reference_note || null,
            recorded_by: platformAdminUserId,
          },
        });
      }

      // 5. Auditoría inmutable
      await tx.auditEvent.create({
        data: {
          tenant_id: targetTenantId,
          actor_id: platformAdminUserId,
          action: 'TENANT_SUBSCRIPTION_UPDATED',
          entity_type: 'Subscription',
          entity_id: sub.id,
          metadata_json: {
            from_plan_id: tenant.plan_id,
            to_plan_id: dto.plan_id,
            status: dto.status,
            reason: dto.reason,
            invoice_amount_cop: dto.invoice_amount_cop || 0,
            invoice_id: createdInvoice?.id || null,
          },
        },
      });

      return {
        id: sub.id,
        tenant_id: sub.tenant_id,
        plan_id: sub.plan_id,
        status: sub.status as SubscriptionStatus,
        current_period_start: sub.current_period_start.toISOString(),
        current_period_end: sub.current_period_end.toISOString(),
        invoice: createdInvoice,
      };
    });
  }
}
