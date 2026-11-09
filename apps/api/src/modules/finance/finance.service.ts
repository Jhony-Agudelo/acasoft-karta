import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { FactusV2ClientService } from '../factus-integration/factus-v2-client.service';
import {
  SupplierInputDto,
  CreateExpenseDto,
  ExpensePaymentDto,
  calculateProfitAndLoss,
  ProfitAndLossResult,
  FACTUS_PAYMENT_FORMS,
  FACTUS_PAYMENT_METHODS,
  FACTUS_RADIAN_EVENT_CODES,
} from '@restaurante-saas/shared';

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly factusClient: FactusV2ClientService,
  ) {}

  // ---------------------------------------------------------------------------
  // 1. PROVEEDORES (SUPPLIERS)
  // ---------------------------------------------------------------------------

  async listSuppliers(tenantId: string) {
    return this.prisma.supplier.findMany({
      where: { tenant_id: tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async createSupplier(tenantId: string, dto: SupplierInputDto) {
    const existing = await this.prisma.supplier.findUnique({
      where: {
        uq_suppliers_tenant_id: {
          tenant_id: tenantId,
          identification: dto.identification.trim(),
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe un proveedor registrado con el documento ${dto.identification}.`,
      );
    }

    return this.prisma.supplier.create({
      data: {
        tenant_id: tenantId,
        identification_document_code: dto.identification_document_code,
        identification: dto.identification.trim(),
        dv: dto.dv || null,
        legal_organization_code: dto.legal_organization_code,
        name: dto.name.trim(),
        email: dto.email ? dto.email.trim() : null,
        phone: dto.phone ? dto.phone.trim() : null,
        address: dto.address.trim(),
        municipality_code: dto.municipality_code || '66400',
        is_obligated_to_invoice: dto.is_obligated_to_invoice,
        is_active: dto.is_active,
      },
    });
  }

  async updateSupplier(tenantId: string, id: string, dto: Partial<SupplierInputDto>) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier || supplier.tenant_id !== tenantId) {
      throw new NotFoundException(`Proveedor ${id} no encontrado.`);
    }

    return this.prisma.supplier.update({
      where: { id },
      data: {
        ...dto,
        identification: dto.identification ? dto.identification.trim() : undefined,
        name: dto.name ? dto.name.trim() : undefined,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // 2. GASTOS Y COMPRAS (EXPENSE DOCUMENTS)
  // ---------------------------------------------------------------------------

  async listExpenses(tenantId: string, branchId: string, status?: string) {
    return this.prisma.expenseDocument.findMany({
      where: {
        tenant_id: tenantId,
        branch_id: branchId,
        status: status || undefined,
      },
      include: {
        supplier: true,
        payments: true,
        electronic_fiscal_documents: true,
      },
      orderBy: { occurred_at: 'desc' },
    });
  }

  async createExpense(
    tenantId: string,
    branchId: string,
    userId: string,
    dto: CreateExpenseDto,
  ) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: dto.supplier_id },
    });
    if (!supplier || supplier.tenant_id !== tenantId) {
      throw new NotFoundException(`Proveedor ${dto.supplier_id} no encontrado.`);
    }

    // Calcular totales
    let subtotalCop = 0;
    let taxTotalCop = 0;

    for (const item of dto.items) {
      const lineSubtotal = Math.round(item.quantity * item.price_cop);
      subtotalCop += lineSubtotal;
      if (item.tax_rate && item.tax_rate > 0) {
        const lineTax = Math.round(lineSubtotal * (item.tax_rate / 100));
        taxTotalCop += lineTax;
      }
    }

    const grandTotalCop = subtotalCop + taxTotalCop;

    // Generar código consecutivo de gasto
    const count = await this.prisma.expenseDocument.count({
      where: { tenant_id: tenantId },
    });
    const expenseCode = dto.expense_code || `#G-${String(count + 1).padStart(4, '0')}`;

    return this.prisma.expenseDocument.create({
      data: {
        tenant_id: tenantId,
        branch_id: branchId,
        supplier_id: dto.supplier_id,
        expense_code: expenseCode,
        category: dto.category,
        payment_form: dto.payment_form,
        due_date: dto.due_date ? new Date(dto.due_date) : null,
        status: 'CONFIRMED',
        payment_status: 'UNPAID',
        requires_support_document: dto.requires_support_document || !supplier.is_obligated_to_invoice,
        subtotal_cop: subtotalCop,
        discount_total_cop: 0,
        tax_total_cop: taxTotalCop,
        withholding_tax_total_cop: 0,
        grand_total_cop: grandTotalCop,
        paid_total_cop: 0,
        items_json: dto.items as any,
        notes: dto.notes || null,
        occurred_at: dto.occurred_at ? new Date(dto.occurred_at) : new Date(),
        created_by: userId,
      },
      include: {
        supplier: true,
      },
    });
  }

  /**
   * Registra un pago o abono a un gasto / cuenta por pagar.
   * Si el medio de pago es CASH y existe un turno de caja activo (Fase 07),
   * descuenta automáticamente de caja creando el movimiento CASH_OUT (SUPPLIER_PAYMENT).
   */
  async registerExpensePayment(
    tenantId: string,
    expenseId: string,
    userId: string,
    dto: ExpensePaymentDto,
  ) {
    const expense = await this.prisma.expenseDocument.findUnique({
      where: { id: expenseId },
      include: { branch: true },
    });

    if (!expense || expense.tenant_id !== tenantId) {
      throw new NotFoundException(`Gasto ${expenseId} no encontrado.`);
    }

    const pendingCop = expense.grand_total_cop - expense.paid_total_cop;
    if (dto.amount_cop > pendingCop) {
      throw new BadRequestException(
        `El monto a pagar ($ ${dto.amount_cop}) supera el saldo pendiente ($ ${pendingCop}).`,
      );
    }

    let cashShiftMovementId: string | null = null;

    // Si se paga en EFECTIVO (CASH), vincular con el turno activo de la sucursal si existe
    if (dto.method === 'CASH') {
      const activeShift = await this.prisma.cashShift.findFirst({
        where: {
          tenant_id: tenantId,
          branch_id: expense.branch_id,
          status: 'OPEN',
        },
      });

      if (activeShift) {
        // Crear movimiento CASH_OUT en la caja del turno
        const movement = await this.prisma.cashShiftMovement.create({
          data: {
            tenant_id: tenantId,
            branch_id: expense.branch_id,
            shift_id: activeShift.id,
            type: 'CASH_OUT',
            category: 'SUPPLIER_PAYMENT',
            amount_cop: dto.amount_cop,
            reason: `Pago de gasto ${expense.expense_code} a proveedor: ${dto.reference_note || 'Sin nota'}`,
            reference_doc: expense.expense_code,
            created_by: userId,
          },
        });

        // Actualizar acumulador de salida en el turno
        await this.prisma.cashShift.update({
          where: { id: activeShift.id },
          data: {
            cash_out_total_cop: {
              increment: dto.amount_cop,
            },
          },
        });

        cashShiftMovementId = movement.id;
      }
    }

    // Crear el registro de pago
    const payment = await this.prisma.expensePayment.create({
      data: {
        tenant_id: tenantId,
        branch_id: expense.branch_id,
        expense_id: expenseId,
        method: dto.method,
        amount_cop: dto.amount_cop,
        cash_shift_movement_id: cashShiftMovementId,
        reference_note: dto.reference_note || null,
        status: 'APPROVED',
        created_by: userId,
      },
    });

    // Actualizar acumulador y estado de pago en el documento de gasto
    const newPaidTotal = expense.paid_total_cop + dto.amount_cop;
    const newStatus =
      newPaidTotal >= expense.grand_total_cop ? 'PAID' : 'PARTIALLY_PAID';

    await this.prisma.expenseDocument.update({
      where: { id: expenseId },
      data: {
        paid_total_cop: newPaidTotal,
        payment_status: newStatus,
      },
    });

    return {
      payment,
      paid_total_cop: newPaidTotal,
      payment_status: newStatus,
      cash_shift_movement_id: cashShiftMovementId,
    };
  }

  // ---------------------------------------------------------------------------
  // 3. DOCUMENTO SOPORTE ELECTRÓNICO (DSE - FACTUS V2)
  // ---------------------------------------------------------------------------

  /**
   * Emite y valida el Documento Soporte Electrónico ante Factus v2 para compras a informales
   */
  async emitSupportDocument(tenantId: string, expenseId: string, userId: string) {
    const expense = await this.prisma.expenseDocument.findUnique({
      where: { id: expenseId },
      include: {
        supplier: true,
        branch: true,
      },
    });

    if (!expense || expense.tenant_id !== tenantId) {
      throw new NotFoundException(`Gasto ${expenseId} no encontrado.`);
    }

    if (expense.supplier.is_obligated_to_invoice) {
      throw new BadRequestException(
        'El proveedor está registrado como obligado a facturar. No requiere Documento Soporte Electrónico.',
      );
    }

    // Verificar si ya tiene Documento Soporte validado
    const existing = await this.prisma.electronicFiscalDocument.findFirst({
      where: {
        tenant_id: tenantId,
        expense_id: expenseId,
        doc_category: 'SUPPORT_DOCUMENT',
        status: 'VALIDATED',
      },
    });

    if (existing) {
      return {
        already_emitted: true,
        fiscal_document: existing,
      };
    }

    // Obtener rango de numeración para Documento Soporte ('24')
    const range = await this.prisma.branchNumberingRange.findUnique({
      where: {
        uq_branch_numbering_ranges_doc_type: {
          tenant_id: tenantId,
          branch_id: expense.branch_id,
          document_type_code: '24',
        },
      },
    });

    if (!range || !range.is_active) {
      throw new BadRequestException(
        'No se ha configurado un rango de numeración activo para Documento Soporte (código 24) en esta sucursal. Sincronice los rangos en Ajustes.',
      );
    }

    const numberingRangeId = parseInt(range.factus_range_id, 10);
    const referenceCode = `DSE-${expense.expense_code.replace('#', '')}`;

    const itemsJson = (expense.items_json as any[]) || [];
    const factusItems = itemsJson.map((it, idx) => ({
      code_reference: it.code_reference || `INS-${idx + 1}`,
      name: it.name,
      quantity: Number(it.quantity).toFixed(2),
      discount_rate: '0.00',
      price: Number(it.price_cop).toFixed(2),
      tax_rate: '0.00',
      unit_measure_code: '94',
      standard_code: '999',
      is_excluded: true,
      taxes: [{ is_excluded: true }],
    }));

    const payload = {
      numbering_range_id: numberingRangeId,
      reference_code: referenceCode,
      observation: `Documento soporte por adquisición de insumos/servicios: ${expense.expense_code}`,
      payment_form: expense.payment_form || FACTUS_PAYMENT_FORMS.CASH_IMMEDIATE,
      payment_method_code: FACTUS_PAYMENT_METHODS.CASH,
      payment_due_date: expense.due_date ? expense.due_date.toISOString().slice(0, 10) : undefined,
      supplier: {
        identification_document_code: expense.supplier.identification_document_code,
        identification: expense.supplier.identification,
        dv: expense.supplier.dv || undefined,
        legal_organization_code: expense.supplier.legal_organization_code,
        names: expense.supplier.legal_organization_code === '2' ? expense.supplier.name : undefined,
        company: expense.supplier.legal_organization_code === '1' ? expense.supplier.name : undefined,
        address: expense.supplier.address,
        email: expense.supplier.email || 'proveedor@karta.app',
        phone: expense.supplier.phone || '3000000000',
        municipality_code: expense.supplier.municipality_code || '66400',
      },
      establishment: {
        name: expense.branch.name,
        address: expense.branch.address,
        phone_number: expense.branch.phone_whatsapp_e164,
        municipality_code: '66400',
        email: 'facturacion@karta.app',
      },
      items: factusItems,
      cash_rounding_amount: '0.00',
    };

    // Limpieza de borrador no validado si existiera
    await this.factusClient.destroySupportDocumentDraftByReference(tenantId, referenceCode);

    const res = await this.factusClient.validateSupportDocument(tenantId, payload);
    const dseData = res?.data?.support_document || res?.data;

    if (!dseData || !dseData.number) {
      throw new BadRequestException('Factus no devolvió los datos del documento soporte validado.');
    }

    const fiscalDoc = await this.prisma.electronicFiscalDocument.create({
      data: {
        tenant_id: tenantId,
        branch_id: expense.branch_id,
        doc_category: 'SUPPORT_DOCUMENT',
        customer_mode: 'SUPPLIER_DSE',
        reference_code: referenceCode,
        expense_id: expense.id,
        factus_number: dseData.number,
        prefix: dseData.prefix || range.prefix,
        cufe_or_cude: dseData.cude || null,
        qr_url: dseData.qr || null,
        qr_image_base64: dseData.qr_image || null,
        status: 'VALIDATED',
        total_cop: expense.grand_total_cop,
        cash_rounding_cop_cents: '0.00',
        customer_or_provider_snapshot_json: payload.supplier as any,
        request_payload_json: payload as any,
        response_payload_json: res as any,
        validated_at: new Date(),
        created_by: userId,
      },
    });

    return {
      already_emitted: false,
      fiscal_document: fiscalDoc,
    };
  }

  // ---------------------------------------------------------------------------
  // 4. RECEPCIÓN RADIAN (/v2/receptions)
  // ---------------------------------------------------------------------------

  async listReceivedInvoices(tenantId: string, branchId: string) {
    return this.prisma.receivedSupplierInvoice.findMany({
      where: { tenant_id: tenantId, branch_id: branchId },
      orderBy: { issue_date: 'desc' },
    });
  }

  async uploadReceptionInvoice(
    tenantId: string,
    branchId: string,
    fileBuffer: Buffer,
    fileName: string,
  ) {
    const res = await this.factusClient.uploadReceptionInvoice(tenantId, fileBuffer, fileName);
    const item = res?.data?.bill || res?.data;

    if (!item) {
      throw new BadRequestException('Factus no pudo procesar el archivo de la factura recibida.');
    }

    const trackId = item.track_id || item.cufe || `REC-${Date.now()}`;

    const record = await this.prisma.receivedSupplierInvoice.upsert({
      where: {
        uq_received_supplier_invoices_cufe: {
          tenant_id: tenantId,
          track_id_or_cufe: trackId,
        },
      },
      create: {
        tenant_id: tenantId,
        branch_id: branchId,
        factus_reception_id: String(item.id || ''),
        track_id_or_cufe: trackId,
        invoice_number: item.number || 'SIN-NUMERO',
        supplier_nit: item.supplier_nit || item.company_nit || '900000000',
        supplier_name: item.supplier_name || item.company_name || 'Proveedor Factura',
        issue_date: item.issue_date ? new Date(item.issue_date) : new Date(),
        total_cop: Number(item.total || item.total_cop || 0),
        completed_events: false,
      },
      update: {
        invoice_number: item.number || undefined,
        total_cop: item.total ? Number(item.total) : undefined,
      },
    });

    return record;
  }

  async emitRadianEvent(tenantId: string, receptionId: string, eventType: string) {
    const record = await this.prisma.receivedSupplierInvoice.findUnique({
      where: { id: receptionId },
    });

    if (!record || record.tenant_id !== tenantId) {
      throw new NotFoundException(`Factura recibida ${receptionId} no encontrada.`);
    }

    const res = await this.factusClient.emitRadianEvent(
      tenantId,
      record.factus_reception_id,
      eventType,
    );

    const now = new Date();
    const updateData: any = {};

    if (eventType === FACTUS_RADIAN_EVENT_CODES.RECEIPT_ACQUIRER) {
      updateData.event_030_emitted_at = now;
    } else if (eventType === FACTUS_RADIAN_EVENT_CODES.RECEIPT_MERCHANDISE) {
      updateData.event_032_emitted_at = now;
    } else if (
      eventType === FACTUS_RADIAN_EVENT_CODES.EXPRESS_ACCEPTANCE ||
      eventType === FACTUS_RADIAN_EVENT_CODES.TACIT_ACCEPTANCE
    ) {
      updateData.event_033_or_034_emitted_at = now;
      updateData.completed_events = true;
    }

    const updated = await this.prisma.receivedSupplierInvoice.update({
      where: { id: receptionId },
      data: updateData,
    });

    return {
      success: true,
      event_type: eventType,
      record: updated,
      factus_response: res,
    };
  }

  // ---------------------------------------------------------------------------
  // 5. ESTADO DE RESULTADOS OPERATIVO (P&L - PROFIT AND LOSS)
  // ---------------------------------------------------------------------------

  async getProfitAndLoss(
    tenantId: string,
    branchId: string | undefined,
    fromStr: string,
    toStr: string,
  ): Promise<ProfitAndLossResult> {
    const fromDate = new Date(fromStr);
    const toDate = new Date(toStr);

    const branchFilter = branchId ? { branch_id: branchId } : {};

    // 1. Ingresos Netos de Ventas (Pedidos pagados en el periodo)
    const paidOrders = await this.prisma.order.findMany({
      where: {
        tenant_id: tenantId,
        ...branchFilter,
        payment_status: 'PAID',
        created_at: { gte: fromDate, lte: toDate },
      },
      select: {
        subtotal_products_cop: true,
        delivery_fee_cop: true,
      },
    });

    const netSalesRevenueCop = paidOrders.reduce(
      (acc, ord) => acc + ord.subtotal_products_cop + ord.delivery_fee_cop,
      0,
    );

    // 2. Costo de Ventas Teórico de Insumos (COGS)
    // Para gastronomía, si se registran gastos de compra de ingredientes, se toma de INGREDIENTS_PURCHASE
    const ingredientsExpenses = await this.prisma.expenseDocument.findMany({
      where: {
        tenant_id: tenantId,
        ...branchFilter,
        category: 'INGREDIENTS_PURCHASE',
        status: 'CONFIRMED',
        occurred_at: { gte: fromDate, lte: toDate },
      },
      select: { subtotal_cop: true },
    });

    const cogsRecipeConsumptionCop = ingredientsExpenses.reduce(
      (acc, exp) => acc + exp.subtotal_cop,
      0,
    );

    // 3. Gastos Operativos (OPEX: servicios, arriendos, mantenimiento, etc.)
    const opexExpenses = await this.prisma.expenseDocument.findMany({
      where: {
        tenant_id: tenantId,
        ...branchFilter,
        category: { not: 'INGREDIENTS_PURCHASE' },
        status: 'CONFIRMED',
        occurred_at: { gte: fromDate, lte: toDate },
      },
      select: { grand_total_cop: true },
    });

    const operatingExpensesCop = opexExpenses.reduce(
      (acc, exp) => acc + exp.grand_total_cop,
      0,
    );

    // 4. Nómina Devengada (Sueldos y recargos brutos devengados)
    const payrolls = await this.prisma.payrollSettlement.findMany({
      where: {
        tenant_id: tenantId,
        ...branchFilter,
        created_at: { gte: fromDate, lte: toDate },
      },
      select: { gross_accrued_cop: true },
    });

    const grossPayrollCop = payrolls.reduce(
      (acc, p) => acc + p.gross_accrued_cop,
      0,
    );

    return calculateProfitAndLoss({
      netSalesRevenueCop,
      cogsRecipeConsumptionCop,
      operatingExpensesCop,
      grossPayrollCop,
    });
  }
}

