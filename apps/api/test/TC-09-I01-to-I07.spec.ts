import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createTestApp } from './test-app';
import { PrismaService } from '../src/database/prisma.service';
import { FactusV2ClientService } from '../src/modules/factus-integration/factus-v2-client.service';
import { FactusAuthService } from '../src/modules/factus-integration/factus-auth.service';

describe('Integración Fase 09: TC-09-I01 a TC-09-I07 (Factus API v2, Finanzas y Nómina)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let factusClient: FactusV2ClientService;
  let factusAuth: FactusAuthService;

  beforeAll(async () => {
    const testContext = await createTestApp();
    app = testContext.app;
    prisma = testContext.prisma;
    jwtService = app.get(JwtService);
    factusClient = app.get(FactusV2ClientService);
    factusAuth = app.get(FactusAuthService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerRestaurant(prefix: string) {
    const ts = Date.now() + Math.floor(Math.random() * 100000);
    const cleanPrefix = prefix.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const slug = `${cleanPrefix}-${ts}`;
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        organization_name: `Restaurante ${prefix}`,
        slug,
        admin_name: `Admin ${prefix}`,
        admin_email: `${cleanPrefix}_${ts}@karta.co`,
        admin_password: 'Password123!',
        admin_phone: '3001234567',
        initial_profile: 'DINING_ROOM',
      })
      .expect(201);

    const tenantId = res.body.tenant.id as string;
    const branchId = res.body.branch.id as string;
    const adminUserId = res.body.user.id as string;

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { plan_id: 'PLAN_ENTERPRISE_DINING' },
    });

    const modulesToEnable = [
      'ordering',
      'order_panel',
      'payments.manual',
      'payments.cash_shifts',
      'dining',
      'reporting',
      'invoicing.electronic_dian',
      'finance.expenses_dse',
      'payroll.electronic_dian',
    ];

    for (const modKey of modulesToEnable) {
      await prisma.planEntitlement.upsert({
        where: {
          plan_id_module_key: {
            plan_id: 'PLAN_ENTERPRISE_DINING',
            module_key: modKey,
          },
        },
        create: {
          plan_id: 'PLAN_ENTERPRISE_DINING',
          module_key: modKey,
        },
        update: {},
      });

      const existing = await prisma.tenantModuleSetting.findFirst({
        where: { tenant_id: tenantId, module_key: modKey },
      });
      if (existing) {
        await prisma.tenantModuleSetting.update({
          where: { id: existing.id },
          data: { enabled: true },
        });
      } else {
        await prisma.tenantModuleSetting.create({
          data: {
            tenant_id: tenantId,
            branch_id: null,
            module_key: modKey,
            enabled: true,
          },
        });
      }
    }

    // Configurar rangos de numeración por defecto en la sucursal para pruebas
    await prisma.branchNumberingRange.createMany({
      data: [
        {
          tenant_id: tenantId,
          branch_id: branchId,
          document_type_code: '21', // Factura
          factus_range_id: '389',
          prefix: 'SETP',
          current_consecutive: BigInt(100),
          is_active: true,
        },
        {
          tenant_id: tenantId,
          branch_id: branchId,
          document_type_code: '22', // Nota Crédito
          factus_range_id: '390',
          prefix: 'NC',
          current_consecutive: BigInt(10),
          is_active: true,
        },
        {
          tenant_id: tenantId,
          branch_id: branchId,
          document_type_code: '24', // Documento Soporte
          factus_range_id: '2058',
          prefix: 'SEDS',
          current_consecutive: BigInt(50),
          is_active: true,
        },
        {
          tenant_id: tenantId,
          branch_id: branchId,
          document_type_code: '26', // Nómina Electrónica (ULID)
          factus_range_id: '01m3e5ywpwxdyhye7pqf8s563j',
          prefix: 'NEF',
          current_consecutive: BigInt(1),
          is_active: true,
        },
      ],
    });

    return {
      adminToken: res.body.accessToken as string,
      tenantId,
      branchId,
      adminUserId,
      slug,
    };
  }

  // ---------------------------------------------------------------------------
  // TC-09-I01: Flujo Dual en Caja POS: Factura a Consumidor Final vs Nominativa
  // ---------------------------------------------------------------------------
  it('TC-09-I01: Flujo Dual en Caja POS (Consumidor Final vs Nominativa con acquirer-lookup)', async () => {
    const r = await registerRestaurant('i01');

    // Mock Factus Client
    const validateBillSpy = vi.spyOn(factusClient, 'validateBill').mockImplementation(async (_tenantId, payload) => ({
      status: 'OK',
      data: {
        bill: {
          id: 991,
          number: 'SETP990001234',
          prefix: 'SETP',
          cufe: 'CUFE-TEST-1234567890ABCDEF',
          qr: 'https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=CUFE-TEST-1234567890ABCDEF',
          qr_image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA',
          status: 'VALIDATED',
        },
      },
    }));

    const acquirerSpy = vi.spyOn(factusClient, 'lookupAcquirer').mockImplementation(async (_t, docCode, docNum) => ({
      status: 'OK',
      data: {
        names: 'Cliente DIAN Verificado',
        company: null,
        email: 'cliente.dian@empresa.co',
        phone: '3001234567',
        address: 'Calle 100 # 15-20',
        municipality_code: '11001',
      },
    }));

    // Crear orden pagada
    const order = await prisma.order.create({
      data: {
        tenant_id: r.tenantId,
        branch_id: r.branchId,
        order_code: 'A101',
        origin: 'STOREFRONT',
        fulfillment_type: 'DINE_IN',
        status: 'DELIVERED',
        payment_policy: 'OFFLINE_ONLY',
        payment_status: 'PAID',
        customer_snapshot_json: {},
        tax_summary_snapshot_json: {},
        idempotency_key: `idem-${Date.now()}-${Math.random()}`,
        public_token: `token-${Date.now()}-${Math.random()}`,
        subtotal_products_cop: 32000,
        grand_total_cop: 32000,
        paid_total_cop: 32000,
        items: {
          create: [
            {
              tenant_id: r.tenantId,
              product_snapshot_json: { name: 'Hamburguesa Doble' },
              quantity: 2,
              unit_price_cop: 16000,
              line_total_cop: 32000,
              modifiers_snapshot_json: [],
              tax_snapshot_json: { tax_type: 'INC', tax_rate_bp: 800 },
            },
          ],
        },
        payments: {
          create: [
            {
              tenant_id: r.tenantId,
              branch_id: r.branchId,
              method: 'CASH',
              amount_cop: 32000,
              status: 'APPROVED',
              idempotency_key: `pay-1-${Date.now()}-${Math.random()}`,
              created_by: r.adminUserId,
            },
          ],
        },
      },
    });

    // Escenario A: Emisión a Consumidor Final (222222222222)
    const resA = await request(app.getHttpServer())
      .post(`/api/v1/orders/${order.id}/electronic-invoice`)
      .set('Authorization', `Bearer ${r.adminToken}`)
      .send({
        customer_mode: 'FINAL_CONSUMER',
      })
      .expect(201);

    expect(resA.body.fiscal_document).toBeDefined();
    expect(resA.body.fiscal_document.factus_number).toBe('SETP990001234');
    expect(resA.body.fiscal_document.cufe_or_cude).toBe('CUFE-TEST-1234567890ABCDEF');
    expect(resA.body.fiscal_document.customer_mode).toBe('FINAL_CONSUMER');
    expect(acquirerSpy).not.toHaveBeenCalled(); // Consumidor final NO consume lookup

    // Escenario B: Consulta de Adquirente DIAN y Emisión Nominativa
    const lookupRes = await request(app.getHttpServer())
      .get('/api/v1/invoicing/acquirer-lookup?doc_code=13&doc_number=1020304050')
      .set('Authorization', `Bearer ${r.adminToken}`)
      .expect(200);

    expect(lookupRes.body.found).toBe(true);
    expect(lookupRes.body.data.names).toBe('Cliente DIAN Verificado');
    expect(lookupRes.body.data.email).toBe('cliente.dian@empresa.co');
    expect(acquirerSpy).toHaveBeenCalledWith(r.tenantId, '13', '1020304050');

    // Segunda orden para factura nominativa
    const order2 = await prisma.order.create({
      data: {
        tenant_id: r.tenantId,
        branch_id: r.branchId,
        order_code: 'A102',
        origin: 'STOREFRONT',
        fulfillment_type: 'DINE_IN',
        status: 'DELIVERED',
        payment_policy: 'OFFLINE_ONLY',
        payment_status: 'PAID',
        customer_snapshot_json: {},
        tax_summary_snapshot_json: {},
        idempotency_key: `idem-2-${Date.now()}-${Math.random()}`,
        public_token: `token-2-${Date.now()}-${Math.random()}`,
        subtotal_products_cop: 50000,
        grand_total_cop: 50000,
        paid_total_cop: 50000,
        items: {
          create: [
            {
              tenant_id: r.tenantId,
              product_snapshot_json: { name: 'Parrillada Mixta' },
              quantity: 1,
              unit_price_cop: 50000,
              line_total_cop: 50000,
              modifiers_snapshot_json: [],
              tax_snapshot_json: { tax_type: 'INC', tax_rate_bp: 800 },
            },
          ],
        },
        payments: {
          create: [
            {
              tenant_id: r.tenantId,
              branch_id: r.branchId,
              method: 'CASH',
              amount_cop: 50000,
              status: 'APPROVED',
              idempotency_key: `pay-2-${Date.now()}-${Math.random()}`,
              created_by: r.adminUserId,
            },
          ],
        },
      },
    });

    const resB = await request(app.getHttpServer())
      .post(`/api/v1/orders/${order2.id}/electronic-invoice`)
      .set('Authorization', `Bearer ${r.adminToken}`)
      .send({
        customer_mode: 'NAMED_CUSTOMER',
        customer: {
          identification_document_code: '13',
          identification: '1020304050',
          names: 'Cliente DIAN Verificado',
          email: 'cliente.dian@empresa.co',
          phone: '3001234567',
          address: 'Calle 100 # 15-20',
        },
      })
      .expect(201);

    expect(resB.body.fiscal_document.customer_mode).toBe('NAMED_CUSTOMER');
    expect(resB.body.fiscal_document.status).toBe('VALIDATED');

    // Verificar persistencia en tax_customer_profiles
    const profile = await prisma.taxCustomerProfile.findUnique({
      where: {
        uq_tax_customer_profiles_id: {
          tenant_id: r.tenantId,
          identification_document_code: '13',
          identification: '1020304050',
        },
      },
    });
    expect(profile).toBeDefined();
    expect(profile?.names).toBe('Cliente DIAN Verificado');

    validateBillSpy.mockRestore();
    acquirerSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // TC-09-I02: Recuperación ante Colisión de Borrador No Validado
  // ---------------------------------------------------------------------------
  it('TC-09-I02: Recuperación ante Colisión de Borrador No Validado en Factus v2', async () => {
    const r = await registerRestaurant('i02');

    const destroySpy = vi.spyOn(factusClient, 'destroyBillDraftByReference').mockResolvedValue({ status: 'OK' });
    const validateBillSpy = vi.spyOn(factusClient, 'validateBill').mockResolvedValue({
      status: 'OK',
      data: {
        bill: {
          number: 'SETP990005555',
          cufe: 'CUFE-COLLISION-RECOVERED',
          status: 'VALIDATED',
        },
      },
    });

    const order = await prisma.order.create({
      data: {
        tenant_id: r.tenantId,
        branch_id: r.branchId,
        order_code: 'A103',
        origin: 'STOREFRONT',
        fulfillment_type: 'TAKE_OUT',
        status: 'DELIVERED',
        payment_policy: 'OFFLINE_ONLY',
        payment_status: 'PAID',
        customer_snapshot_json: {},
        tax_summary_snapshot_json: {},
        idempotency_key: `idem-i02-${Date.now()}-${Math.random()}`,
        public_token: `token-i02-${Date.now()}`,
        subtotal_products_cop: 20000,
        grand_total_cop: 20000,
        paid_total_cop: 20000,
        items: {
          create: [
            {
              tenant_id: r.tenantId,
              product_snapshot_json: { name: 'Arepa con Queso' },
              quantity: 1,
              unit_price_cop: 20000,
              line_total_cop: 20000,
              modifiers_snapshot_json: [],
              tax_snapshot_json: { tax_type: 'INC', tax_rate_bp: 800 },
            },
          ],
        },
        payments: {
          create: [
            {
              tenant_id: r.tenantId,
              branch_id: r.branchId,
              method: 'CASH',
              amount_cop: 20000,
              status: 'APPROVED',
              idempotency_key: `pay-i02-${Date.now()}-${Math.random()}`,
              created_by: r.adminUserId,
            },
          ],
        },
      },
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/orders/${order.id}/electronic-invoice`)
      .set('Authorization', `Bearer ${r.adminToken}`)
      .send({
        customer_mode: 'FINAL_CONSUMER',
      })
      .expect(201);

    expect(destroySpy).toHaveBeenCalledWith(r.tenantId, `KARTA-ORD-${order.order_code}`);
    expect(res.body.fiscal_document.status).toBe('VALIDATED');
    expect(res.body.fiscal_document.factus_number).toBe('SETP990005555');

    destroySpy.mockRestore();
    validateBillSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // TC-09-I03: Emisión de Nota Crédito Electrónica Vinculada
  // ---------------------------------------------------------------------------
  it('TC-09-I03: Emisión de Nota Crédito Vinculada y Anulación de Factura Original', async () => {
    const r = await registerRestaurant('i03');

    // 1. Crear documento fiscal en estado VALIDATED
    const originalDoc = await prisma.electronicFiscalDocument.create({
      data: {
        tenant_id: r.tenantId,
        branch_id: r.branchId,
        doc_category: 'BILL',
        customer_mode: 'FINAL_CONSUMER',
        reference_code: `KARTA-ORD-ORIG-${Date.now()}`,
        factus_number: 'SETP990007777',
        cufe_or_cude: 'CUFE-ORIGINAL-7777',
        status: 'VALIDATED',
        total_cop: 45000,
        customer_or_provider_snapshot_json: {},
        request_payload_json: {
          customer: { identification: '222222222222', names: 'Consumidor Final' },
          items: [{ code_reference: 'PROD', name: 'Almuerzo', quantity: '1.00', price: '45000.00' }],
        },
        created_by: r.adminUserId,
      },
    });

    const validateCreditNoteSpy = vi.spyOn(factusClient, 'validateCreditNote').mockResolvedValue({
      status: 'OK',
      data: {
        credit_note: {
          number: 'NC99000001',
          cude: 'CUDE-CREDIT-NOTE-1111',
          status: 'VALIDATED',
        },
      },
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/electronic-invoices/${originalDoc.id}/credit-note`)
      .set('Authorization', `Bearer ${r.adminToken}`)
      .send({
        correction_concept_code: '2', // Anulación de factura electrónica
        reason_description: 'Anulación total por solicitud del cliente',
      })
      .expect(201);

    expect(res.body.doc_category).toBe('CREDIT_NOTE');
    expect(res.body.factus_number).toBe('NC99000001');
    expect(res.body.cufe_or_cude).toBe('CUDE-CREDIT-NOTE-1111');

    // Verificar que la factura original cambió a ANNULLED_BY_NOTE
    const updatedOriginal = await prisma.electronicFiscalDocument.findUnique({
      where: { id: originalDoc.id },
    });
    expect(updatedOriginal?.status).toBe('ANNULLED_BY_NOTE');

    validateCreditNoteSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // TC-09-I04: Registro de Gasto en Efectivo, Turno de Caja y Documento Soporte
  // ---------------------------------------------------------------------------
  it('TC-09-I04: Registro de Gasto en Efectivo, Arqueo de Caja y Emisión de Documento Soporte', async () => {
    const r = await registerRestaurant('i04');

    // 1. Abrir turno de caja
    const shiftRes = await request(app.getHttpServer())
      .post(`/api/v1/branches/${r.branchId}/cash-shifts/open`)
      .set('Authorization', `Bearer ${r.adminToken}`)
      .send({
        opening_cash_cop: 100000,
      })
      .expect(201);

    const shiftId = shiftRes.body.shift?.id || shiftRes.body.id;

    // 2. Crear proveedor no obligado a facturar (informal)
    const supplier = await prisma.supplier.create({
      data: {
        tenant_id: r.tenantId,
        identification_document_code: '13',
        identification: '71999888',
        name: 'Don Pedro Verduras',
        address: 'Plaza Mayorista Bloque 5',
        municipality_code: '05001',
        is_obligated_to_invoice: false, // Sujeto a Documento Soporte
      },
    });

    // 3. Crear gasto de compra de insumos
    const expRes = await request(app.getHttpServer())
      .post(`/api/v1/branches/${r.branchId}/expenses`)
      .set('Authorization', `Bearer ${r.adminToken}`)
      .send({
        supplier_id: supplier.id,
        category: 'INGREDIENTS_PURCHASE',
        payment_form: '1',
        requires_support_document: true,
        items: [
          {
            name: 'Tomate Chonto (Kilos)',
            quantity: 10,
            price_cop: 4000,
          },
        ],
      })
      .expect(201);

    const expenseId = expRes.body.id;
    expect(expRes.body.grand_total_cop).toBe(40000);

    // 4. Pagar en EFECTIVO desde la caja del turno
    const payRes = await request(app.getHttpServer())
      .post(`/api/v1/expenses/${expenseId}/payments`)
      .set('Authorization', `Bearer ${r.adminToken}`)
      .send({
        method: 'CASH',
        amount_cop: 40000,
        reference_note: 'Pago contado de tomates',
      })
      .expect(201);

    expect(payRes.body.cash_shift_movement_id).toBeDefined();

    // Verificar que el turno acumuló la salida en efectivo (cash_out_total_cop = 40000)
    const shift = await prisma.cashShift.findUnique({ where: { id: shiftId } });
    expect(shift?.cash_out_total_cop).toBe(40000);

    // 5. Emitir Documento Soporte Electrónico ante Factus v2
    const validateSupportDocSpy = vi.spyOn(factusClient, 'validateSupportDocument').mockResolvedValue({
      status: 'OK',
      data: {
        support_document: {
          number: 'SEDS984000129',
          cude: 'CUDE-SUPPORT-DOC-129',
          status: 'VALIDATED',
        },
      },
    });

    const dseRes = await request(app.getHttpServer())
      .post(`/api/v1/expenses/${expenseId}/support-document`)
      .set('Authorization', `Bearer ${r.adminToken}`)
      .expect(201);

    expect(dseRes.body.fiscal_document.doc_category).toBe('SUPPORT_DOCUMENT');
    expect(dseRes.body.fiscal_document.factus_number).toBe('SEDS984000129');
    expect(dseRes.body.fiscal_document.cufe_or_cude).toBe('CUDE-SUPPORT-DOC-129');

    validateSupportDocSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // TC-09-I05: Recepción RADIAN y Emisión de Eventos 030, 032, 033
  // ---------------------------------------------------------------------------
  it('TC-09-I05: Recepción RADIAN y Emisión de Eventos 030, 032, 033', async () => {
    const r = await registerRestaurant('i05');

    const emitRadianSpy = vi.spyOn(factusClient, 'emitRadianEvent').mockResolvedValue({
      status: 'OK',
      message: 'Evento RADIAN emitido exitosamente',
      data: {},
    });

    // Crear factura recibida
    const reception = await prisma.receivedSupplierInvoice.create({
      data: {
        tenant_id: r.tenantId,
        branch_id: r.branchId,
        factus_reception_id: 'REC-BILL-5001',
        track_id_or_cufe: `CUFE-RADIAN-${Date.now()}`,
        invoice_number: 'FE-8812',
        supplier_nit: '900555666',
        supplier_name: 'Distribuidora Carnes y Lácteos S.A.S.',
        issue_date: new Date(),
        total_cop: 450000,
        completed_events: false,
      },
    });

    // Evento 030: Acuse de recibo de la factura
    const res030 = await request(app.getHttpServer())
      .patch(`/api/v1/receptions/${reception.id}/radian-events/030`)
      .set('Authorization', `Bearer ${r.adminToken}`)
      .expect(200);

    expect(res030.body.record.event_030_emitted_at).toBeDefined();

    // Evento 032: Recibo del bien o servicio
    const res032 = await request(app.getHttpServer())
      .patch(`/api/v1/receptions/${reception.id}/radian-events/032`)
      .set('Authorization', `Bearer ${r.adminToken}`)
      .expect(200);

    expect(res032.body.record.event_032_emitted_at).toBeDefined();

    // Evento 033: Aceptación expresa
    const res033 = await request(app.getHttpServer())
      .patch(`/api/v1/receptions/${reception.id}/radian-events/033`)
      .set('Authorization', `Bearer ${r.adminToken}`)
      .expect(200);

    expect(res033.body.record.event_033_or_034_emitted_at).toBeDefined();
    expect(res033.body.record.completed_events).toBe(true);

    emitRadianSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // TC-09-I06: Liquidación y Transmisión de Nómina a Factus v2 + Reporte P&L
  // ---------------------------------------------------------------------------
  it('TC-09-I06: Liquidación de Nómina de Personal sin Acceso (Aseo/Limpieza) y Reporte P&L', async () => {
    const r = await registerRestaurant('i06');

    // 1. Registrar personal de aseo/limpieza (SIN usuario de sistema, user_id: null)
    const empRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/branches/${r.branchId}/employees`)
      .set('Authorization', `Bearer ${r.adminToken}`)
      .send({
        employee_code: 'EMP-ASEO-01',
        user_id: null, // Personal operativo sin login
        job_title: 'Personal de Aseo y Servicios Generales',
        department: 'Servicios Generales',
        has_system_access: false,
        identification_document_code: '13',
        identification_number: '43999888',
        first_name: 'Luz Marina',
        first_surname: 'Osorio',
        address: 'Calle 12 Sur # 50-10',
        municipality_code: '05001',
        base_salary_cop: 1800000,
        receives_transport_allowance: true,
        entry_date: '2025-01-15',
        payment_method_code: '42',
      })
      .expect(201);

    const employeeId = empRes.body.id;
    expect(empRes.body.job_title).toBe('Personal de Aseo y Servicios Generales');
    expect(empRes.body.user_id).toBeNull();

    // 2. Mock de transmisión de nómina a Factus v2
    const validatePayrollSpy = vi.spyOn(factusClient, 'validatePayroll').mockResolvedValue({
      status: 'OK',
      data: {
        payroll: {
          number: 'NEF1005',
          cune: 'CUNE-PAYROLL-1005-DIAN',
          pdf_url: 'https://api-sandbox.factus.com.co/v2/payrolls/NEF1005/download-pdf',
          xml_url: 'https://api-sandbox.factus.com.co/v2/payrolls/NEF1005/download-xml',
          status: 'VALIDATED_DIAN',
        },
      },
    });

    // 3. Liquidar y transmitir nómina con recargo nocturno
    const payrollRes = await request(app.getHttpServer())
      .post(`/api/v1/branches/${r.branchId}/payrolls`)
      .set('Authorization', `Bearer ${r.adminToken}`)
      .send({
        employee_id: employeeId,
        year: 2026,
        month: 5,
        days_worked: 30,
        commissions_cop: 0,
        overtime_entries: [
          {
            accrual_type_code: '3', // Recargo nocturno (35 %)
            quantity: 10,
          },
        ],
        other_deductions_cop: 0,
        payment_date: '2026-06-05',
      })
      .expect(201);

    expect(payrollRes.body.settlement.status).toBe('VALIDATED_DIAN');
    expect(payrollRes.body.settlement.factus_payroll_number).toBe('NEF1005');
    expect(payrollRes.body.settlement.cune).toBe('CUNE-PAYROLL-1005-DIAN');

    // 4. Crear un pedido pagado y un gasto operativo para comprobar P&L
    await prisma.order.create({
      data: {
        tenant_id: r.tenantId,
        branch_id: r.branchId,
        order_code: 'P001',
        origin: 'STOREFRONT',
        fulfillment_type: 'TAKE_OUT',
        status: 'DELIVERED',
        payment_policy: 'OFFLINE_ONLY',
        payment_status: 'PAID',
        customer_snapshot_json: {},
        tax_summary_snapshot_json: {},
        idempotency_key: `idem-pnl-${Date.now()}-${Math.random()}`,
        public_token: `token-pnl-${Date.now()}`,
        subtotal_products_cop: 5000000,
        grand_total_cop: 5000000,
        paid_total_cop: 5000000,
      },
    });

    // 5. Consultar Estado de Resultados (P&L)
    const pnlRes = await request(app.getHttpServer())
      .get(`/api/v1/reports/profit-and-loss?from=2026-01-01&to=2026-12-31&branch_id=${r.branchId}`)
      .set('Authorization', `Bearer ${r.adminToken}`)
      .expect(200);

    expect(pnlRes.body.netSalesRevenueCop).toBe(5000000);
    expect(pnlRes.body.grossPayrollCop).toBe(payrollRes.body.settlement.gross_accrued_cop);
    expect(pnlRes.body.operatingProfitCop).toBe(
      pnlRes.body.grossProfitCop - pnlRes.body.totalOperatingCostsCop,
    );

    validatePayrollSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // TC-09-I07: Aislamiento Multi-Tenant de Facturación y Datos Financieros
  // ---------------------------------------------------------------------------
  it('TC-09-I07: Aislamiento Multi-Tenant entre Restaurante A y Restaurante B', async () => {
    const rA = await registerRestaurant('tenant_a');
    const rB = await registerRestaurant('tenant_b');

    // Crear proveedor en Restaurante A
    const suppA = await prisma.supplier.create({
      data: {
        tenant_id: rA.tenantId,
        identification_document_code: '31',
        identification: '900111222',
        name: 'Distribuidora Carnes Norte S.A.S.',
        address: 'Calle 50 # 10-20',
        municipality_code: '05001',
      },
    });

    // Restaurante B intenta listar proveedores: NO debe ver el proveedor de Restaurante A
    const resB = await request(app.getHttpServer())
      .get('/api/v1/admin/suppliers')
      .set('Authorization', `Bearer ${rB.adminToken}`)
      .expect(200);

    const hasSuppA = resB.body.some((s: any) => s.id === suppA.id);
    expect(hasSuppA).toBe(false);

    // Restaurante B intenta emitir documento sobre gasto o datos de A -> 404
    await request(app.getHttpServer())
      .post(`/api/v1/expenses/${suppA.id}/support-document`)
      .set('Authorization', `Bearer ${rB.adminToken}`)
      .expect(404);
  });
});
