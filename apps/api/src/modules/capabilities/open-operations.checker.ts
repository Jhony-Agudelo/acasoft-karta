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
      try {
        const preparingOrders: any[] = await this.prisma.$queryRaw`
          SELECT id FROM orders 
          WHERE tenant_id = ${tenantId}::uuid 
            AND status = 'PREPARING'
            AND (${branchId}::uuid IS NULL OR branch_id = ${branchId}::uuid)
          LIMIT 1
        `;

        if (preparingOrders && preparingOrders.length > 0) {
          throw new ConflictException({
            errorCode: 'MODULE_HAS_OPEN_OPERATIONS',
            moduleKey: 'kitchen',
            message:
              'No se puede desactivar la pantalla de cocina mientras existan comandas en preparación.',
          });
        }
      } catch (e: any) {
        if (e.response?.errorCode === 'MODULE_HAS_OPEN_OPERATIONS') {
          throw e;
        }
      }
    }

    if (moduleKey === 'payments.manual') {
      try {
        const unpaidOrders: any[] = await this.prisma.$queryRaw`
          SELECT id FROM orders 
          WHERE tenant_id = ${tenantId}::uuid 
            AND payment_status IN ('UNPAID', 'PARTIALLY_PAID')
            AND status NOT IN ('REJECTED', 'CANCELLED', 'EXPIRED_UNPROCESSED')
            AND (${branchId}::uuid IS NULL OR branch_id = ${branchId}::uuid)
          LIMIT 1
        `;

        if (unpaidOrders && unpaidOrders.length > 0) {
          throw new ConflictException({
            errorCode: 'MODULE_HAS_OPEN_OPERATIONS',
            moduleKey: 'payments.manual',
            message:
              'No se puede desactivar el registro de pagos mientras existan pedidos activos con cobro pendiente (UNPAID o PARTIALLY_PAID).',
          });
        }
      } catch (e: any) {
        if (e.response?.errorCode === 'MODULE_HAS_OPEN_OPERATIONS') {
          throw e;
        }
      }
    }
  }
}
