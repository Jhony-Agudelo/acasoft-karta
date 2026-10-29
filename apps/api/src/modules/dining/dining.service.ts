import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SseStreamService } from '../notifications/sse-stream.service';
import { OrderCodeGeneratorService } from '../ordering/order-code-generator.service';
import {
  CreateDiningAreaDto,
  UpdateDiningAreaDto,
  CreateTableDto,
  UpdateTableDto,
  OpenDiningAccountDto,
  AddOrderToAccountDto,
  TransferTableDto,
  UpdateBillPreviewDto,
  PutConsumptionDistributionDto,
  CloseDiningAccountDto,
  ReopenDiningAccountDto,
  calculateConsumptionDistribution,
  recalculatePaymentState,
  isActionAllowedOnAccount,
  canTransitionTableStatus,
} from '@restaurante-saas/shared';
import { randomBytes } from 'crypto';

@Injectable()
export class DiningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly sseService: SseStreamService,
    private readonly orderCodeGenerator: OrderCodeGeneratorService,
  ) {}

  // ---------------------------------------------------------------------------
  // 1. GESTIÓN ADMINISTRATIVA DE ÁREAS (DiningArea)
  // ---------------------------------------------------------------------------

  async createArea(tenantId: string, branchId: string, dto: CreateDiningAreaDto) {
    return this.prisma.diningArea.create({
      data: {
        tenant_id: tenantId,
        branch_id: branchId,
        name: dto.name,
        sort_order: dto.sort_order ?? 0,
        is_active: dto.is_active ?? true,
      },
    });
  }

  async updateArea(tenantId: string, areaId: string, dto: UpdateDiningAreaDto) {
    const area = await this.prisma.diningArea.findFirst({
      where: { id: areaId, tenant_id: tenantId },
    });
    if (!area) {
      throw new NotFoundException('Área de salón no encontrada.');
    }

    return this.prisma.diningArea.update({
      where: { id: areaId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.sort_order !== undefined ? { sort_order: dto.sort_order } : {}),
        ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
      },
    });
  }

  async listAreas(tenantId: string, branchId: string) {
    return this.prisma.diningArea.findMany({
      where: { tenant_id: tenantId, branch_id: branchId },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
    });
  }

  async deleteArea(tenantId: string, areaId: string) {
    const area = await this.prisma.diningArea.findFirst({
      where: { id: areaId, tenant_id: tenantId },
      include: { tables: { select: { id: true } } },
    });
    if (!area) {
      throw new NotFoundException('Área de salón no encontrada.');
    }

    if (area.tables.length > 0) {
      // Soft-deactivate if has tables
      return this.prisma.diningArea.update({
        where: { id: areaId },
        data: { is_active: false },
      });
    }

    return this.prisma.diningArea.delete({ where: { id: areaId } });
  }

  // ---------------------------------------------------------------------------
  // 2. GESTIÓN ADMINISTRATIVA DE MESAS (Table) Y GENERACIÓN DE QR
  // ---------------------------------------------------------------------------

  async createTable(tenantId: string, branchId: string, dto: CreateTableDto) {
    const existing = await this.prisma.table.findFirst({
      where: { tenant_id: tenantId, branch_id: branchId, code: dto.code },
    });
    if (existing) {
      throw new ConflictException(`Ya existe una mesa con el código '${dto.code}' en esta sucursal.`);
    }

    const table = await this.prisma.table.create({
      data: {
        tenant_id: tenantId,
        branch_id: branchId,
        area_id: dto.area_id,
        code: dto.code,
        capacity: dto.capacity ?? 4,
        status: 'FREE',
        is_active: dto.is_active ?? true,
      },
    });

    // Crear automáticamente enlace de código QR para autopedido en mesa
    const qrToken = randomBytes(32).toString('hex');
    await this.prisma.qrCodeLink.create({
      data: {
        tenant_id: tenantId,
        branch_id: branchId,
        target_type: 'DINING_TABLE',
        table_id: table.id,
        qr_token: qrToken,
        label: `Mesa ${table.code}`,
        is_active: true,
      },
    });

    return table;
  }

  async updateTable(tenantId: string, tableId: string, dto: UpdateTableDto) {
    const table = await this.prisma.table.findFirst({
      where: { id: tableId, tenant_id: tenantId },
    });
    if (!table) {
      throw new NotFoundException('Mesa no encontrada.');
    }

    if (dto.code && dto.code !== table.code) {
      const duplicate = await this.prisma.table.findFirst({
        where: {
          tenant_id: tenantId,
          branch_id: table.branch_id,
          code: dto.code,
          id: { not: tableId },
        },
      });
      if (duplicate) {
        throw new ConflictException(`Ya existe una mesa con el código '${dto.code}' en esta sucursal.`);
      }
    }

    return this.prisma.table.update({
      where: { id: tableId },
      data: {
        ...(dto.area_id !== undefined ? { area_id: dto.area_id } : {}),
        ...(dto.code !== undefined ? { code: dto.code } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
      },
    });
  }

  async listTablesAdmin(tenantId: string, branchId: string) {
    return this.prisma.table.findMany({
      where: { tenant_id: tenantId, branch_id: branchId },
      include: {
        area: { select: { id: true, name: true, sort_order: true } },
        qr_links: {
          where: { is_active: true },
          select: { qr_token: true, is_active: true },
          take: 1,
        },
      },
      orderBy: [{ area: { sort_order: 'asc' } }, { code: 'asc' }],
    });
  }

  async deleteTable(tenantId: string, tableId: string) {
    const table = await this.prisma.table.findFirst({
      where: { id: tableId, tenant_id: tenantId },
      include: {
        accounts: {
          where: { status: { in: ['OPEN', 'REOPENED_ACCOUNTING'] } },
          take: 1,
        },
      },
    });
    if (!table) {
      throw new NotFoundException('Mesa no encontrada.');
    }

    if (table.accounts.length > 0) {
      throw new ConflictException('No se puede eliminar una mesa con cuentas activas.');
    }

    return this.prisma.table.update({
      where: { id: tableId },
      data: { is_active: false },
    });
  }

  // ---------------------------------------------------------------------------
  // 3. PLANO OPERATIVO DE SALÓN (Table Floor Plan)
  // ---------------------------------------------------------------------------

  async getTablePlan(tenantId: string, branchId: string) {
    // 1. Áreas con mesas activas
    const areas = await this.prisma.diningArea.findMany({
      where: { tenant_id: tenantId, branch_id: branchId, is_active: true },
      orderBy: { sort_order: 'asc' },
      include: {
        tables: {
          where: { is_active: true },
          orderBy: { code: 'asc' },
          include: {
            accounts: {
              where: { status: 'OPEN' },
              take: 1,
              select: {
                id: true,
                account_code: true,
                status: true,
                payment_status: true,
                guest_count: true,
                table_session_pin: true,
                subtotal_products_cop: true,
                discount_total_cop: true,
                tip_cop: true,
                grand_total_cop: true,
                paid_total_cop: true,
                uncollected_amount_cop: true,
                opened_at: true,
                version: true,
                orders: {
                  select: { id: true, order_code: true, status: true, grand_total_cop: true },
                },
              },
            },
            orders: {
              where: {
                origin: 'TABLE_QR',
                status: 'REQUESTED',
              },
              select: {
                id: true,
                order_code: true,
                created_at: true,
                grand_total_cop: true,
              },
            },
          },
        },
      },
    });

    // 2. Cuentas en estado REOPENED_ACCOUNTING (pendientes de ajuste contable en caja)
    const reopenedAccountingAccounts = await this.prisma.diningAccount.findMany({
      where: {
        tenant_id: tenantId,
        branch_id: branchId,
        status: 'REOPENED_ACCOUNTING',
      },
      include: {
        table: { select: { id: true, code: true } },
      },
      orderBy: { reopened_at: 'desc' },
    });

    return {
      areas: areas.map((area) => ({
        id: area.id,
        name: area.name,
        sort_order: area.sort_order,
        tables: area.tables.map((t) => {
          const activeAccount = t.accounts[0] || null;
          return {
            id: t.id,
            code: t.code,
            capacity: t.capacity,
            status: t.status,
            account: activeAccount
              ? {
                  id: activeAccount.id,
                  account_code: activeAccount.account_code,
                  status: activeAccount.status,
                  payment_status: activeAccount.payment_status,
                  guest_count: activeAccount.guest_count,
                  table_session_pin: activeAccount.table_session_pin,
                  grand_total_cop: activeAccount.grand_total_cop,
                  paid_total_cop: activeAccount.paid_total_cop,
                  uncollected_amount_cop: activeAccount.uncollected_amount_cop,
                  opened_at: activeAccount.opened_at,
                  version: activeAccount.version,
                  orders_count: activeAccount.orders.length,
                }
              : null,
            pending_qr_orders: t.orders,
          };
        }),
      })),
      reopened_accounting_accounts: reopenedAccountingAccounts.map((a) => ({
        id: a.id,
        account_code: a.account_code,
        table_code: a.table.code,
        status: a.status,
        payment_status: a.payment_status,
        grand_total_cop: a.grand_total_cop,
        paid_total_cop: a.paid_total_cop,
        reopened_at: a.reopened_at,
        reopen_reason: a.reopen_reason,
        version: a.version,
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // 4. APERTURA DE CUENTA (DiningAccount)
  // ---------------------------------------------------------------------------

  async openAccount(tenantId: string, branchId: string, actorId: string, dto: OpenDiningAccountDto) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Bloquear y verificar la mesa física
      const table = await tx.table.findFirst({
        where: { id: dto.table_id, tenant_id: tenantId, branch_id: branchId },
      });
      if (!table) {
        throw new NotFoundException('Mesa no encontrada.');
      }

      if (table.status !== 'FREE') {
        throw new ConflictException({
          errorCode: 'TABLE_ALREADY_OCCUPIED',
          message: `La mesa '${table.code}' ya se encuentra ocupada o reservada.`,
        });
      }

      // 2. Verificar que no haya cuenta OPEN existente para esta mesa (redundancia defensiva con el índice parcial)
      const existingAccount = await tx.diningAccount.findFirst({
        where: {
          tenant_id: tenantId,
          branch_id: branchId,
          table_id: table.id,
          status: 'OPEN',
        },
      });
      if (existingAccount) {
        throw new ConflictException({
          errorCode: 'TABLE_ALREADY_HAS_OPEN_ACCOUNT',
          message: `La mesa '${table.code}' ya cuenta con una cuenta abierta activa.`,
        });
      }

      // 3. Generar PIN aleatorio de sesión de 4 dígitos (0000 - 9999)
      const sessionPin = Math.floor(1000 + Math.random() * 9000).toString();
      const accountCode = `#C-${table.code}-${Math.floor(100 + Math.random() * 900)}`;

      // 4. Crear la cuenta de salón
      const account = await tx.diningAccount.create({
        data: {
          tenant_id: tenantId,
          branch_id: branchId,
          table_id: table.id,
          account_code: accountCode,
          status: 'OPEN',
          payment_status: 'UNPAID',
          guest_count: dto.guest_count ?? 1,
          table_session_pin: sessionPin,
          opened_by: actorId,
          version: 1,
        },
      });

      // 5. Ocupar la mesa física
      await tx.table.update({
        where: { id: table.id },
        data: { status: 'OCCUPIED' },
      });

      // 6. Notificar vía SSE
      this.sseService.emitToBranch(tenantId, branchId, 'dining.account_opened', {
        account_id: account.id,
        table_id: table.id,
        table_code: table.code,
        account_code: account.account_code,
        table_session_pin: account.table_session_pin,
      });

      return account;
    });
  }

  // ---------------------------------------------------------------------------
  // 5. DETALLE COMPLETO DE CUENTA (Get Account)
  // ---------------------------------------------------------------------------

  async getAccount(tenantId: string, accountId: string) {
    const account = await this.prisma.diningAccount.findFirst({
      where: { id: accountId, tenant_id: tenantId },
      include: {
        table: true,
        orders: {
          where: {
            status: { notIn: ['REJECTED', 'CANCELLED', 'EXPIRED_UNPROCESSED'] },
          },
          include: {
            items: true,
          },
          orderBy: { created_at: 'asc' },
        },
        payments: {
          where: { status: 'APPROVED' },
          orderBy: { created_at: 'asc' },
        },
        diners: {
          orderBy: { sort_order: 'asc' },
          include: {
            assignments: true,
          },
        },
        opener: { select: { id: true, name: true } },
      },
    });

    if (!account) {
      throw new NotFoundException('Cuenta de salón no encontrada.');
    }

    return account;
  }

  // ---------------------------------------------------------------------------
  // 6. ADICIÓN DE COMANDA A CUENTA (Add Order To Account)
  // ---------------------------------------------------------------------------

  async addOrderToAccount(
    tenantId: string,
    accountId: string,
    actorId: string,
    dto: AddOrderToAccountDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Bloquear y verificar la cuenta
      const account = await tx.diningAccount.findFirst({
        where: { id: accountId, tenant_id: tenantId },
        include: { table: true },
      });
      if (!account) {
        throw new NotFoundException('Cuenta de salón no encontrada.');
      }

      if (!isActionAllowedOnAccount(account.status as any, 'ADD_ORDER')) {
        throw new ConflictException({
          errorCode: 'ACCOUNT_NOT_OPEN',
          message:
            'No se pueden agregar pedidos a una cuenta cerrada o en estado de ajuste contable.',
        });
      }

      // Control de Concurrencia Optimista (version)
      if (account.version !== dto.expected_account_version) {
        throw new ConflictException({
          errorCode: 'ACCOUNT_VERSION_CONFLICT',
          message:
            'La cuenta fue modificada por otro usuario. Por favor recarga los datos antes de continuar.',
          current_version: account.version,
        });
      }

      const branchId = account.branch_id;

      // 2. Resolver los ítems y precios del catálogo
      let orderSubtotal = 0;
      let orderTaxTotal = 0;
      const orderItemsData: any[] = [];

      for (const itemDto of dto.items) {
        const product = await (tx as any).product.findFirst({
          where: { id: itemDto.product_id, tenant_id: tenantId, status: 'ACTIVE' },
          include: {
            category: true,
            variants: true,
            modifier_groups: {
              include: {
                group: {
                  include: {
                    options: true,
                  },
                },
              },
            },
          },
        });
        if (!product) {
          throw new NotFoundException(`Producto con ID ${itemDto.product_id} no disponible.`);
        }

        let unitPrice = product.price_cop;
        let selectedVariantName: string | null = null;
        if (itemDto.variant_id) {
          const variant = product.variants.find(
            (v: any) => v.id === itemDto.variant_id && v.status === 'ACTIVE',
          );
          if (!variant) {
            throw new NotFoundException(`Variante no encontrada para el producto ${product.name}.`);
          }
          unitPrice = variant.price_cop;
          selectedVariantName = variant.name;
        }

        // Modificadores
        const selectedModifiersJson: any[] = [];
        let modifiersExtra = 0;
        if (itemDto.modifiers && itemDto.modifiers.length > 0) {
          for (const mod of itemDto.modifiers) {
            for (const pmg of product.modifier_groups) {
              if (pmg.group_id === mod.group_id) {
                const opt = pmg.group.options.find(
                  (o: any) => o.id === mod.option_id && o.status === 'ACTIVE',
                );
                if (opt) {
                  modifiersExtra += opt.extra_price_cop;
                  selectedModifiersJson.push({
                    group_id: mod.group_id,
                    group_name: pmg.group.name,
                    option_id: opt.id,
                    option_name: opt.name,
                    extra_price_cop: opt.extra_price_cop,
                  });
                }
              }
            }
          }
        }

        const effectiveUnit = unitPrice + modifiersExtra;
        const lineTotal = effectiveUnit * itemDto.quantity;
        orderSubtotal += lineTotal;

        const stationKey =
          product.override_station_key ||
          product.category?.default_station_key ||
          'KITCHEN_MAIN';

        orderItemsData.push({
          tenant_id: tenantId,
          product_id: product.id,
          product_snapshot_json: {
            name: product.name,
            variant_name: selectedVariantName,
          },
          quantity: itemDto.quantity,
          unit_price_cop: effectiveUnit,
          discount_cop: 0,
          modifiers_snapshot_json: selectedModifiersJson,
          tax_snapshot_json: { tax_type: product.tax_type, tax_rate_bp: product.tax_rate_bp },
          line_total_cop: lineTotal,
          station_key: stationKey,
          status: 'PENDING',
          notes: itemDto.notes || null,
        });
      }

      // 3. Generar código de comanda diario (#A101)
      const orderCode = await this.orderCodeGenerator.generateDailyOrderCode(
        tx,
        tenantId,
        branchId,
      );
      const publicToken = randomBytes(32).toString('hex');

      // 4. Crear la Order asociada a la DiningAccount
      const order = await tx.order.create({
        data: {
          tenant_id: tenantId,
          branch_id: branchId,
          order_code: orderCode,
          origin: 'STAFF',
          fulfillment_type: 'DINE_IN',
          status: 'ACCEPTED',
          payment_policy: 'OFFLINE_ONLY',
          require_payment_before_preparation: false,
          payment_status: 'UNPAID',
          customer_snapshot_json: {
            name: `Mesa ${account.table.code}`,
            phone_e164: '+570000000000',
          },
          table_id: account.table_id,
          dining_account_id: account.id,
          public_token: publicToken,
          subtotal_products_cop: orderSubtotal,
          discount_total_cop: 0,
          delivery_fee_cop: 0,
          tax_total_cop: orderTaxTotal,
          tip_cop: 0,
          grand_total_cop: orderSubtotal,
          paid_total_cop: 0,
          uncollected_amount_cop: 0,
          tax_summary_snapshot_json: [],
          notes: dto.notes || null,
          is_locked: true,
          processed_at: new Date(),
          processed_by: actorId,
          items: {
            create: orderItemsData,
          },
        },
        include: {
          items: true,
        },
      });

      // 5. Recalcular importes acumulados de la DiningAccount
      const activeOrders = await tx.order.findMany({
        where: {
          dining_account_id: account.id,
          status: { notIn: ['REJECTED', 'CANCELLED', 'EXPIRED_UNPROCESSED'] },
        },
        select: {
          subtotal_products_cop: true,
          tax_total_cop: true,
        },
      });

      const newSubtotal = activeOrders.reduce((acc, o) => acc + o.subtotal_products_cop, 0);
      const newTaxTotal = activeOrders.reduce((acc, o) => acc + o.tax_total_cop, 0);
      const newGrandTotal = Math.max(
        0,
        newSubtotal - account.discount_total_cop + account.tip_cop,
      );
      const newVersion = account.version + 1;

      // Si la mesa estaba en PENDING_PAYMENT y se le agrega una nueva comanda, regresa a OCCUPIED
      if (account.table.status === 'PENDING_PAYMENT') {
        await tx.table.update({
          where: { id: account.table.id },
          data: { status: 'OCCUPIED' },
        });
      }

      const updatedAccount = await tx.diningAccount.update({
        where: { id: account.id },
        data: {
          subtotal_products_cop: newSubtotal,
          tax_total_cop: newTaxTotal,
          grand_total_cop: newGrandTotal,
          version: newVersion,
        },
      });

      // 6. Emitir eventos SSE
      this.sseService.emitToBranch(tenantId, branchId, 'dining.order_added', {
        account_id: account.id,
        order_id: order.id,
        order_code: order.order_code,
        version: newVersion,
        grand_total_cop: newGrandTotal,
      });

      this.sseService.emitToBranch(tenantId, branchId, 'kitchen.order_updated', {
        order_id: order.id,
        status: order.status,
      });

      return {
        order,
        account: updatedAccount,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // 7. TRASLADO DE MESA (Transfer Table)
  // ---------------------------------------------------------------------------

  async transferTable(
    tenantId: string,
    accountId: string,
    actorId: string,
    dto: TransferTableDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.diningAccount.findFirst({
        where: { id: accountId, tenant_id: tenantId },
        include: { table: true },
      });
      if (!account) {
        throw new NotFoundException('Cuenta de salón no encontrada.');
      }

      if (!isActionAllowedOnAccount(account.status as any, 'TRANSFER_TABLE')) {
        throw new ConflictException({
          errorCode: 'TRANSFER_NOT_ALLOWED',
          message: 'Solo se pueden trasladar cuentas activas en estado OPEN.',
        });
      }

      if (account.version !== dto.expected_account_version) {
        throw new ConflictException({
          errorCode: 'ACCOUNT_VERSION_CONFLICT',
          message: 'Conflicto de versión al trasladar mesa.',
          current_version: account.version,
        });
      }

      const targetTable = await tx.table.findFirst({
        where: {
          id: dto.target_table_id,
          tenant_id: tenantId,
          branch_id: account.branch_id,
        },
      });
      if (!targetTable) {
        throw new NotFoundException('Mesa destino no encontrada.');
      }

      if (targetTable.id === account.table_id) {
        throw new BadRequestException('La mesa destino es la misma que la actual.');
      }

      if (targetTable.status !== 'FREE') {
        throw new ConflictException({
          errorCode: 'TABLE_ALREADY_OCCUPIED',
          message: `La mesa destino '${targetTable.code}' no está libre.`,
        });
      }

      const oldTableId = account.table_id;
      const oldTableCode = account.table.code;
      const newVersion = account.version + 1;

      // 1. Liberar mesa origen
      await tx.table.update({
        where: { id: oldTableId },
        data: { status: 'FREE' },
      });

      // 2. Ocupar mesa destino
      await tx.table.update({
        where: { id: targetTable.id },
        data: { status: 'OCCUPIED' },
      });

      // 3. Actualizar cuenta
      const updatedAccount = await tx.diningAccount.update({
        where: { id: account.id },
        data: {
          table_id: targetTable.id,
          version: newVersion,
        },
      });

      // 4. Actualizar órdenes hijas
      await tx.order.updateMany({
        where: { dining_account_id: account.id },
        data: { table_id: targetTable.id },
      });

      // 5. Auditoría
      await this.auditService.record({
        tenantId,
        branchId: account.branch_id,
        actorId,
        action: 'DINING_ACCOUNT_TRANSFERRED',
        entityType: 'DiningAccount',
        entityId: account.id,
        metadata: {
          from_table_id: oldTableId,
          from_table_code: oldTableCode,
          to_table_id: targetTable.id,
          to_table_code: targetTable.code,
          reason: dto.reason,
        },
      });

      // 6. SSE
      this.sseService.emitToBranch(tenantId, account.branch_id, 'dining.table_transferred', {
        account_id: account.id,
        from_table_code: oldTableCode,
        to_table_code: targetTable.code,
        version: newVersion,
      });

      return updatedAccount;
    });
  }

  // ---------------------------------------------------------------------------
  // 8. PRE-CUENTA (Bill Preview: Descuento y Propina)
  // ---------------------------------------------------------------------------

  async updateBillPreview(
    tenantId: string,
    accountId: string,
    actorId: string,
    dto: UpdateBillPreviewDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.diningAccount.findFirst({
        where: { id: accountId, tenant_id: tenantId },
        include: { table: true },
      });
      if (!account) {
        throw new NotFoundException('Cuenta de salón no encontrada.');
      }

      if (
        account.status !== 'OPEN' &&
        account.status !== 'REOPENED_ACCOUNTING'
      ) {
        throw new ConflictException({
          errorCode: 'ACCOUNT_IS_CLOSED',
          message: 'No se puede actualizar la pre-cuenta de una cuenta cerrada.',
        });
      }

      if (account.version !== dto.expected_account_version) {
        throw new ConflictException({
          errorCode: 'ACCOUNT_VERSION_CONFLICT',
          message: 'Conflicto de versión en pre-cuenta.',
          current_version: account.version,
        });
      }

      const discountTotal = dto.discount_total_cop ?? 0;
      const tip = dto.tip_cop ?? 0;
      const newGrandTotal = Math.max(0, account.subtotal_products_cop - discountTotal + tip);

      if (newGrandTotal < account.paid_total_cop) {
        throw new ConflictException({
          errorCode: 'TOTAL_BELOW_PAID_AMOUNT',
          message: 'El total de la cuenta no puede ser inferior al monto ya pagado.',
        });
      }

      // Recalcular estado financiero
      const paymentRecalc = recalculatePaymentState({
        paymentPolicy: 'OFFLINE_ONLY',
        grandTotalCop: newGrandTotal,
        approvedPaymentsAmountsCop: [account.paid_total_cop],
      });

      // Si la cuenta estaba en OPEN, la mesa física pasa a PENDING_PAYMENT
      if (account.status === 'OPEN') {
        await tx.table.update({
          where: { id: account.table_id },
          data: { status: 'PENDING_PAYMENT' },
        });
      }

      const newVersion = account.version + 1;

      const updatedAccount = await tx.diningAccount.update({
        where: { id: account.id },
        data: {
          discount_total_cop: discountTotal,
          tip_cop: tip,
          grand_total_cop: newGrandTotal,
          payment_status: paymentRecalc.paymentStatus as any,
          uncollected_amount_cop: paymentRecalc.uncollectedAmountCop,
          version: newVersion,
        },
      });

      this.sseService.emitToBranch(tenantId, account.branch_id, 'dining.table_updated', {
        table_id: account.table_id,
        status: account.status === 'OPEN' ? 'PENDING_PAYMENT' : account.table.status,
      });

      return updatedAccount;
    });
  }

  // ---------------------------------------------------------------------------
  // 9. DISTRIBUCIÓN INFORMATIVA POR PERSONA (Consumption Distribution)
  // ---------------------------------------------------------------------------

  async getConsumptionDistribution(tenantId: string, accountId: string) {
    const account = await this.prisma.diningAccount.findFirst({
      where: { id: accountId, tenant_id: tenantId },
      include: {
        diners: {
          orderBy: { sort_order: 'asc' },
          include: { assignments: true },
        },
        orders: {
          where: {
            status: { notIn: ['REJECTED', 'CANCELLED', 'EXPIRED_UNPROCESSED'] },
          },
          include: {
            items: true,
          },
        },
      },
    });

    if (!account) {
      throw new NotFoundException('Cuenta de salón no encontrada.');
    }

    const allItems = account.orders.flatMap((o) =>
      o.items.map((i) => ({
        id: i.id,
        line_total_cop: i.line_total_cop,
        product_name: (i.product_snapshot_json as any)?.name,
      })),
    );

    const diners = account.diners.map((d) => ({
      id: d.id,
      label: d.label,
      sort_order: d.sort_order,
    }));

    const assignments = account.diners.flatMap((d) =>
      d.assignments.map((a) => ({
        diner_id: a.diner_id,
        order_item_id: a.order_item_id,
        share_units: a.share_units,
        total_item_shares: a.total_item_shares,
      })),
    );

    const distribution = calculateConsumptionDistribution({
      items: allItems,
      diners,
      assignments,
      discount_total_cop: account.discount_total_cop,
      tip_cop: account.tip_cop,
      grand_total_cop: account.grand_total_cop,
      split_rule: account.split_rule as any,
    });

    return {
      account_id: account.id,
      account_version: account.version,
      split_rule: account.split_rule,
      items: allItems,
      ...distribution,
    };
  }

  async putConsumptionDistribution(
    tenantId: string,
    accountId: string,
    actorId: string,
    dto: PutConsumptionDistributionDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.diningAccount.findFirst({
        where: { id: accountId, tenant_id: tenantId },
        include: {
          orders: {
            where: {
              status: { notIn: ['REJECTED', 'CANCELLED', 'EXPIRED_UNPROCESSED'] },
            },
            include: { items: true },
          },
        },
      });
      if (!account) {
        throw new NotFoundException('Cuenta de salón no encontrada.');
      }

      if (
        account.status !== 'OPEN' &&
        account.status !== 'REOPENED_ACCOUNTING'
      ) {
        throw new ConflictException({
          errorCode: 'ACCOUNT_IS_CLOSED',
          message: 'No se puede modificar la distribución de una cuenta cerrada.',
        });
      }

      if (account.version !== dto.expected_account_version) {
        throw new ConflictException({
          errorCode: 'ACCOUNT_VERSION_CONFLICT',
          message: 'Conflicto de versión al guardar la distribución.',
          current_version: account.version,
        });
      }

      // 1. Obtener todos los ítems activos
      const allItems = account.orders.flatMap((o) =>
        o.items.map((i) => ({
          id: i.id,
          line_total_cop: i.line_total_cop,
          product_name: (i.product_snapshot_json as any)?.name,
        })),
      );

      // 2. Gestionar comensales (AccountDiner)
      // Eliminamos asignaciones antiguas antes de actualizar comensales
      await tx.consumptionAssignment.deleteMany({
        where: { account_id: account.id },
      });

      // Crear o sincronizar comensales
      const dinerMap = new Map<string, string>(); // label/id provisto -> UUID en DB
      const dbDiners: any[] = [];

      for (const d of dto.diners) {
        let dinerRecord;
        if (d.id) {
          dinerRecord = await tx.accountDiner.upsert({
            where: { id: d.id },
            update: { label: d.label, sort_order: d.sort_order },
            create: {
              id: d.id,
              tenant_id: tenantId,
              account_id: account.id,
              label: d.label,
              sort_order: d.sort_order,
            },
          });
        } else {
          // Buscar por (account_id, label)
          dinerRecord = await tx.accountDiner.findUnique({
            where: {
              uq_account_diners_account_label: {
                account_id: account.id,
                label: d.label,
              },
            },
          });
          if (dinerRecord) {
            dinerRecord = await tx.accountDiner.update({
              where: { id: dinerRecord.id },
              data: { sort_order: d.sort_order },
            });
          } else {
            dinerRecord = await tx.accountDiner.create({
              data: {
                tenant_id: tenantId,
                account_id: account.id,
                label: d.label,
                sort_order: d.sort_order,
              },
            });
          }
        }
        dbDiners.push(dinerRecord);
        dinerMap.set(d.label, dinerRecord.id);
        if (d.id) dinerMap.set(d.id, dinerRecord.id);
      }

      // 3. Preparar asignaciones con UUIDs reales
      const inputAssignments = dto.assignments.map((a) => {
        const resolvedDinerId = dinerMap.get(a.diner_id) || a.diner_id;
        return {
          diner_id: resolvedDinerId,
          order_item_id: a.order_item_id,
          share_units: a.share_units,
          total_item_shares: a.total_item_shares,
        };
      });

      // 4. Ejecutar calculadora determinista
      const distribution = calculateConsumptionDistribution({
        items: allItems,
        diners: dbDiners.map((d) => ({
          id: d.id,
          label: d.label,
          sort_order: d.sort_order,
        })),
        assignments: inputAssignments,
        discount_total_cop: account.discount_total_cop,
        tip_cop: account.tip_cop,
        grand_total_cop: account.grand_total_cop,
        split_rule: dto.split_rule,
      });

      // 5. Persistir las nuevas ConsumptionAssignment
      for (const a of distribution.assignments) {
        await tx.consumptionAssignment.create({
          data: {
            tenant_id: tenantId,
            account_id: account.id,
            diner_id: a.diner_id,
            order_item_id: a.order_item_id,
            share_units: a.share_units,
            total_item_shares: a.total_item_shares,
            assigned_amount_cop: a.assigned_amount_cop,
          },
        });
      }

      const newVersion = account.version + 1;
      await tx.diningAccount.update({
        where: { id: account.id },
        data: {
          split_rule: dto.split_rule,
          version: newVersion,
        },
      });

      return {
        account_id: account.id,
        account_version: newVersion,
        split_rule: dto.split_rule,
        ...distribution,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // 10. CIERRE DE CUENTA (Close Account)
  // ---------------------------------------------------------------------------

  async closeAccount(
    tenantId: string,
    accountId: string,
    actorId: string,
    actorRoles: string[],
    dto: CloseDiningAccountDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.diningAccount.findFirst({
        where: { id: accountId, tenant_id: tenantId },
        include: { table: true },
      });
      if (!account) {
        throw new NotFoundException('Cuenta de salón no encontrada.');
      }

      if (
        account.status !== 'OPEN' &&
        account.status !== 'REOPENED_ACCOUNTING'
      ) {
        throw new ConflictException({
          errorCode: 'ACCOUNT_IS_CLOSED',
          message: 'La cuenta ya se encuentra cerrada.',
        });
      }

      if (account.version !== dto.expected_account_version) {
        throw new ConflictException({
          errorCode: 'ACCOUNT_VERSION_CONFLICT',
          message: 'Conflicto de versión al cerrar la cuenta.',
          current_version: account.version,
        });
      }

      // Verificar que no existan órdenes en REQUESTED pendientes de cocina
      const pendingOrders = await tx.order.findFirst({
        where: {
          dining_account_id: account.id,
          status: 'REQUESTED',
        },
      });
      if (pendingOrders) {
        throw new ConflictException({
          errorCode: 'ACCOUNT_HAS_UNPROCESSED_ORDERS',
          message:
            'Existen pedidos QR de comensales en estado REQUESTED pendientes de confirmar o rechazar antes de cerrar la cuenta.',
        });
      }

      const wasOpen = account.status === 'OPEN';
      const isFullyPaid = account.grand_total_cop === account.paid_total_cop;

      let finalPaymentStatus = 'PAID';
      let uncollectedCop = 0;
      let resolutionType: string | null = null;

      if (isFullyPaid) {
        finalPaymentStatus = 'PAID';
        uncollectedCop = 0;
      } else {
        // Saldo pendiente por cobrar
        if (!dto.resolution_type) {
          throw new ConflictException({
            errorCode: 'ACCOUNT_HAS_UNPAID_BALANCE',
            message: `La cuenta tiene un saldo pendiente de $${account.grand_total_cop - account.paid_total_cop} COP. Debe cobrarse o cerrarse con resolución auditada (COURTESY o WRITTEN_OFF).`,
          });
        }

        const isManager =
          actorRoles.includes('BRANCH_MANAGER') ||
          actorRoles.includes('TENANT_ADMIN') ||
          actorRoles.includes('PLATFORM_ADMIN');
        if (!isManager) {
          throw new ForbiddenException(
            'Se requiere rol BRANCH_MANAGER o TENANT_ADMIN para cerrar cuentas con saldo pendiente.',
          );
        }

        resolutionType = dto.resolution_type;
        finalPaymentStatus = dto.resolution_type;
        uncollectedCop = account.grand_total_cop - account.paid_total_cop;
      }

      // 1. Cerrar DiningAccount
      const updatedAccount = await tx.diningAccount.update({
        where: { id: account.id },
        data: {
          status: 'CLOSED',
          payment_status: finalPaymentStatus as any,
          resolution_type: resolutionType,
          uncollected_amount_cop: uncollectedCop,
          closed_by: actorId,
          closed_at: new Date(),
          close_reason: dto.reason || null,
          version: account.version + 1,
        },
      });

      // 2. Sincronizar automáticamente payment_status de todas las órdenes hijas activas
      await tx.order.updateMany({
        where: {
          dining_account_id: account.id,
          status: { notIn: ['REJECTED', 'CANCELLED', 'EXPIRED_UNPROCESSED'] },
        },
        data: {
          payment_status: finalPaymentStatus,
        },
      });

      // 3. Liberar mesa física si la cuenta estaba en OPEN
      if (wasOpen) {
        await tx.table.update({
          where: { id: account.table_id },
          data: { status: 'FREE' },
        });
      }

      // 4. Auditoría si fue resolución especial
      if (resolutionType) {
        await this.auditService.record({
          tenantId,
          branchId: account.branch_id,
          actorId,
          action: 'DINING_ACCOUNT_RESOLVED_UNCOLLECTED',
          entityType: 'DiningAccount',
          entityId: account.id,
          metadata: {
            resolution_type: resolutionType,
            uncollected_amount_cop: uncollectedCop,
            reason: dto.reason,
          },
        });
      }

      // 5. SSE
      this.sseService.emitToBranch(tenantId, account.branch_id, 'dining.account_closed', {
        account_id: account.id,
        table_id: account.table_id,
        status: 'CLOSED',
        payment_status: finalPaymentStatus,
      });

      return updatedAccount;
    });
  }

  // ---------------------------------------------------------------------------
  // 11. REAPERTURA DE CUENTA (Reopen Account — Dual Mode)
  // ---------------------------------------------------------------------------

  async reopenAccount(
    tenantId: string,
    accountId: string,
    actorId: string,
    actorRoles: string[],
    dto: ReopenDiningAccountDto,
  ) {
    const isManager =
      actorRoles.includes('BRANCH_MANAGER') ||
      actorRoles.includes('TENANT_ADMIN') ||
      actorRoles.includes('PLATFORM_ADMIN');
    if (!isManager) {
      throw new ForbiddenException(
        'Solo administradores o gerentes de sucursal pueden reabrir cuentas cerradas.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const account = await tx.diningAccount.findFirst({
        where: { id: accountId, tenant_id: tenantId },
        include: { table: true },
      });
      if (!account) {
        throw new NotFoundException('Cuenta de salón no encontrada.');
      }

      if (account.status !== 'CLOSED') {
        throw new ConflictException({
          errorCode: 'ACCOUNT_NOT_CLOSED',
          message: 'Solo se pueden reabrir cuentas en estado CLOSED.',
        });
      }

      const newVersion = account.version + 1;

      if (dto.mode === 'ACCOUNTING_ONLY') {
        // Modo Contable: No toca Table.status ni colisiona con el índice parcial de OPEN
        const updatedAccount = await tx.diningAccount.update({
          where: { id: account.id },
          data: {
            status: 'REOPENED_ACCOUNTING',
            resolution_type: null,
            uncollected_amount_cop: 0,
            reopened_by: actorId,
            reopened_at: new Date(),
            reopen_reason: dto.reason,
            version: newVersion,
          },
        });

        // Restablecer órdenes hijas activas a UNPAID para el ajuste contable
        await tx.order.updateMany({
          where: {
            dining_account_id: account.id,
            status: { notIn: ['REJECTED', 'CANCELLED', 'EXPIRED_UNPROCESSED'] },
          },
          data: { payment_status: 'UNPAID' },
        });

        await this.auditService.record({
          tenantId,
          branchId: account.branch_id,
          actorId,
          action: 'DINING_ACCOUNT_REOPENED_ACCOUNTING',
          entityType: 'DiningAccount',
          entityId: account.id,
          metadata: { reason: dto.reason },
        });

        this.sseService.emitToBranch(tenantId, account.branch_id, 'dining.account_reopened', {
          account_id: account.id,
          mode: 'ACCOUNTING_ONLY',
          status: 'REOPENED_ACCOUNTING',
        });

        return updatedAccount;
      }

      if (dto.mode === 'FULL_TABLE') {
        // Modo Completo: Exige que la mesa física esté FREE
        const table = await tx.table.findUnique({
          where: { id: account.table_id },
        });
        if (!table) {
          throw new NotFoundException('Mesa física asociada no encontrada.');
        }

        if (table.status !== 'FREE') {
          throw new ConflictException({
            errorCode: 'TABLE_ALREADY_OCCUPIED',
            message: `La mesa física '${table.code}' ya se encuentra ocupada por otra cuenta. Para correcciones de cobro o caja, utilice el modo 'ACCOUNTING_ONLY'.`,
          });
        }

        // Ocupar mesa
        await tx.table.update({
          where: { id: table.id },
          data: { status: 'OCCUPIED' },
        });

        const updatedAccount = await tx.diningAccount.update({
          where: { id: account.id },
          data: {
            status: 'OPEN',
            resolution_type: null,
            uncollected_amount_cop: 0,
            reopened_by: actorId,
            reopened_at: new Date(),
            reopen_reason: dto.reason,
            version: newVersion,
          },
        });

        await tx.order.updateMany({
          where: {
            dining_account_id: account.id,
            status: { notIn: ['REJECTED', 'CANCELLED', 'EXPIRED_UNPROCESSED'] },
          },
          data: { payment_status: 'UNPAID' },
        });

        await this.auditService.record({
          tenantId,
          branchId: account.branch_id,
          actorId,
          action: 'DINING_ACCOUNT_REOPENED_FULL_TABLE',
          entityType: 'DiningAccount',
          entityId: account.id,
          metadata: { reason: dto.reason, table_code: table.code },
        });

        this.sseService.emitToBranch(tenantId, account.branch_id, 'dining.account_reopened', {
          account_id: account.id,
          mode: 'FULL_TABLE',
          status: 'OPEN',
          table_id: table.id,
        });

        return updatedAccount;
      }

      throw new BadRequestException('Modo de reapertura inválido.');
    });
  }
}
