import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class OrderCodeGeneratorService {
  /**
   * Genera de forma atómica y sin colisiones el código de pedido diario (#A101) para la sucursal.
   * Utiliza una secuencia diaria en PostgreSQL reiniciada a 101 cada día calendario local.
   */
  async generateDailyOrderCode(
    tx: Prisma.TransactionClient,
    tenantId: string,
    branchId: string,
    timezone = 'America/Bogota',
  ): Promise<string> {
    // 1. Obtener la fecha calendario local en formato YYYY-MM-DD
    let sequenceDate: string;
    try {
      sequenceDate = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
    } catch {
      sequenceDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
    }

    // 2. Ejecutar inserción atómica con ON CONFLICT DO UPDATE
    const result = await tx.$queryRaw<Array<{ last_value: number }>>`
      INSERT INTO branch_order_sequences (tenant_id, branch_id, sequence_date, last_value)
      VALUES (${tenantId}::uuid, ${branchId}::uuid, ${sequenceDate}, 101)
      ON CONFLICT (tenant_id, branch_id, sequence_date)
      DO UPDATE SET last_value = branch_order_sequences.last_value + 1
      RETURNING last_value;
    `;

    const lastValue = result[0]?.last_value ?? 101;
    return `#A${lastValue}`;
  }
}
