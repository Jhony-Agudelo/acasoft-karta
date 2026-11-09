import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { FactusCryptoService } from '../factus-integration/factus-crypto.service';
import { FactusAuthService } from '../factus-integration/factus-auth.service';
import { FactusV2ClientService } from '../factus-integration/factus-v2-client.service';
import {
  FactusTenantConfigInputDto,
  EmitElectronicInvoiceDto,
  EmitCreditNoteDto,
  mapOrderToFactusBill,
  roundTo2Decimals,
  FACTUS_FINAL_CONSUMER_DEFAULTS,
  FACTUS_PAYMENT_FORMS,
} from '@restaurante-saas/shared';

@Injectable()
export class InvoicingService {
  private readonly logger = new Logger(InvoicingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: FactusCryptoService,
    private readonly authService: FactusAuthService,
    private readonly factusClient: FactusV2ClientService,
  ) {}

  /**
   * Obtiene la configuración pública de Factus v2 del restaurante (sin exponer contraseñas)
   */
  async getFactusConfig(tenantId: string) {
    const config = await this.prisma.factusTenantConfig.findUnique({
      where: { tenant_id: tenantId },
    });

    if (!config) {
      return {
        is_configured: false,
        environment: 'SANDBOX',
        api_base_url: 'https://api-sandbox.factus.com.co',
        invoicing_trigger_mode: 'CASHIER_CHOICE',
        default_municipality_code: '66400',
        default_tribute_code: '01',
        is_active: false,
      };
    }

    return {
      is_configured: true,
      environment: config.environment,
      api_base_url: config.api_base_url,
      invoicing_trigger_mode: config.invoicing_trigger_mode,
      default_municipality_code: config.default_municipality_code,
      default_tribute_code: config.default_tribute_code,
      is_active: config.is_active,
      updated_at: config.updated_at,
    };
  }

  /**
   * Guarda o actualiza las credenciales OAuth2 de Factus v2 tras verificar la conexión en vivo
   */
  async saveFactusConfig(tenantId: string, dto: FactusTenantConfigInputDto) {
    // 1. Probar credenciales contra /oauth/token antes de persistir
    const testResult = await this.authService.testRawCredentials(
      dto.api_base_url,
      dto.client_id,
      dto.client_secret,
      dto.username,
      dto.password,
    );

    if (!testResult.success) {
      throw new BadRequestException(
        `Las credenciales de Factus API v2 son inválidas o no permitieron autenticar: ${testResult.message}`,
      );
    }

    // 2. Invalida token previo en memoria
    this.authService.invalidateTenantToken(tenantId);

    // 3. Cifra credenciales y guarda en PostgreSQL
    const encryptedClientId = this.crypto.encrypt(dto.client_id);
    const encryptedClientSecret = this.crypto.encrypt(dto.client_secret);
    const encryptedUsername = this.crypto.encrypt(dto.username);
    const encryptedPassword = this.crypto.encrypt(dto.password);

    const saved = await this.prisma.factusTenantConfig.upsert({
      where: { tenant_id: tenantId },
      create: {
        tenant_id: tenantId,
        environment: dto.environment,
        api_base_url: dto.api_base_url,
        encrypted_client_id: encryptedClientId,
        encrypted_client_secret: encryptedClientSecret,
        encrypted_username: encryptedUsername,
        encrypted_password: encryptedPassword,
        invoicing_trigger_mode: dto.invoicing_trigger_mode,
        default_municipality_code: dto.default_municipality_code,
        default_tribute_code: dto.default_tribute_code,
        is_active: dto.is_active,
      },
      update: {
        environment: dto.environment,
        api_base_url: dto.api_base_url,
        encrypted_client_id: encryptedClientId,
        encrypted_client_secret: encryptedClientSecret,
        encrypted_username: encryptedUsername,
        encrypted_password: encryptedPassword,
        invoicing_trigger_mode: dto.invoicing_trigger_mode,
        default_municipality_code: dto.default_municipality_code,
        default_tribute_code: dto.default_tribute_code,
        is_active: dto.is_active,
        encrypted_access_token: null, // Forzar regeneración
        encrypted_refresh_token: null,
        token_expires_at: null,
      },
    });

    return {
      success: true,
      message: 'Configuración de Factus API v2 verificada y guardada correctamente.',
      config: {
        environment: saved.environment,
        api_base_url: saved.api_base_url,
        invoicing_trigger_mode: saved.invoicing_trigger_mode,
        default_municipality_code: saved.default_municipality_code,
        default_tribute_code: saved.default_tribute_code,
        is_active: saved.is_active,
      },
    };
  }

