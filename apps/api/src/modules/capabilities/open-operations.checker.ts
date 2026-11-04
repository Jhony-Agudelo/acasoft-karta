import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class OpenOperationsChecker {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Verifica que no existan operaciones abiertas o transacciones en curso que
   * impidan la desactivación de un módulo (Sección 4.0 y RNF de consistencia).
   */
  async assertNoOpenOperations(
    tenantId: string,
    branchId: string | null,
    moduleKey: string,
  ): Promise<void> {
    // Si la tabla de comedor o pedidos aún no existe o no tiene registros abiertos
    // realizamos comprobaciones seguras con raw queries protegidas o inspección
    if (moduleKey === 'dining') {
      try {
        const openAccounts: any[] = await this.prisma.$queryRaw`
          SELECT id FROM dining_accounts 
          WHERE tenant_id = ${tenantId}::uuid 
            AND status IN ('OPEN', 'REOPENED_ACCOUNTING')
            AND (${branchId}::uuid IS NULL OR branch_id = ${branchId}::uuid)
          LIMIT 1
        `;

        if (openAccounts && openAccounts.length > 0) {
          throw new ConflictException({
            errorCode: 'MODULE_HAS_OPEN_OPERATIONS',
            moduleKey: 'dining',
            message:
              'No se puede desactivar el módulo de salón mientras existan mesas o cuentas de comensales abiertas o reabiertas.',
          });
        }
      } catch (e: any) {
        if (e.response?.errorCode === 'MODULE_HAS_OPEN_OPERATIONS') {
          throw e;
        }
        // Si la tabla dining_accounts aún no está creada en migraciones tempranas, no bloquea
      }
    }

    if (moduleKey === 'kitchen') {
      const preparingOrder = await this.prisma.order.findFirst({
        where: {
          tenant_id: tenantId,
          status: 'PREPARING',
          ...(branchId ? { branch_id: branchId } : {}),
        },
        select: { id: true, order_code: true },
      });

      if (preparingOrder) {
        throw new ConflictException({
          errorCode: 'MODULE_HAS_OPEN_OPERATIONS',
          moduleKey: 'kitchen',
          message: `No se puede desactivar la pantalla de cocina mientras existan comandas en preparación (ej. ${preparingOrder.order_code}).`,
        });
      }
    }

    if (moduleKey === 'payments.manual') {
      const unpaidOrder = await this.prisma.order.findFirst({
        where: {
          tenant_id: tenantId,
          payment_status: { in: ['UNPAID', 'PARTIALLY_PAID'] },
          status: { notIn: ['REJECTED', 'CANCELLED', 'EXPIRED_UNPROCESSED'] },
          ...(branchId ? { branch_id: branchId } : {}),
        },
        select: { id: true, order_code: true },
      });

      if (unpaidOrder) {
        throw new ConflictException({
          errorCode: 'MODULE_HAS_OPEN_OPERATIONS',
          moduleKey: 'payments.manual',
          message: `No se puede desactivar el registro de pagos mientras existan pedidos activos con cobro pendiente (ej. ${unpaidOrder.order_code}).`,
        });
      }

      const unpaidAccount = await (this.prisma as any).diningAccount.findFirst({
        where: {
          tenant_id: tenantId,
          payment_status: { in: ['UNPAID', 'PARTIALLY_PAID'] },
          status: { in: ['OPEN', 'REOPENED_ACCOUNTING'] },
          ...(branchId ? { branch_id: branchId } : {}),
        },
        select: { id: true, account_code: true },
      });

      if (unpaidAccount) {
        throw new ConflictException({
          errorCode: 'MODULE_HAS_OPEN_OPERATIONS',
          moduleKey: 'payments.manual',
          message: `No se puede desactivar el registro de pagos mientras existan cuentas de salón con cobro pendiente (ej. ${unpaidAccount.account_code}).`,
        });
      }
    }

    if (moduleKey === 'payments.cash_shifts') {
      const openShift = await (this.prisma as any).cashShift.findFirst({
        where: {
          tenant_id: tenantId,
          status: 'OPEN',
          ...(branchId ? { branch_id: branchId } : {}),
        },
        select: { id: true, shift_code: true },
      });

      if (openShift) {
        throw new ConflictException({
          errorCode: 'MODULE_HAS_OPEN_OPERATIONS',
          moduleKey: 'payments.cash_shifts',
          message: `No se puede desactivar el módulo de turnos de caja mientras exista un turno abierto (${openShift.shift_code}). Debe cerrarse primero.`,
        });
      }
    }
  }
}
