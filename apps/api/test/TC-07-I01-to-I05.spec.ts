import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createTestApp } from './test-app';
import { PrismaService } from '../src/database/prisma.service';

describe('Integración Fase 07: TC-07-I01 a TC-07-I05 (Turnos y Arqueo Ciego de Caja)', () => {
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
        initial_profile: 'DINING_ROOM',
      })
      .expect(201);

    const tenantId = res.body.tenant.id as string;
    const branchId = res.body.branch.id as string;
    const adminUserId = res.body.user.id as string;

    // Actualizar plan a PLAN_ENTERPRISE_DINING para tener entitlement de dining y payments.cash_shifts
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { plan_id: 'PLAN_ENTERPRISE_DINING' },
    });

    // Activar módulos clave
    const modulesToEnable = [
      'ordering',
      'order_panel',
      'payments.manual',
      'payments.cash_shifts',
      'dining',
      'reporting',
    ];
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
      adminToken: res.body.accessToken as string,
      tenantId,
      branchId,
      adminUserId,
      slug,
    };
  }

  async function createCashierUser(tenantId: string, branchId: string) {
    const cashier = await prisma.user.create({
      data: {
        email: `cashier_${Date.now()}_${Math.random()}@test.com`,
        name: 'Cajero Operativo',
        phone: '3001234567',
        password_hash: 'dummyhash',
        status: 'ACTIVE',
      },
    });

    await prisma.membership.create({
      data: {
        tenant_id: tenantId,
        user_id: cashier.id,
        role_key: 'CASHIER',
        branch_scope: [branchId],
        is_active: true,
      },
    });

    const token = jwtService.sign({
      sub: cashier.id,
      email: cashier.email,
      name: cashier.name,
      tenant_id: tenantId,
      role_key: 'CASHIER',
      branch_scope: [branchId],
      must_change_password: false,
    });

    return { cashier, token };
  }

  async function seedCatalog(tenantId: string, branchId: string) {
    return prisma.withTenant(tenantId, async (tx) => {
      const menu = await tx.menu.create({
        data: {
          tenant_id: tenantId,
          branch_id: branchId,
          name: 'Menú Caja',
          status: 'ACTIVE',
        },
      });

      const category = await tx.category.create({
        data: {
          tenant_id: tenantId,
          menu_id: menu.id,
          name: 'Platos',
          sort_order: 1,
          is_active: true,
        },
      });

      const product = await tx.product.create({
        data: {
          tenant_id: tenantId,
          category_id: category.id,
          name: 'Hamburguesa Artesanal',
          price_cop: 32000,
          status: 'ACTIVE',
          tax_type: 'NONE',
          tax_rate_bp: 0,
        },
      });

      return { menu, category, product };
    });
  }

  // ---------------------------------------------------------------------------
  // TC-07-I01: Apertura de Turno de Caja con Base Inicial y Unicidad de Turno Abierto
  // ---------------------------------------------------------------------------
  describe('TC-07-I01: Apertura de Turno con Base Inicial y Unicidad', () => {
    it('debe aperturar turno con base inicial y rechazar apertura simultánea en la misma sucursal', async () => {
      const rest = await registerRestaurant('tc07-i01');
      const { token: cashierToken } = await createCashierUser(rest.tenantId, rest.branchId);

      // 1. Abrir turno con base $100.000 COP
      const openRes = await request(app.getHttpServer())
        .post(`/api/v1/branches/${rest.branchId}/cash-shifts/open`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          opening_cash_cop: 100000,
          notes: 'Apertura de turno mañana',
        })
        .expect(201);

      expect(openRes.body).toBeDefined();
      expect(openRes.body.status).toBe('OPEN');
      expect(openRes.body.opening_cash_cop).toBe(100000);
      expect(openRes.body.shift_code).toBe('#T-001');
      expect(openRes.body.cash_sales_cop).toBe(0);

      // 2. Intentar abrir un segundo turno simultáneo en la misma sucursal debe arrojar 409
      const dupRes = await request(app.getHttpServer())
        .post(`/api/v1/branches/${rest.branchId}/cash-shifts/open`)
        .set('Authorization', `Bearer ${rest.adminToken}`)
        .send({
          opening_cash_cop: 50000,
        })
        .expect(409);

      expect(dupRes.body.errorCode).toBe('CASH_SHIFT_ALREADY_OPEN');
    });
  });

  // ---------------------------------------------------------------------------
  // TC-07-I02: Enmascaramiento de Arqueo Ciego para Rol CASHIER vs Admin
  // ---------------------------------------------------------------------------
  describe('TC-07-I02: Arqueo Ciego (Blind Close Masking)', () => {
    it('el cajero no debe poder ver saldos teóricos ni ventas acumuladas en GET /current', async () => {
      const rest = await registerRestaurant('tc07-i02');
      const { token: cashierToken } = await createCashierUser(rest.tenantId, rest.branchId);

      // Abrir turno
      await request(app.getHttpServer())
        .post(`/api/v1/branches/${rest.branchId}/cash-shifts/open`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ opening_cash_cop: 120000 })
        .expect(201);

      // Consulta del cajero: is_blind_mode = true, cash_sales_cop = null, expected_cash_cop = null
      const cashierView = await request(app.getHttpServer())
        .get(`/api/v1/branches/${rest.branchId}/cash-shifts/current`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .expect(200);

      expect(cashierView.body.is_blind_mode).toBe(true);
      expect(cashierView.body.cash_sales_cop).toBeNull();
      expect(cashierView.body.expected_cash_cop).toBeNull();
      expect(cashierView.body.opening_cash_cop).toBe(120000);

      // Consulta del administrador: is_blind_mode = false, saldos revelados
      const adminView = await request(app.getHttpServer())
        .get(`/api/v1/branches/${rest.branchId}/cash-shifts/current`)
        .set('Authorization', `Bearer ${rest.adminToken}`)
        .expect(200);

      expect(adminView.body.is_blind_mode).toBe(false);
      expect(adminView.body.cash_sales_cop).toBe(0);
      expect(adminView.body.expected_cash_cop).toBe(120000);
    });
  });

  // ---------------------------------------------------------------------------
  // TC-07-I03: Registro de Entradas y Salidas Menores (CASH_IN / CASH_OUT)
  // ---------------------------------------------------------------------------
  describe('TC-07-I03: Movimientos Menores (Entradas y Salidas)', () => {
    it('debe registrar salida y entrada menor, actualizar acumuladores y generar auditoría', async () => {
      const rest = await registerRestaurant('tc07-i03');
      const { cashier, token: cashierToken } = await createCashierUser(rest.tenantId, rest.branchId);

      const openRes = await request(app.getHttpServer())
        .post(`/api/v1/branches/${rest.branchId}/cash-shifts/open`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ opening_cash_cop: 80000 })
        .expect(201);

      const shiftId = openRes.body.id;

      // 1. Salida menor por pago a proveedor de paso ($25.000)
      const outRes = await request(app.getHttpServer())
        .post(`/api/v1/cash-shifts/${shiftId}/movements`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          type: 'CASH_OUT',
          category: 'SUPPLIER_PAYMENT',
          amount_cop: 25000,
          reason: 'Pago cilantro y verduras proveedor de paso',
          reference_doc: 'REM-1234',
        })
        .expect(201);

      expect(outRes.body.movement.type).toBe('CASH_OUT');
      expect(outRes.body.movement.amount_cop).toBe(25000);
      expect(outRes.body.shift_summary.cash_out_total_cop).toBe(25000);

      // 2. Entrada menor por dotación de cambio ($50.000)
      const inRes = await request(app.getHttpServer())
        .post(`/api/v1/cash-shifts/${shiftId}/movements`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          type: 'CASH_IN',
          category: 'CHANGE_FUND',
          amount_cop: 50000,
          reason: 'Inyección de monedas y billetes pequeños para cambio',
        })
        .expect(201);

      expect(inRes.body.movement.type).toBe('CASH_IN');
      expect(inRes.body.movement.amount_cop).toBe(50000);
      expect(inRes.body.shift_summary.cash_in_total_cop).toBe(50000);

      // 3. Verificar auditoría en base de datos
      const auditEvents = await prisma.auditEvent.findMany({
        where: {
          tenant_id: rest.tenantId,
          entity_type: 'CashShiftMovement',
        },
      });
      expect(auditEvents.length).toBe(2);
      expect(auditEvents.some((e) => e.action === 'CASH_SHIFT_CASH_OUT')).toBe(true);
      expect(auditEvents.some((e) => e.action === 'CASH_SHIFT_CASH_IN')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // TC-07-I04: Cobro en Efectivo con Vinculación a Turno y Bloqueo sin Turno
  // ---------------------------------------------------------------------------
  describe('TC-07-I04: Integración con Cobros en Efectivo', () => {
    it('debe rechazar cobro en efectivo sin turno abierto y vincularlo exitosamente cuando el turno existe', async () => {
      const rest = await registerRestaurant('tc07-i04');
      const { token: cashierToken } = await createCashierUser(rest.tenantId, rest.branchId);
      const { product } = await seedCatalog(rest.tenantId, rest.branchId);

      // Crear mesa y cuenta de salón
      const area = await prisma.diningArea.create({
        data: {
          tenant_id: rest.tenantId,
          branch_id: rest.branchId,
          name: 'Zona 1',
        },
      });
      const table = await prisma.table.create({
        data: {
          tenant_id: rest.tenantId,
          branch_id: rest.branchId,
          area_id: area.id,
          code: 'T-01',
          capacity: 4,
        },
      });

      const accountRes = await request(app.getHttpServer())
        .post(`/api/v1/branches/${rest.branchId}/accounts`)
        .set('Authorization', `Bearer ${rest.adminToken}`)
        .send({ table_id: table.id, guest_count: 2 })
        .expect(201);

      const accountId = accountRes.body.id;

      // Crear orden de $32.000
      await prisma.order.create({
        data: {
          tenant_id: rest.tenantId,
          branch_id: rest.branchId,
          dining_account_id: accountId,
          order_code: '#CMD-101',
          origin: 'POS',
          fulfillment_type: 'DINE_IN',
          status: 'ACCEPTED',
          payment_policy: 'OFFLINE_ONLY',
          payment_status: 'UNPAID',
          public_token: `token-${Date.now()}-${Math.random()}`,
          subtotal_products_cop: 32000,
          discount_total_cop: 0,
          tax_total_cop: 0,
          tip_cop: 0,
          grand_total_cop: 32000,
          paid_total_cop: 0,
          customer_snapshot_json: { name: 'Comensal Salón' },
          tax_summary_snapshot_json: {},
          items: {
            create: [
              {
                tenant_id: rest.tenantId,
                product_id: product.id,
                unit_price_cop: product.price_cop,
                quantity: 1,
                line_total_cop: 32000,
                product_snapshot_json: { name: product.name, price_cop: product.price_cop },
                modifiers_snapshot_json: [],
                tax_snapshot_json: {},
              },
            ],
          },
        },
      });

      // Actualizar total de la cuenta
      await prisma.diningAccount.update({
        where: { id: accountId },
        data: { subtotal_products_cop: 32000, grand_total_cop: 32000 },
      });

      // 1. Intentar cobrar en efectivo SIN turno abierto -> HTTP 409 OPEN_CASH_SHIFT_REQUIRED
      const failPay = await request(app.getHttpServer())
        .post(`/api/v1/accounts/${accountId}/payments/manual`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          method: 'CASH',
          amount_cop: 32000,
          cash_received_cop: 40000,
        })
        .expect(409);

      expect(failPay.body.errorCode).toBe('OPEN_CASH_SHIFT_REQUIRED');

      // 2. Abrir turno
      const shiftRes = await request(app.getHttpServer())
        .post(`/api/v1/branches/${rest.branchId}/cash-shifts/open`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ opening_cash_cop: 50000 })
        .expect(201);
      const shiftId = shiftRes.body.id;

      // 3. Registrar el cobro en efectivo exitosamente
      const okPay = await request(app.getHttpServer())
        .post(`/api/v1/accounts/${accountId}/payments/manual`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          method: 'CASH',
          amount_cop: 32000,
          cash_received_cop: 40000,
        })
        .expect(201);

      expect(okPay.body.payment.cash_shift_id).toBe(shiftId);
      expect(okPay.body.payment.change_given_cop).toBe(8000);

      // Verificar que el turno incrementó cash_sales_cop
      const shiftCheck = await prisma.cashShift.findUnique({ where: { id: shiftId } });
      expect(shiftCheck?.cash_sales_cop).toBe(32000);
    });
  });

  // ---------------------------------------------------------------------------
  // TC-07-I05: Cierre Ciego Determinista, Congelación y Bloqueo de Anulaciones
  // ---------------------------------------------------------------------------
  describe('TC-07-I05: Cierre Ciego Determinista y Bloqueo de Anulaciones', () => {
    it('debe calcular discrepancia en el cierre, congelar turno y prohibir anulación de cobros cerrados', async () => {
      const rest = await registerRestaurant('tc07-i05');
      const { token: cashierToken } = await createCashierUser(rest.tenantId, rest.branchId);
      const { product } = await seedCatalog(rest.tenantId, rest.branchId);

      // 1. Abrir turno con $100.000
      const openRes = await request(app.getHttpServer())
        .post(`/api/v1/branches/${rest.branchId}/cash-shifts/open`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ opening_cash_cop: 100000 })
        .expect(201);
      const shiftId = openRes.body.id;

      // 2. Movimientos: Salida $25.000, Entrada $50.000
      await request(app.getHttpServer())
        .post(`/api/v1/cash-shifts/${shiftId}/movements`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          type: 'CASH_OUT',
          category: 'SUPPLIER_PAYMENT',
          amount_cop: 25000,
          reason: 'Proveedor verduras',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/cash-shifts/${shiftId}/movements`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          type: 'CASH_IN',
          category: 'CHANGE_FUND',
          amount_cop: 50000,
          reason: 'Inyección cambio',
        })
        .expect(201);

      // 3. Venta en efectivo: $32.000
      const order = await prisma.order.create({
        data: {
          tenant_id: rest.tenantId,
          branch_id: rest.branchId,
          order_code: '#CMD-301',
          origin: 'POS',
          fulfillment_type: 'PICKUP',
          status: 'ACCEPTED',
          payment_policy: 'OFFLINE_ONLY',
          payment_status: 'UNPAID',
          public_token: `token-${Date.now()}-${Math.random()}`,
          subtotal_products_cop: 32000,
          discount_total_cop: 0,
          tax_total_cop: 0,
          tip_cop: 0,
          grand_total_cop: 32000,
          paid_total_cop: 0,
          customer_snapshot_json: { name: 'Comensal Para Llevar' },
          tax_summary_snapshot_json: {},
        },
      });

      const payRes = await request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/payments/manual`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          method: 'CASH',
          amount_cop: 32000,
          cash_received_cop: 50000,
        })
        .expect(201);
      const paymentId = payRes.body.payment.id;

      // 4. Cierre ciego: Cajero cuenta y declara $155.000 en efectivo
      // Teórico esperado: 100.000 (base) + 32.000 (ventas) + 50.000 (entradas) - 25.000 (salidas) = $157.000
      // Discrepancia: 155.000 - 157.000 = -2.000 (Faltante)
      const closeRes = await request(app.getHttpServer())
        .post(`/api/v1/cash-shifts/${shiftId}/close`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          declared_cash_cop: 155000,
          closing_notes: 'Faltante de $2.000 por cambio dado de más',
          denominations_snapshot_json: {
            b_50k: 3, // $150.000
            b_5k: 1,  // $5.000
          },
        })
        .expect(201);

      expect(closeRes.body.status).toBe('CLOSED');
      expect(closeRes.body.declared_cash_cop).toBe(155000);
      expect(closeRes.body.expected_cash_cop).toBe(157000);
      expect(closeRes.body.difference_cop).toBe(-2000);
      expect(closeRes.body.closed_at).toBeDefined();

      // 5. Intentar registrar un movimiento en turno cerrado debe ser rechazado
      const failMove = await request(app.getHttpServer())
        .post(`/api/v1/cash-shifts/${shiftId}/movements`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          type: 'CASH_OUT',
          category: 'SUPPLIER_PAYMENT',
          amount_cop: 5000,
          reason: 'Movimiento extemporáneo',
        })
        .expect(409);
      expect(failMove.body.errorCode).toBe('CASH_SHIFT_NOT_OPEN');

      // 6. Prohibición de anular cobros de un turno cerrado -> HTTP 409 CASH_SHIFT_ALREADY_CLOSED
      const failVoid = await request(app.getHttpServer())
        .post(`/api/v1/payments/${paymentId}/void`)
        .set('Authorization', `Bearer ${rest.adminToken}`)
        .send({
          reason: 'Intento de anulación post-cierre',
        })
        .expect(409);
      expect(failVoid.body.errorCode).toBe('CASH_SHIFT_ALREADY_CLOSED');

      // 7. El administrador puede consultar el historial de turnos cerrados
      const listRes = await request(app.getHttpServer())
        .get(`/api/v1/branches/${rest.branchId}/cash-shifts?status=CLOSED`)
        .set('Authorization', `Bearer ${rest.adminToken}`)
        .expect(200);

      expect(listRes.body.data.length).toBe(1);
      expect(listRes.body.data[0].id).toBe(shiftId);
      expect(listRes.body.data[0].difference_cop).toBe(-2000);
    });
  });
});