  /**
   * Sincroniza los rangos de numeración activos desde Factus v2 hacia branch_numbering_ranges
   */
  async syncNumberingRanges(tenantId: string, branchId: string) {
    // 1. Obtener rangos estándar (Facturas '21', Notas '22'/'23', Doc Soporte '24'/'25')
    const generalRangesRes = await this.factusClient.getNumberingRanges(tenantId);
    // 2. Obtener rangos de nómina electrónica (Nómina '26', Ajuste '27')
    let payrollRangesRes: any = null;
    try {
      payrollRangesRes = await this.factusClient.getPayrollNumberingRanges(tenantId);
    } catch (pErr) {
      this.logger.warn(`No se pudieron sincronizar rangos de nómina: ${(pErr as Error).message}`);
    }

    const generalList = Array.isArray(generalRangesRes?.data?.data)
      ? generalRangesRes.data.data
      : Array.isArray(generalRangesRes?.data)
      ? generalRangesRes.data
      : [];

    const payrollList = Array.isArray(payrollRangesRes?.data?.data)
      ? payrollRangesRes.data.data
      : Array.isArray(payrollRangesRes?.data)
      ? payrollRangesRes.data
      : [];

    const synced: any[] = [];

    // Mapeo de rangos estándar
    for (const range of generalList) {
      if (!range.is_active && range.is_active !== undefined) continue;

      const docCode = String(range.document_type_code || range.document || '21');
      const factusRangeId = String(range.id);
      const prefix = range.prefix || '';
      const resolution = range.resolution_number || null;
      const current = BigInt(range.current || range.from || 1);

      const record = await this.prisma.branchNumberingRange.upsert({
        where: {
          uq_branch_numbering_ranges_doc_type: {
            tenant_id: tenantId,
            branch_id: branchId,
            document_type_code: docCode,
          },
        },
        create: {
          tenant_id: tenantId,
          branch_id: branchId,
          document_type_code: docCode,
          factus_range_id: factusRangeId,
          prefix,
          resolution_number: resolution,
          current_consecutive: current,
          is_active: true,
        },
        update: {
          factus_range_id: factusRangeId,
          prefix,
          resolution_number: resolution,
          current_consecutive: current,
          is_active: true,
        },
      });

      synced.push({
        id: record.id,
        document_type_code: record.document_type_code,
        factus_range_id: record.factus_range_id,
        prefix: record.prefix,
        current: Number(record.current_consecutive),
      });
    }

    // Mapeo de rangos de nómina
    for (const pRange of payrollList) {
      if (!pRange.is_active && pRange.is_active !== undefined) continue;

      const docCode = String(pRange.document_type_code || '26');
      const factusRangeId = String(pRange.id); // Alfanumérico ULID
      const prefix = pRange.prefix || '';
      const resolution = pRange.resolution_number || null;
      const current = BigInt(pRange.current || pRange.from || 1);

      const record = await this.prisma.branchNumberingRange.upsert({
        where: {
          uq_branch_numbering_ranges_doc_type: {
            tenant_id: tenantId,
            branch_id: branchId,
            document_type_code: docCode,
          },
        },
        create: {
          tenant_id: tenantId,
          branch_id: branchId,
          document_type_code: docCode,
          factus_range_id: factusRangeId,
          prefix,
          resolution_number: resolution,
          current_consecutive: current,
          is_active: true,
        },
        update: {
          factus_range_id: factusRangeId,
          prefix,
          resolution_number: resolution,
          current_consecutive: current,
          is_active: true,
        },
      });

      synced.push({
        id: record.id,
        document_type_code: record.document_type_code,
        factus_range_id: record.factus_range_id,
        prefix: record.prefix,
        current: Number(record.current_consecutive),
      });
    }

    return {
      success: true,
      message: `Se sincronizaron ${synced.length} rangos de numeración para la sucursal.`,
      ranges: synced,
    };
  }

