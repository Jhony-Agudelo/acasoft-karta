import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createTestApp } from './test-app';
import { PrismaService } from '../src/database/prisma.service';

describe('Integración Fase 05: TC-05-I01 a TC-05-I05', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  beforeAll(async () => {
    const testContext = await createTestApp();
    app = testContext.app;
    prisma = testContext.prisma;
    jwtService = app.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerRestaurant(prefix: string) {
    const ts = Date.now() + Math.floor(Math.random() * 100000);
    const slug = `${prefix}-${ts}`;
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        organization_name: `Org ${prefix}`,
        slug,
        admin_name: `Admin ${prefix}`,
        admin_email: `${prefix}_${ts}@restaurante.co`,
        admin_password: 'Password123!',
        admin_phone: '3001234567',
        initial_profile: 'FULL_PANEL',
      })
      .expect(201);

    const tenantId = res.body.tenant.id as string;
    const branchId = res.body.branch.id as string;
    const adminUserId = res.body.user.id as string;

    // Actualizar plan a PLAN_OPERATIONS_PRO para tener entitlements de reporting y pagos
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { plan_id: 'PLAN_OPERATIONS_PRO' },
    });

    // Activar módulos necesarios
    const modulesToEnable = ['ordering', 'order_panel', 'payments.manual', 'kitchen', 'reporting'];
    for (const modKey of modulesToEnable) {
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

    return {
      token: res.body.accessToken as string,
      tenantId,
      branchId,
      adminUserId,
      slug,
    };
  }

  function createPlatformAdminToken(adminUserId: string, tenantId: string) {
    return jwtService.signAsync({
      sub: adminUserId,
      email: 'platform@acasoft.co',
      name: 'Super Admin',
      tenant_id: tenantId,
      role_key: 'PLATFORM_ADMIN',
      branch_scope: [],
      must_change_password: false,
    });
  }

  describe('TC-05-I01: Conciliación Financiera Exacta en GET /api/v1/reports/sales', () => {
    it('debe conciliar exactamente las 5 órdenes confirmadas y verificar la ecuación maestra', async () => {
      const rest = await registerRestaurant('tc05-i01');
      const testDate = '2026-10-28';
      const orderCreatedAt = new Date('2026-10-28T14:30:00.000-05:00');

      // 1. Orden 1: $50.000 productos + $5.000 domicilio = $55.000; PAID (CASH 55000)
      const order1 = await prisma.order.create({
        data: {
          tenant_id: rest.tenantId,
          branch_id: rest.branchId,
          order_code: '#A101',
          origin: 'WHATSAPP',
          fulfillment_type: 'DELIVERY',
          status: 'DELIVERED',
          payment_policy: 'OFFLINE_ONLY',
          payment_status: 'PAID',
          public_token: `token-o1-${Date.now()}`,
          subtotal_products_cop: 50000,
          discount_total_cop: 0,
          delivery_fee_cop: 5000,
          tax_total_cop: 0,
          tip_cop: 0,
          grand_total_cop: 55000,
          paid_total_cop: 55000,
          uncollected_amount_cop: 0,
          customer_snapshot_json: { name: 'Comensal Uno', phone_e164: '+573001111111' },
          tax_summary_snapshot_json: { taxable_base_cop: 50000, tax_inc_cop: 0, tax_iva_cop: 0 },
          created_at: orderCreatedAt,
          payments: {
            create: {
              tenant_id: rest.tenantId,
              branch_id: rest.branchId,
              method: 'CASH',
              amount_cop: 55000,
              cash_received_cop: 60000,
              change_given_cop: 5000,
              status: 'APPROVED',
              idempotency_key: `pay-o1-${Date.now()}`,
              created_by: rest.adminUserId,
            },
          },
        },
      });

      // 2. Orden 2: $40.000 productos + $4.000 propina = $44.000; PARTIALLY_PAID (MANUAL_TRANSFER 30000, pendiente 14000)
      const order2 = await prisma.order.create({
        data: {
          tenant_id: rest.tenantId,
          branch_id: rest.branchId,
          order_code: '#A102',
          origin: 'WEB_DIRECT',
          fulfillment_type: 'PICKUP',
          status: 'READY',
          payment_policy: 'OFFLINE_ONLY',
          payment_status: 'PARTIALLY_PAID',
          public_token: `token-o2-${Date.now()}`,
          subtotal_products_cop: 40000,
          discount_total_cop: 0,
          delivery_fee_cop: 0,
          tax_total_cop: 0,
          tip_cop: 4000,
          grand_total_cop: 44000,
          paid_total_cop: 30000,
          uncollected_amount_cop: 0,
          customer_snapshot_json: { name: 'Comensal Dos', phone_e164: '+573002222222' },
          tax_summary_snapshot_json: { taxable_base_cop: 40000, tax_inc_cop: 0, tax_iva_cop: 0 },
          created_at: orderCreatedAt,
          payments: {
            create: {
              tenant_id: rest.tenantId,
              branch_id: rest.branchId,
              method: 'MANUAL_TRANSFER',
              amount_cop: 30000,
              reference_note: 'Nequi M-9988',
              status: 'APPROVED',
              idempotency_key: `pay-o2-${Date.now()}`,
              created_by: rest.adminUserId,
            },
          },
        },
      });

      // 3. Orden 3: $30.000 productos; UNPAID (pendiente 30000)
      const order3 = await prisma.order.create({
        data: {
          tenant_id: rest.tenantId,
          branch_id: rest.branchId,
          order_code: '#A103',
          origin: 'PHONE_MANUAL',
          fulfillment_type: 'PICKUP',
          status: 'ACCEPTED',
          payment_policy: 'OFFLINE_ONLY',
          payment_status: 'UNPAID',
          public_token: `token-o3-${Date.now()}`,
          subtotal_products_cop: 30000,
          discount_total_cop: 0,
          delivery_fee_cop: 0,
          tax_total_cop: 0,
          tip_cop: 0,
          grand_total_cop: 30000,
          paid_total_cop: 0,
          uncollected_amount_cop: 0,
          customer_snapshot_json: { name: 'Comensal Tres', phone_e164: '+573003333333' },
          tax_summary_snapshot_json: { taxable_base_cop: 30000, tax_inc_cop: 0, tax_iva_cop: 0 },
          created_at: orderCreatedAt,
        },
      });

      // 4. Orden 4: $25.000 productos; COURTESY (uncollected 25000)
      const order4 = await prisma.order.create({
        data: {
          tenant_id: rest.tenantId,
          branch_id: rest.branchId,
          order_code: '#A104',
          origin: 'WAITER',
          fulfillment_type: 'DINE_IN',
          status: 'DELIVERED',
          payment_policy: 'OFFLINE_ONLY',
          payment_status: 'COURTESY',
          public_token: `token-o4-${Date.now()}`,
          subtotal_products_cop: 25000,
          discount_total_cop: 0,
          delivery_fee_cop: 0,
          tax_total_cop: 0,
          tip_cop: 0,
          grand_total_cop: 25000,
          paid_total_cop: 0,
          uncollected_amount_cop: 25000,
          resolution_type: 'COURTESY',
          resolution_reason: 'Cortesía de la casa por aniversario',
          resolved_by: rest.adminUserId,
          resolved_at: orderCreatedAt,
          customer_snapshot_json: { name: 'Comensal Cuatro', phone_e164: '+573004444444' },
          tax_summary_snapshot_json: { taxable_base_cop: 25000, tax_inc_cop: 0, tax_iva_cop: 0 },
          created_at: orderCreatedAt,
        },
      });

      // 5. Orden 5: $35.000 productos; POS_TERMINAL 10000 + WRITTEN_OFF 25000
      const order5 = await prisma.order.create({
        data: {
          tenant_id: rest.tenantId,
          branch_id: rest.branchId,
          order_code: '#A105',
          origin: 'WHATSAPP',
          fulfillment_type: 'DELIVERY',
          status: 'DELIVERED',
          payment_policy: 'OFFLINE_ONLY',
          payment_status: 'WRITTEN_OFF',
          public_token: `token-o5-${Date.now()}`,
          subtotal_products_cop: 35000,
          discount_total_cop: 0,
          delivery_fee_cop: 0,
          tax_total_cop: 0,
          tip_cop: 0,
          grand_total_cop: 35000,
          paid_total_cop: 10000,
          uncollected_amount_cop: 25000,
          resolution_type: 'WRITTEN_OFF',
          resolution_reason: 'Cliente canceló mitad y se dio a la fuga',
          resolved_by: rest.adminUserId,
          resolved_at: orderCreatedAt,
          customer_snapshot_json: { name: 'Comensal Cinco', phone_e164: '+573005555555' },
          tax_summary_snapshot_json: { taxable_base_cop: 35000, tax_inc_cop: 0, tax_iva_cop: 0 },
          created_at: orderCreatedAt,
          payments: {
            create: {
              tenant_id: rest.tenantId,
              branch_id: rest.branchId,
              method: 'POS_TERMINAL',
              amount_cop: 10000,
              reference_note: 'Datafono Credibanco Voucher 112',
              status: 'APPROVED',
              idempotency_key: `pay-o5-${Date.now()}`,
              created_by: rest.adminUserId,
            },
          },
        },
      });

      // Consultar reporte de ventas
      const res = await request(app.getHttpServer())
        .get(`/api/v1/reports/sales?date_from=${testDate}&date_to=${testDate}&branch_id=${rest.branchId}`)
        .set('Authorization', `Bearer ${rest.token}`)
        .expect(200);

      const report = res.body;

      // Facturación bruta: 55000 + 44000 + 30000 + 25000 + 35000 = 189.000
      expect(report.billing_summary.confirmed_orders_count).toBe(5);
      expect(report.billing_summary.net_products_sales_cop).toBe(180000);
      expect(report.billing_summary.delivery_fees_total_cop).toBe(5000);
      expect(report.billing_summary.tips_total_cop).toBe(4000);
      expect(report.billing_summary.gross_billed_total_cop).toBe(189000);

      // Recaudo: CASH 55000 + MANUAL_TRANSFER 30000 + POS_TERMINAL 10000 = 95.000
      expect(report.reconciliation_summary.collected_total_cop).toBe(95000);
      expect(report.collections_by_method.CASH).toBe(55000);
      expect(report.collections_by_method.MANUAL_TRANSFER).toBe(30000);
      expect(report.collections_by_method.POS_TERMINAL).toBe(10000);

      // Desglose de recaudo imputado por prelación:
      // O1: 50.000 prod + 5.000 dom
      // O2: 30.000 prod (abono parcial cubre primero productos)
      // O5: 10.000 prod (abono parcial cubre productos)
      // Total prod = 90.000, del = 5.000, tips = 0
      expect(report.reconciliation_summary.collected_products_cop).toBe(90000);
      expect(report.reconciliation_summary.collected_delivery_cop).toBe(5000);
      expect(report.reconciliation_summary.collected_tips_cop).toBe(0);

      // Saldos por cobrar y resoluciones:
      // Pendiente: O2 (14.000) + O3 (30.000) = 44.000
      // Cortesía: O4 (25.000)
      // Castigo: O5 (25.000)
      expect(report.reconciliation_summary.pending_receivable_cop).toBe(44000);
      expect(report.reconciliation_summary.courtesy_total_cop).toBe(25000);
      expect(report.reconciliation_summary.written_off_total_cop).toBe(25000);

      // Ecuación Maestra: 95.000 + 44.000 + 25.000 + 25.000 = 189.000
      expect(report.reconciliation_summary.is_balanced).toBe(true);

      // Detalle de resoluciones
      expect(report.uncollected_resolutions_detail).toHaveLength(2);
      const courtesyRes = report.uncollected_resolutions_detail.find(
        (r: any) => r.order_id === order4.id,
      );
      expect(courtesyRes).toBeDefined();
      expect(courtesyRes.resolution_type).toBe('COURTESY');
      expect(courtesyRes.uncollected_amount_cop).toBe(25000);
      expect(courtesyRes.resolution_reason).toBe('Cortesía de la casa por aniversario');

      const writtenOffRes = report.uncollected_resolutions_detail.find(
        (r: any) => r.order_id === order5.id,
      );
      expect(writtenOffRes).toBeDefined();
      expect(writtenOffRes.resolution_type).toBe('WRITTEN_OFF');
      expect(writtenOffRes.uncollected_amount_cop).toBe(25000);
    });
  });

  describe('TC-05-I02: Exclusión de Solicitudes No Confirmadas y Separación de NOT_TRACKED', () => {
    it('no debe incluir en la facturación bruta órdenes canceladas/rechazadas ni alterar saldos contables con NOT_TRACKED', async () => {
      const rest = await registerRestaurant('tc05-i02');
      const testDate = '2026-10-28';
      const orderCreatedAt = new Date('2026-10-28T10:00:00.000-05:00');

      // 1. Crear 1 orden confirmada monitoreada ($50.000)
      await prisma.order.create({
        data: {
          tenant_id: rest.tenantId,
          branch_id: rest.branchId,
          order_code: '#B101',
          origin: 'WHATSAPP',
          fulfillment_type: 'PICKUP',
          status: 'ACCEPTED',
          payment_policy: 'OFFLINE_ONLY',
          payment_status: 'UNPAID',
          public_token: `token-b1-${Date.now()}`,
          subtotal_products_cop: 50000,
          discount_total_cop: 0,
          delivery_fee_cop: 0,
          tax_total_cop: 0,
          tip_cop: 0,
          grand_total_cop: 50000,
          paid_total_cop: 0,
          uncollected_amount_cop: 0,
          customer_snapshot_json: { name: 'Cliente Valido' },
          tax_summary_snapshot_json: { taxable_base_cop: 50000, tax_inc_cop: 0, tax_iva_cop: 0 },
          created_at: orderCreatedAt,
        },
      });

      // 2. Crear órdenes en estados excluidos
      const excludedConfigs = [
        { status: 'REQUESTED', amount: 20000 },
        { status: 'REJECTED', amount: 15000 },
        { status: 'CANCELLED', amount: 25000 },
        { status: 'EXPIRED_UNPROCESSED', amount: 10000 },
      ];

      for (let i = 0; i < excludedConfigs.length; i++) {
        const conf = excludedConfigs[i];
        await prisma.order.create({
          data: {
            tenant_id: rest.tenantId,
            branch_id: rest.branchId,
            order_code: `#EX${i + 1}`,
            origin: 'WHATSAPP',
            fulfillment_type: 'PICKUP',
            status: conf.status,
            payment_policy: 'OFFLINE_ONLY',
            payment_status: 'UNPAID',
            public_token: `token-ex-${i}-${Date.now()}`,
            subtotal_products_cop: conf.amount,
            discount_total_cop: 0,
            delivery_fee_cop: 0,
            tax_total_cop: 0,
            tip_cop: 0,
            grand_total_cop: conf.amount,
            paid_total_cop: 0,
            uncollected_amount_cop: 0,
            customer_snapshot_json: { name: `Cliente Excluido ${i}` },
            tax_summary_snapshot_json: {},
            created_at: orderCreatedAt,
          },
        });
      }

      // 3. Crear orden confirmada con payment_policy = 'NONE' (NOT_TRACKED de Nivel 1)
      await prisma.order.create({
        data: {
          tenant_id: rest.tenantId,
          branch_id: rest.branchId,
          order_code: '#NT01',
          origin: 'WHATSAPP',
          fulfillment_type: 'DELIVERY',
          status: 'DELIVERED',
          payment_policy: 'NONE',
          payment_status: 'NOT_TRACKED',
          public_token: `token-nt-${Date.now()}`,
          subtotal_products_cop: 18000,
          discount_total_cop: 0,
          delivery_fee_cop: 0,
          tax_total_cop: 0,
          tip_cop: 0,
          grand_total_cop: 18000,
          paid_total_cop: 0,
          uncollected_amount_cop: 0,
          customer_snapshot_json: { name: 'Cliente Nivel 1' },
          tax_summary_snapshot_json: {},
          created_at: orderCreatedAt,
        },
      });

      // Consultar reporte
      const res = await request(app.getHttpServer())
        .get(`/api/v1/reports/sales?date_from=${testDate}&date_to=${testDate}&branch_id=${rest.branchId}`)
        .set('Authorization', `Bearer ${rest.token}`)
        .expect(200);

      const report = res.body;

      // La facturación bruta solo debe computar la orden confirmada ($50.000)
      expect(report.billing_summary.confirmed_orders_count).toBe(1);
      expect(report.billing_summary.gross_billed_total_cop).toBe(50000);
      expect(report.reconciliation_summary.pending_receivable_cop).toBe(50000);

      // Resumen de órdenes excluidas
      expect(report.excluded_orders_summary.requested_unprocessed_count).toBe(1);
      expect(report.excluded_orders_summary.rejected_count).toBe(1);
      expect(report.excluded_orders_summary.cancelled_count).toBe(1);
      expect(report.excluded_orders_summary.expired_count).toBe(1);

      // Órdenes sin seguimiento de caja
      expect(report.not_tracked_orders_summary.count).toBe(1);
      expect(report.not_tracked_orders_summary.nominal_total_cop).toBe(18000);
    });
  });

  describe('TC-05-I03: Exportación CSV Auditada y Libre de PII — Ley 1581', () => {
    it('debe generar el CSV con cabeceras requeridas, BOM UTF-8, Cero PII y evento de auditoría', async () => {
      const rest = await registerRestaurant('tc05-i03');
      const testDate = '2026-10-28';
      const orderCreatedAt = new Date('2026-10-28T16:00:00.000-05:00');

      // Crear pedido con PII completa en snapshot
      await prisma.order.create({
        data: {
          tenant_id: rest.tenantId,
          branch_id: rest.branchId,
          order_code: '#C101',
          origin: 'WHATSAPP',
          fulfillment_type: 'DELIVERY',
          status: 'DELIVERED',
          payment_policy: 'OFFLINE_ONLY',
          payment_status: 'PAID',
          public_token: `token-c1-${Date.now()}`,
          subtotal_products_cop: 45000,
          discount_total_cop: 0,
          delivery_fee_cop: 5000,
          tax_total_cop: 0,
          tip_cop: 0,
          grand_total_cop: 50000,
          paid_total_cop: 50000,
          uncollected_amount_cop: 0,
          customer_snapshot_json: {
            name: 'Juan Pérez Privado',
            phone_e164: '+573109998877',
            delivery_address: 'Calle 100 # 15-20 Apto 402, Bogotá',
          },
          tax_summary_snapshot_json: { taxable_base_cop: 45000, tax_inc_cop: 0, tax_iva_cop: 0 },
          created_at: orderCreatedAt,
          payments: {
            create: {
              tenant_id: rest.tenantId,
              branch_id: rest.branchId,
              method: 'CASH',
              amount_cop: 50000,
              status: 'APPROVED',
              idempotency_key: `pay-c1-${Date.now()}`,
              created_by: rest.adminUserId,
            },
          },
        },
      });

      // Invocar exportación CSV
      const res = await request(app.getHttpServer())
        .get(`/api/v1/reports/sales/export-csv?date_from=${testDate}&date_to=${testDate}&branch_id=${rest.branchId}`)
        .set('Authorization', `Bearer ${rest.token}`)
        .expect(200);

      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain(`reporte_ventas_${testDate}_${testDate}.csv`);

      const csvText = res.text;

      // 1. Debe incluir BOM UTF-8 (\uFEFF)
      expect(csvText.charCodeAt(0)).toBe(0xfeff);

      // 2. Debe contener las columnas obligatorias
      expect(csvText).toContain('codigo,tipo_registro,fecha_hora_bogota,sucursal,origen,modalidad');
      expect(csvText).toContain('total_facturado_cop,recaudado_efectivo_cop');
      expect(csvText).toContain('#C101');

      // 3. Estricta verificación de Cero PII (Ley 1581 de 2012)
      expect(csvText).not.toContain('Juan Pérez Privado');
      expect(csvText).not.toContain('+573109998877');
      expect(csvText).not.toContain('3109998877');
      expect(csvText).not.toContain('Calle 100');
      expect(csvText).not.toContain('Apto 402');

      // 4. Debe existir evento en audit_events
      const auditLog = await prisma.auditEvent.findFirst({
        where: {
          tenant_id: rest.tenantId,
          action: 'SALES_REPORT_CSV_EXPORTED',
        },
      });

      expect(auditLog).toBeDefined();
      expect(auditLog?.entity_type).toBe('REPORT');
    });
  });

  describe('TC-05-I04: Gestión de Suscripción SaaS, Sincronización de Plan y Bloqueo por SUSPENDED', () => {
    it('debe permitir a PLATFORM_ADMIN actualizar plan y facturación, y bloquear mutaciones si está en SUSPENDED', async () => {
      const rest = await registerRestaurant('tc05-i04');
      const platformToken = await createPlatformAdminToken(rest.adminUserId, rest.tenantId);

      // 1. Actualizar a PLAN_OPERATIONS_PRO y emitir factura de $89.000
      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/platform/tenants/${rest.tenantId}/subscription`)
        .set('Authorization', `Bearer ${platformToken}`)
        .send({
          plan_id: 'PLAN_OPERATIONS_PRO',
          status: 'ACTIVE',
          current_period_start: '2026-10-01',
          current_period_end: '2026-11-01',
          invoice_amount_cop: 89000,
          payment_reference_note: 'Bancolombia Transferencia 48291',
          reason: 'Activación comercial mensual Plan Operations Pro',
        })
        .expect(200);

      expect(updateRes.body.plan_id).toBe('PLAN_OPERATIONS_PRO');
      expect(updateRes.body.status).toBe('ACTIVE');
      expect(updateRes.body.invoices).toHaveLength(1);
      expect(updateRes.body.invoices[0].amount_cop).toBe(89000);

      // Verificar sincronización en Tenant
      const tenantInDb = await prisma.tenant.findUnique({
        where: { id: rest.tenantId },
      });
      expect(tenantInDb?.plan_id).toBe('PLAN_OPERATIONS_PRO');

      // 2. Consultar como TENANT_ADMIN vía GET /api/v1/admin/subscription
      const adminSubRes = await request(app.getHttpServer())
        .get('/api/v1/admin/subscription')
        .set('Authorization', `Bearer ${rest.token}`)
        .expect(200);

      expect(adminSubRes.body.plan_id).toBe('PLAN_OPERATIONS_PRO');
      expect(adminSubRes.body.status).toBe('ACTIVE');
      expect(adminSubRes.body.entitled_modules).toContain('reporting');
      expect(adminSubRes.body.entitled_modules).toContain('payments.manual');

      // 3. Suspender la suscripción
      await request(app.getHttpServer())
        .patch(`/api/v1/platform/tenants/${rest.tenantId}/subscription`)
        .set('Authorization', `Bearer ${platformToken}`)
        .send({
          plan_id: 'PLAN_OPERATIONS_PRO',
          status: 'SUSPENDED',
          current_period_start: '2026-10-01',
          current_period_end: '2026-10-15',
          reason: 'Falta de pago de mensualidad',
        })
        .expect(200);

      // 4. Intentar crear pedido público -> debe ser rechazado con 403 TENANT_SUBSCRIPTION_SUSPENDED
      const createOrderRes = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('x-tenant-id', rest.tenantId)
        .send({
          branch_id: rest.branchId,
          origin: 'WHATSAPP',
          fulfillment_type: 'PICKUP',
          customer: {
            name: 'Cliente Bloqueado',
            phone: '3009991122',
            privacy_consent_accepted: true,
          },
          items: [],
        })
        .expect(403);

      expect(createOrderRes.body.errorCode).toBe('TENANT_SUBSCRIPTION_SUSPENDED');

      // 5. El TENANT_ADMIN aún puede consultar en modo solo lectura sus reportes históricos
      await request(app.getHttpServer())
        .get('/api/v1/reports/sales?date_from=2026-10-01&date_to=2026-10-31')
        .set('Authorization', `Bearer ${rest.token}`)
        .expect(200);

      // Y también puede consultar el estado de su suscripción
      await request(app.getHttpServer())
        .get('/api/v1/admin/subscription')
        .set('Authorization', `Bearer ${rest.token}`)
        .expect(200);
    });
  });

  describe('TC-05-I05: Aislamiento Multi-Tenant en Reportes y Exportación CSV', () => {
    it('el Restaurante A no debe visualizar ni exportar ninguna orden del Restaurante B', async () => {
      const restA = await registerRestaurant('tc05-i05-a');
      const restB = await registerRestaurant('tc05-i05-b');
      const testDate = '2026-10-28';
      const orderCreatedAt = new Date('2026-10-28T15:00:00.000-05:00');

      // Orden en Restaurante A ($100.000)
      await prisma.order.create({
        data: {
          tenant_id: restA.tenantId,
          branch_id: restA.branchId,
          order_code: '#REST-A-01',
          origin: 'WHATSAPP',
          fulfillment_type: 'PICKUP',
          status: 'ACCEPTED',
          payment_policy: 'OFFLINE_ONLY',
          payment_status: 'PAID',
          public_token: `token-ra-${Date.now()}`,
          subtotal_products_cop: 100000,
          discount_total_cop: 0,
          delivery_fee_cop: 0,
          tax_total_cop: 0,
          tip_cop: 0,
          grand_total_cop: 100000,
          paid_total_cop: 100000,
          uncollected_amount_cop: 0,
          customer_snapshot_json: { name: 'Cliente de A' },
          tax_summary_snapshot_json: { taxable_base_cop: 100000 },
          created_at: orderCreatedAt,
          payments: {
            create: {
              tenant_id: restA.tenantId,
              branch_id: restA.branchId,
              method: 'CASH',
              amount_cop: 100000,
              status: 'APPROVED',
              idempotency_key: `pay-ra-${Date.now()}`,
              created_by: restA.adminUserId,
            },
          },
        },
      });

      // Orden en Restaurante B ($250.000)
      await prisma.order.create({
        data: {
          tenant_id: restB.tenantId,
          branch_id: restB.branchId,
          order_code: '#REST-B-99',
          origin: 'WHATSAPP',
          fulfillment_type: 'PICKUP',
          status: 'ACCEPTED',
          payment_policy: 'OFFLINE_ONLY',
          payment_status: 'PAID',
          public_token: `token-rb-${Date.now()}`,
          subtotal_products_cop: 250000,
          discount_total_cop: 0,
          delivery_fee_cop: 0,
          tax_total_cop: 0,
          tip_cop: 0,
          grand_total_cop: 250000,
          paid_total_cop: 250000,
          uncollected_amount_cop: 0,
          customer_snapshot_json: { name: 'Cliente de B' },
          tax_summary_snapshot_json: { taxable_base_cop: 250000 },
          created_at: orderCreatedAt,
          payments: {
            create: {
              tenant_id: restB.tenantId,
              branch_id: restB.branchId,
              method: 'CASH',
              amount_cop: 250000,
              status: 'APPROVED',
              idempotency_key: `pay-rb-${Date.now()}`,
              created_by: restB.adminUserId,
            },
          },
        },
      });

      // Restaurante A consulta su reporte
      const resA = await request(app.getHttpServer())
        .get(`/api/v1/reports/sales?date_from=${testDate}&date_to=${testDate}`)
        .set('Authorization', `Bearer ${restA.token}`)
        .expect(200);

      expect(resA.body.billing_summary.confirmed_orders_count).toBe(1);
      expect(resA.body.billing_summary.gross_billed_total_cop).toBe(100000);
      expect(resA.body.reconciliation_summary.collected_total_cop).toBe(100000);

      // Restaurante A exporta CSV
      const csvA = await request(app.getHttpServer())
        .get(`/api/v1/reports/sales/export-csv?date_from=${testDate}&date_to=${testDate}`)
        .set('Authorization', `Bearer ${restA.token}`)
        .expect(200);

      expect(csvA.text).toContain('#REST-A-01');
      expect(csvA.text).not.toContain('#REST-B-99');
      expect(csvA.text).not.toContain('250000');
    });
  });
});
