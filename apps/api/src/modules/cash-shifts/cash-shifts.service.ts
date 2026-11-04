import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  OpenCashShiftDto,
  CreateCashShiftMovementDto,
  CloseCashShiftDto,
  CashShiftFilterDto,
  calculateCashShiftExpectedCash,
  calculateCashShiftDifference,
} from '@restaurante-saas/shared';

@Injectable()
export class CashShiftsService {
  private readonly logger = new Logger(CashShiftsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Consulta el turno actualmente abierto en la sucursal.
   * Si el usuario es CASHIER, se oculta expected_cash_cop y cash_sales_cop para garantizar el arqueo ciego.
   */
  async getCurrentShift(
    tenantId: string,
    branchId: string,
    userRoleKey: string,
  ) {
    const shift = await this.prisma.cashShift.findFirst({
      where: {
        tenant_id: tenantId,
        branch_id: branchId,
        status: 'OPEN',
      },
      include: {
        opener: {
          select: { id: true, name: true, email: true },
        },
        movements: {
          orderBy: { created_at: 'desc' },
          include: {
            creator: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!shift) {
      return null;
    }

    const isCashier = userRoleKey === 'CASHIER';

    // Para administradores y gerentes, calculamos en vivo el saldo teórico esperado actual
    const currentExpectedCash = calculateCashShiftExpectedCash({
      openingCashCop: shift.opening_cash_cop,
      cashSalesCop: shift.cash_sales_cop,
      cashInTotalCop: shift.cash_in_total_cop,
      cashOutTotalCop: shift.cash_out_total_cop,
    });

    return {
      id: shift.id,
      shift_code: shift.shift_code,
      status: shift.status,
      opened_at: shift.opened_at,
      opening_cash_cop: shift.opening_cash_cop,
      opener: shift.opener,
      cash_in_total_cop: shift.cash_in_total_cop,
      cash_out_total_cop: shift.cash_out_total_cop,
      movements_count: shift.movements.length,
      movements: shift.movements,
      // Máscara de arqueo ciego para el cajero
      cash_sales_cop: isCashier ? null : shift.cash_sales_cop,
      expected_cash_cop: isCashier ? null : currentExpectedCash,
      is_blind_mode: isCashier,
    };
  }

  /**
   * Abre un nuevo turno de caja en la sucursal con su base inicial de efectivo.
   */
  async openShift(
    tenantId: string,
    branchId: string,
    actorId: string,
    dto: OpenCashShiftDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Verificar si ya existe un turno abierto en la sucursal
      const existingOpen = await tx.cashShift.findFirst({
        where: {
          tenant_id: tenantId,
          branch_id: branchId,
          status: 'OPEN',
        },
      });

      if (existingOpen) {
        throw new ConflictException({
          errorCode: 'CASH_SHIFT_ALREADY_OPEN',
          message: `Ya existe un turno de caja abierto en esta sucursal (${existingOpen.shift_code}). Debe cerrarse antes de abrir uno nuevo.`,
          current_shift_id: existingOpen.id,
          shift_code: existingOpen.shift_code,
        });
      }

      // 2. Generar código secuencial (#T-001, #T-002, ...)
      const shiftCount = await tx.cashShift.count({
        where: {
          tenant_id: tenantId,
          branch_id: branchId,
        },
      });
      const shiftCode = `#T-${String(shiftCount + 1).padStart(3, '0')}`;

      // 3. Crear el turno
      const shift = await tx.cashShift.create({
        data: {
          tenant_id: tenantId,
          branch_id: branchId,
          shift_code: shiftCode,
          status: 'OPEN',
          opening_cash_cop: dto.opening_cash_cop,
          opened_by: actorId,
          opened_at: new Date(),
          closing_notes: dto.notes || null,
        },
        include: {
          opener: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      // 4. Registrar auditoría
      await tx.auditEvent.create({
        data: {
          tenant_id: tenantId,
          branch_id: branchId,
          actor_id: actorId,
          action: 'CASH_SHIFT_OPENED',
          entity_type: 'CashShift',
          entity_id: shift.id,
          metadata_json: {
            shift_code: shiftCode,
            opening_cash_cop: dto.opening_cash_cop,
          },
        },
      });

      this.logger.log(
        `Turno de caja ${shiftCode} abierto exitosamente con base de $${dto.opening_cash_cop} COP por usuario ${actorId}`,
      );

      return shift;
    });
  }

  /**
   * Registra un movimiento menor en el turno (CASH_IN para sencillo, CASH_OUT para pago a proveedores o gastos de caja).
   */
  async addMovement(
    tenantId: string,
    shiftId: string,
    actorId: string,
    dto: CreateCashShiftMovementDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Obtener y bloquear el turno
      const shift = await tx.cashShift.findFirst({
        where: {
          id: shiftId,
          tenant_id: tenantId,
        },
      });

      if (!shift) {
        throw new NotFoundException({
          errorCode: 'CASH_SHIFT_NOT_FOUND',
          message: 'El turno de caja especificado no existe.',
        });
      }

      if (shift.status !== 'OPEN') {
        throw new ConflictException({
          errorCode: 'CASH_SHIFT_NOT_OPEN',
          message: 'Solo se pueden registrar movimientos en un turno de caja abierto.',
        });
      }

      // 2. Crear el movimiento
      const movement = await tx.cashShiftMovement.create({
        data: {
          tenant_id: tenantId,
          branch_id: shift.branch_id,
          shift_id: shift.id,
          type: dto.type,
          category: dto.category,
          amount_cop: dto.amount_cop,
          reason: dto.reason.trim(),
          reference_doc: dto.reference_doc?.trim() || null,
          created_by: actorId,
        },
        include: {
          creator: {
            select: { id: true, name: true },
          },
        },
      });

      // 3. Actualizar los acumuladores del turno
      const isCashIn = dto.type === 'CASH_IN';
      const updatedShift = await tx.cashShift.update({
        where: { id: shift.id },
        data: {
          cash_in_total_cop: isCashIn
            ? { increment: dto.amount_cop }
            : undefined,
          cash_out_total_cop: !isCashIn
            ? { increment: dto.amount_cop }
            : undefined,
        },
      });

      // 4. Registrar auditoría
      await tx.auditEvent.create({
        data: {
          tenant_id: tenantId,
          branch_id: shift.branch_id,
          actor_id: actorId,
          action: isCashIn ? 'CASH_SHIFT_CASH_IN' : 'CASH_SHIFT_CASH_OUT',
          entity_type: 'CashShiftMovement',
          entity_id: movement.id,
          metadata_json: {
            shift_id: shift.id,
            shift_code: shift.shift_code,
            type: dto.type,
            category: dto.category,
            amount_cop: dto.amount_cop,
            reason: dto.reason,
          },
        },
      });

      return {
        movement,
        shift_summary: {
          cash_in_total_cop: updatedShift.cash_in_total_cop,
          cash_out_total_cop: updatedShift.cash_out_total_cop,
        },
      };
    });
  }

  /**
   * Ejecuta el cierre ciego del turno de caja (BLIND_CLOSE).
   * El cajero declara el efectivo físico contado (declared_cash_cop);
   * el backend calcula de forma determinista expected_cash_cop y difference_cop,
   * congela los datos y pasa el turno a CLOSED.
   */
  async closeShift(
    tenantId: string,
    shiftId: string,
    actorId: string,
    dto: CloseCashShiftDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Obtener y bloquear el turno
      const shift = await tx.cashShift.findFirst({
        where: {
          id: shiftId,
          tenant_id: tenantId,
        },
        include: {
          movements: true,
        },
      });

      if (!shift) {
        throw new NotFoundException({
          errorCode: 'CASH_SHIFT_NOT_FOUND',
          message: 'El turno de caja especificado no existe.',
        });
      }

      if (shift.status !== 'OPEN') {
        throw new ConflictException({
          errorCode: 'CASH_SHIFT_ALREADY_CLOSED',
          message: 'Este turno de caja ya se encuentra cerrado.',
        });
      }

      // 2. Sumar todos los pagos en efectivo APROBADOS asociados a este turno
      const cashPayments = await tx.payment.findMany({
        where: {
          tenant_id: tenantId,
          cash_shift_id: shift.id,
          method: 'CASH',
          status: 'APPROVED',
        },
        select: { amount_cop: true },
      });

      const actualCashSales = cashPayments.reduce(
        (sum, p) => sum + p.amount_cop,
        0,
      );

      // 3. Calcular saldo esperado determinista
      const expectedCashCop = calculateCashShiftExpectedCash({
        openingCashCop: shift.opening_cash_cop,
        cashSalesCop: actualCashSales,
        cashInTotalCop: shift.cash_in_total_cop,
        cashOutTotalCop: shift.cash_out_total_cop,
      });

      // 4. Calcular diferencia de arqueo
      const differenceCop = calculateCashShiftDifference(
        dto.declared_cash_cop,
        expectedCashCop,
      );

      // 5. Congelar y cerrar el turno
      const closedShift = await tx.cashShift.update({
        where: { id: shift.id },
        data: {
          status: 'CLOSED',
          cash_sales_cop: actualCashSales,
          expected_cash_cop: expectedCashCop,
          declared_cash_cop: dto.declared_cash_cop,
          difference_cop: differenceCop,
          denominations_snapshot_json: dto.denominations_snapshot_json
            ? (dto.denominations_snapshot_json as any)
            : null,
          closing_notes: dto.closing_notes?.trim() || null,
          closed_by: actorId,
          closed_at: new Date(),
        },
        include: {
          opener: { select: { id: true, name: true, email: true } },
          closer: { select: { id: true, name: true, email: true } },
        },
      });

      // 6. Registrar auditoría con el resultado del arqueo
      await tx.auditEvent.create({
        data: {
          tenant_id: tenantId,
          branch_id: shift.branch_id,
          actor_id: actorId,
          action: 'CASH_SHIFT_CLOSED',
          entity_type: 'CashShift',
          entity_id: shift.id,
          metadata_json: {
            shift_code: shift.shift_code,
            opening_cash_cop: shift.opening_cash_cop,
            cash_sales_cop: actualCashSales,
            cash_in_total_cop: shift.cash_in_total_cop,
            cash_out_total_cop: shift.cash_out_total_cop,
            expected_cash_cop: expectedCashCop,
            declared_cash_cop: dto.declared_cash_cop,
            difference_cop: differenceCop,
          },
        },
      });

      this.logger.log(
        `Turno ${shift.shift_code} cerrado por ${actorId}: Esperado $${expectedCashCop}, Declarado $${dto.declared_cash_cop}, Diferencia $${differenceCop}`,
      );

      return closedShift;
    });
  }

  /**
   * Consulta el historial de turnos cerrados de la sucursal (para gerentes y administradores).
   */
  async listShifts(
    tenantId: string,
    branchId: string,
    query: CashShiftFilterDto,
    userRoleKey: string,
  ) {
    const allowedRoles = ['BRANCH_MANAGER', 'TENANT_ADMIN', 'PLATFORM_ADMIN'];
    if (!allowedRoles.includes(userRoleKey)) {
      throw new ForbiddenException({
        errorCode: 'FORBIDDEN',
        message: 'No posee permisos para consultar el historial de turnos y arqueos de caja.',
      });
    }

    const where: any = {
      tenant_id: tenantId,
      branch_id: branchId,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.date_from || query.date_to) {
      where.opened_at = {};
      if (query.date_from) {
        where.opened_at.gte = new Date(query.date_from);
      }
      if (query.date_to) {
        where.opened_at.lte = new Date(query.date_to);
      }
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      this.prisma.cashShift.count({ where }),
      this.prisma.cashShift.findMany({
        where,
        orderBy: { opened_at: 'desc' },
        skip,
        take: limit,
        include: {
          opener: { select: { id: true, name: true } },
          closer: { select: { id: true, name: true } },
          _count: {
            select: {
              movements: true,
              payments: true,
            },
          },
        },
      }),
    ]);

    return {
      data: items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