  /**
   * Consulta datos de un adquirente: primero en caché local tax_customer_profiles;
   * si no existe, consulta en tiempo real a Factus v2 (/v2/dian/acquirer).
   */
  async lookupAcquirer(tenantId: string, docCode: string, docNumber: string) {
    const cleanDoc = docNumber.trim();

    // 1. Buscar en caché local
    const local = await this.prisma.taxCustomerProfile.findUnique({
      where: {
        uq_tax_customer_profiles_id: {
          tenant_id: tenantId,
          identification_document_code: docCode,
          identification: cleanDoc,
        },
      },
    });

    if (local) {
      return {
        source: 'LOCAL_CACHE',
        found: true,
        data: local,
      };
    }

    // 2. Consultar en vivo a la DIAN vía Factus v2
    try {
      const dianRes = await this.factusClient.lookupAcquirer(tenantId, docCode, cleanDoc);
      const dianData = dianRes?.data;

      if (!dianData) {
        return {
          source: 'DIAN_FACTUS',
          found: false,
          data: null,
        };
      }

      const isCompany = docCode === '31' || Boolean(dianData.company);
      const legalOrg = isCompany ? '1' : '2';

      // 3. Guardar en caché local para acelerar próximas consultas
      const profile = await this.prisma.taxCustomerProfile.upsert({
        where: {
          uq_tax_customer_profiles_id: {
            tenant_id: tenantId,
            identification_document_code: docCode,
            identification: cleanDoc,
          },
        },
        create: {
          tenant_id: tenantId,
          identification_document_code: docCode,
          identification: cleanDoc,
          dv: dianData.dv || null,
          legal_organization_code: legalOrg,
          names: !isCompany ? (dianData.names || dianData.name || null) : null,
          company: isCompany ? (dianData.company || dianData.name || null) : null,
          trade_name: dianData.trade_name || null,
          email: dianData.email || null,
          phone: dianData.phone || null,
          address: dianData.address || null,
          municipality_code: dianData.municipality_code || '66400',
          tribute_code: dianData.tribute_code || (isCompany ? '01' : 'ZZ'),
          responsibilities: Array.isArray(dianData.responsibilities) ? dianData.responsibilities : ['R-99-PN'],
        },
        update: {
          names: !isCompany ? (dianData.names || dianData.name || null) : null,
          company: isCompany ? (dianData.company || dianData.name || null) : null,
          email: dianData.email || undefined,
          phone: dianData.phone || undefined,
          address: dianData.address || undefined,
        },
      });

      return {
        source: 'DIAN_FACTUS',
        found: true,
        data: profile,
      };
    } catch (lookupErr) {
      this.logger.warn(`No se encontró adquirente en DIAN para ${docCode}-${cleanDoc}: ${(lookupErr as Error).message}`);
      return {
        source: 'DIAN_FACTUS',
        found: false,
        data: null,
      };
    }
  }

  /**
   * Emite y valida la Factura Electrónica de Venta para un Pedido (Order)
   */
  async emitOrderElectronicInvoice(
    tenantId: string,
    orderId: string,
    userId: string,
    dto: EmitElectronicInvoiceDto,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        payments: true,
        branch: true,
      },
    });

    if (!order || order.tenant_id !== tenantId) {
      throw new NotFoundException(`Pedido ${orderId} no encontrado.`);
    }

    if (order.status === 'CANCELLED') {
      throw new BadRequestException('No se puede emitir factura electrónica para un pedido cancelado.');
    }

    // Verificar si ya tiene factura validada
    const existingDoc = await this.prisma.electronicFiscalDocument.findFirst({
      where: {
        tenant_id: tenantId,
        order_id: orderId,
        doc_category: 'BILL',
        status: 'VALIDATED',
      },
    });

    if (existingDoc) {
      return {
        already_emitted: true,
        fiscal_document: existingDoc,
      };
    }

    // Obtener rango de numeración activo para facturas ('21')
    const range = await this.prisma.branchNumberingRange.findUnique({
      where: {
        uq_branch_numbering_ranges_doc_type: {
          tenant_id: tenantId,
          branch_id: order.branch_id,
          document_type_code: '21',
        },
      },
    });

    if (!range || !range.is_active) {
      throw new BadRequestException(
        'No se ha configurado un rango de numeración activo para Facturas de Venta (código 21) en esta sucursal. Sincronice los rangos en Ajustes.',
      );
    }

    const numberingRangeId = parseInt(range.factus_range_id, 10);
    if (isNaN(numberingRangeId)) {
      throw new BadRequestException(
        `El ID de rango de numeración '${range.factus_range_id}' no es un número entero válido para Facturas.`,
      );
    }

    // Código de referencia único e idempotente
    const referenceCode = order.order_code
      ? `KARTA-ORD-${order.order_code}`
      : `KARTA-ORD-${order.id.slice(0, 8)}`;

    // Mapear los ítems del pedido a la estructura exacta de Factus v2
    const itemsForFactus = order.items.map((it) => {
      const pSnap = it.product_snapshot_json as any;
      const tSnap = it.tax_snapshot_json as any;
      return {
        code_reference: it.id.slice(0, 8),
        name: pSnap?.name || pSnap?.product_name || 'Producto',
        quantity: it.quantity,
        line_total_cop: it.line_total_cop,
        unit_price_cop: it.unit_price_cop,
        discount_cop: it.discount_cop,
        tax_type: (tSnap?.tax_type as any) || 'INC',
        tax_rate_bp: typeof tSnap?.tax_rate_bp === 'number' ? tSnap.tax_rate_bp : 800,
      };
    });

    const paymentsForFactus = order.payments.map((p) => ({
      method: p.method,
      amount_cop: p.amount_cop,
      payment_form: FACTUS_PAYMENT_FORMS.CASH_IMMEDIATE,
    }));

    const { payload, cashRoundingAmount } = mapOrderToFactusBill({
      numbering_range_id: numberingRangeId,
      reference_code: referenceCode,
      items: itemsForFactus,
      delivery_fee_cop: order.delivery_fee_cop,
      tip_cop: order.tip_cop,
      paid_total_cop: order.grand_total_cop,
      customer_mode: dto.customer_mode,
      customer: dto.customer,
      branch: {
        name: order.branch.name,
        address: order.branch.address,
        phone: order.branch.phone_whatsapp_e164,
      },
      payments: paymentsForFactus,
    });

    // Idempotencia y Limpieza: eliminar borrador previo no validado si quedó bloqueando el reference_code
    await this.factusClient.destroyBillDraftByReference(tenantId, referenceCode);

    // Enviar y validar factura en Factus v2
    const factusRes = await this.factusClient.validateBill(tenantId, payload);
    const billData = factusRes?.data?.bill || factusRes?.data;

    if (!billData || !billData.number) {
      throw new BadRequestException('Factus no devolvió los datos de la factura validada.');
    }

    // Persistir documento fiscal en electronic_fiscal_documents
    const fiscalDoc = await this.prisma.electronicFiscalDocument.create({
      data: {
        tenant_id: tenantId,
        branch_id: order.branch_id,
        doc_category: 'BILL',
        customer_mode: dto.customer_mode,
        reference_code: referenceCode,
        order_id: order.id,
        factus_number: billData.number,
        prefix: billData.prefix || range.prefix,
        cufe_or_cude: billData.cufe || null,
        qr_url: billData.qr || null,
        qr_image_base64: billData.qr_image || null,
        status: 'VALIDATED',
        total_cop: order.grand_total_cop,
        cash_rounding_cop_cents: cashRoundingAmount,
        customer_or_provider_snapshot_json: payload.customer as any,
        request_payload_json: payload as any,
        response_payload_json: factusRes as any,
        validated_at: new Date(),
        created_by: userId,
      },
    });

    // Si fue cliente con datos (NAMED_CUSTOMER), actualizar en tax_customer_profiles
    if (dto.customer_mode === 'NAMED_CUSTOMER' && dto.customer?.identification) {
      await this.prisma.taxCustomerProfile.upsert({
        where: {
          uq_tax_customer_profiles_id: {
            tenant_id: tenantId,
            identification_document_code: dto.customer.identification_document_code || '13',
            identification: dto.customer.identification,
          },
        },
        create: {
          tenant_id: tenantId,
          identification_document_code: dto.customer.identification_document_code || '13',
          identification: dto.customer.identification,
          names: dto.customer.names || null,
          company: dto.customer.company || null,
          email: dto.customer.email || null,
          phone: dto.customer.phone || null,
          address: dto.customer.address || null,
          municipality_code: dto.customer.municipality_code || '66400',
        },
        update: {
          names: dto.customer.names || undefined,
          company: dto.customer.company || undefined,
          email: dto.customer.email || undefined,
          phone: dto.customer.phone || undefined,
          address: dto.customer.address || undefined,
        },
      });
    }

    return {
      already_emitted: false,
      fiscal_document: fiscalDoc,
    };
  }

  /**
   * Emite y valida la Factura Electrónica de Venta para una Cuenta de Salón (DiningAccount)
   */
  async emitAccountElectronicInvoice(
    tenantId: string,
    accountId: string,
    userId: string,
    dto: EmitElectronicInvoiceDto,
  ) {
    const account = await this.prisma.diningAccount.findUnique({
      where: { id: accountId },
      include: {
        orders: {
          include: {
            items: true,
          },
        },
        payments: true,
        table: true,
      },
    });

    if (!account || account.tenant_id !== tenantId) {
      throw new NotFoundException(`Cuenta de salón ${accountId} no encontrada.`);
    }

    const branch = await this.prisma.branch.findUnique({
      where: { id: account.branch_id },
    });

    if (!branch) {
      throw new NotFoundException(`Sucursal de la cuenta no encontrada.`);
    }

    const existingDoc = await this.prisma.electronicFiscalDocument.findFirst({
      where: {
        tenant_id: tenantId,
        account_id: accountId,
        doc_category: 'BILL',
        status: 'VALIDATED',
      },
    });

    if (existingDoc) {
      return {
        already_emitted: true,
        fiscal_document: existingDoc,
      };
    }

    const range = await this.prisma.branchNumberingRange.findUnique({
      where: {
        uq_branch_numbering_ranges_doc_type: {
          tenant_id: tenantId,
          branch_id: account.branch_id,
          document_type_code: '21',
        },
      },
    });

    if (!range || !range.is_active) {
      throw new BadRequestException(
        'No se ha configurado un rango de numeración activo para Facturas de Venta (código 21) en esta sucursal.',
      );
    }

    const numberingRangeId = parseInt(range.factus_range_id, 10);
    const referenceCode = `KARTA-ACC-${account.account_code}`;

    // Consolidar todos los ítems de las órdenes de la cuenta
    const allItems = account.orders.flatMap((o) => o.items);
    const itemsForFactus = allItems.map((it) => {
      const pSnap = it.product_snapshot_json as any;
      const tSnap = it.tax_snapshot_json as any;
      return {
        code_reference: it.id.slice(0, 8),
        name: pSnap?.name || pSnap?.product_name || 'Producto',
        quantity: it.quantity,
        line_total_cop: it.line_total_cop,
        unit_price_cop: it.unit_price_cop,
        discount_cop: it.discount_cop,
        tax_type: (tSnap?.tax_type as any) || 'INC',
        tax_rate_bp: typeof tSnap?.tax_rate_bp === 'number' ? tSnap.tax_rate_bp : 800,
      };
    });

    const paymentsForFactus = account.payments.map((p) => ({
      method: p.method,
      amount_cop: p.amount_cop,
      payment_form: FACTUS_PAYMENT_FORMS.CASH_IMMEDIATE,
    }));

    const { payload, cashRoundingAmount } = mapOrderToFactusBill({
      numbering_range_id: numberingRangeId,
      reference_code: referenceCode,
      items: itemsForFactus,
      delivery_fee_cop: 0,
      tip_cop: account.tip_cop,
      paid_total_cop: account.paid_total_cop,
      customer_mode: dto.customer_mode,
      customer: dto.customer,
      branch: {
        name: branch.name,
        address: branch.address,
        phone: branch.phone_whatsapp_e164,
      },
      payments: paymentsForFactus,
    });

    await this.factusClient.destroyBillDraftByReference(tenantId, referenceCode);

    const factusRes = await this.factusClient.validateBill(tenantId, payload);
    const billData = factusRes?.data?.bill || factusRes?.data;

    if (!billData || !billData.number) {
      throw new BadRequestException('Factus no devolvió los datos de la factura validada.');
    }

    const fiscalDoc = await this.prisma.electronicFiscalDocument.create({
      data: {
        tenant_id: tenantId,
        branch_id: account.branch_id,
        doc_category: 'BILL',
        customer_mode: dto.customer_mode,
        reference_code: referenceCode,
        account_id: account.id,
        factus_number: billData.number,
        prefix: billData.prefix || range.prefix,
        cufe_or_cude: billData.cufe || null,
        qr_url: billData.qr || null,
        qr_image_base64: billData.qr_image || null,
        status: 'VALIDATED',
        total_cop: account.paid_total_cop,
        cash_rounding_cop_cents: cashRoundingAmount,
        customer_or_provider_snapshot_json: payload.customer as any,
        request_payload_json: payload as any,
        response_payload_json: factusRes as any,
        validated_at: new Date(),
        created_by: userId,
      },
    });

    return {
      already_emitted: false,
      fiscal_document: fiscalDoc,
    };
  }

  /**
   * Emite y valida una Nota Crédito Electrónica vinculada a una Factura
   */
  async emitCreditNote(
    tenantId: string,
    fiscalDocId: string,
    userId: string,
    dto: EmitCreditNoteDto,
  ) {
    const originalDoc = await this.prisma.electronicFiscalDocument.findUnique({
      where: { id: fiscalDocId },
    });

    if (!originalDoc || originalDoc.tenant_id !== tenantId) {
      throw new NotFoundException(`Documento fiscal ${fiscalDocId} no encontrado.`);
    }

    if (originalDoc.status !== 'VALIDATED') {
      throw new BadRequestException('Solo se pueden emitir notas crédito sobre facturas en estado VALIDATED.');
    }

    if (originalDoc.doc_category !== 'BILL') {
      throw new BadRequestException('Solo las facturas electrónicas (BILL) admiten notas crédito.');
    }

    // Rango de numeración para notas crédito ('22')
    const range = await this.prisma.branchNumberingRange.findUnique({
      where: {
        uq_branch_numbering_ranges_doc_type: {
          tenant_id: tenantId,
          branch_id: originalDoc.branch_id,
          document_type_code: '22',
        },
      },
    });

    if (!range || !range.is_active) {
      throw new BadRequestException(
        'No se ha configurado un rango de numeración activo para Notas Crédito (código 22) en esta sucursal.',
      );
    }

    const numberingRangeId = parseInt(range.factus_range_id, 10);
    const ncRefCode = `NC-${originalDoc.reference_code}`;

    const originalReq = originalDoc.request_payload_json as any;

    const creditNotePayload = {
      numbering_range_id: numberingRangeId,
      reference_code: ncRefCode,
      correction_concept_code: dto.correction_concept_code,
      observation: dto.reason_description,
      bill_number: originalDoc.factus_number,
      customer: originalReq.customer,
      establishment: originalReq.establishment,
      items: originalReq.items,
      allowance_charges: originalReq.allowance_charges,
      cash_rounding_amount: originalDoc.cash_rounding_cop_cents,
      payment_details: originalReq.payment_details,
    };

    await this.factusClient.destroyCreditNoteDraftByReference(tenantId, ncRefCode);

    const cnRes = await this.factusClient.validateCreditNote(tenantId, creditNotePayload);
    const cnData = cnRes?.data?.credit_note || cnRes?.data;

    // Actualizar estado de la factura original
    await this.prisma.electronicFiscalDocument.update({
      where: { id: originalDoc.id },
      data: { status: 'ANNULLED_BY_NOTE' },
    });

    // Guardar la nota crédito
    const creditNoteDoc = await this.prisma.electronicFiscalDocument.create({
      data: {
        tenant_id: tenantId,
        branch_id: originalDoc.branch_id,
        doc_category: 'CREDIT_NOTE',
        customer_mode: originalDoc.customer_mode,
        reference_code: ncRefCode,
        parent_fiscal_doc_id: originalDoc.id,
        order_id: originalDoc.order_id,
        account_id: originalDoc.account_id,
        factus_number: cnData.number,
        prefix: cnData.prefix || range.prefix,
        cufe_or_cude: cnData.cude || null,
        qr_url: cnData.qr || null,
        qr_image_base64: cnData.qr_image || null,
        status: 'VALIDATED',
        total_cop: originalDoc.total_cop,
        cash_rounding_cop_cents: originalDoc.cash_rounding_cop_cents,
        customer_or_provider_snapshot_json: originalDoc.customer_or_provider_snapshot_json as any,
        request_payload_json: creditNotePayload as any,
        response_payload_json: cnRes as any,
        validated_at: new Date(),
        created_by: userId,
      },
    });

    return creditNoteDoc;
  }

  /**
   * Proxy para descargar PDF oficial
   */
  async downloadDocumentPdf(tenantId: string, fiscalDocId: string) {
    const doc = await this.prisma.electronicFiscalDocument.findUnique({
      where: { id: fiscalDocId },
    });
    if (!doc || doc.tenant_id !== tenantId || !doc.factus_number) {
      throw new NotFoundException('Documento fiscal no encontrado o sin número Factus.');
    }

    if (doc.doc_category === 'CREDIT_NOTE') {
      return this.factusClient.downloadCreditNotePdf(tenantId, doc.factus_number);
    }
    return this.factusClient.downloadBillPdf(tenantId, doc.factus_number);
  }

  /**
   * Proxy para descargar XML oficial
   */
  async downloadDocumentXml(tenantId: string, fiscalDocId: string) {
    const doc = await this.prisma.electronicFiscalDocument.findUnique({
      where: { id: fiscalDocId },
    });
    if (!doc || doc.tenant_id !== tenantId || !doc.factus_number) {
      throw new NotFoundException('Documento fiscal no encontrado o sin número Factus.');
    }
    return this.factusClient.downloadBillXml(tenantId, doc.factus_number);
  }

  /**
   * Reenvía la factura electrónica por correo al cliente
   */
  async sendDocumentEmail(tenantId: string, fiscalDocId: string) {
    const doc = await this.prisma.electronicFiscalDocument.findUnique({
      where: { id: fiscalDocId },
    });
    if (!doc || doc.tenant_id !== tenantId || !doc.factus_number) {
      throw new NotFoundException('Documento fiscal no encontrado o sin número Factus.');
    }
    return this.factusClient.sendBillEmail(tenantId, doc.factus_number);
  }
}
