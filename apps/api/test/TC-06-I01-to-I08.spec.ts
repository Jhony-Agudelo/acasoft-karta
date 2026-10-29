import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from './test-app';
import { PrismaService } from '../src/database/prisma.service';
import * as crypto from 'crypto';

describe('Integración Fase 06: TC-06-I01 a TC-06-I08', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const testContext = await createTestApp();
    app = testContext.app;
    prisma = testContext.prisma;
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

    // Actualizar plan a PLAN_ENTERPRISE_DINING para tener entitlements completos de salón
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { plan_id: 'PLAN_ENTERPRISE_DINING' },
    });

    // Asegurar módulos de Fase 06 activos a nivel de tenant
    const modulesToEnable = [
      'ordering',
      'order_panel',
      'payments.manual',
      'kitchen',
      'dining',
      'dining.consumption_split',
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
      token: res.body.accessToken as string,
      tenantId,
      branchId,
      adminUserId,
      slug,
    };
  }

  async function seedCatalog(tenantId: string, branchId: string) {
    return prisma.withTenant(tenantId, async (tx) => {
      const menu = await tx.menu.create({
        data: {
          tenant_id: tenantId,
          branch_id: branchId,
          name: 'Menú Gastronómico Salón',
          status: 'ACTIVE',
        },
      });

      const category = await tx.category.create({
        data: {
          tenant_id: tenantId,
          menu_id: menu.id,
          name: 'Platos Fuertes',
          sort_order: 1,
          is_active: true,
        },
      });

      const productA = await tx.product.create({
        data: {
          tenant_id: tenantId,
          category_id: category.id,
          name: 'Picada Familiar Especial',
          price_cop: 50000,
          status: 'ACTIVE',
          tax_type: 'NONE',
          tax_rate_bp: 0,
        },
      });

      const productB = await tx.product.create({
        data: {
          tenant_id: tenantId,
          category_id: category.id,
          name: 'Bebida Refrescante',
          price_cop: 10000,
          status: 'ACTIVE',
          tax_type: 'NONE',
          tax_rate_bp: 0,
        },
      });

      return { menu, category, productA, productB };
    });
  }

  // ---------------------------------------------------------------------------
  // TC-06-I01: Índice Único Parcial de Cuenta Abierta y Control de Concurrencia
  // ---------------------------------------------------------------------------
  describe('TC-06-I01: Índice Único Parcial de Cuenta Abierta y Control de Concurrencia version', () => {
    it('debe rechazar segunda cuenta OPEN en misma mesa y detectar conflicto de versión concurrente', async () => {
      const rest = await registerRestaurant('tc06-i01');
      const { productA } = await seedCatalog(rest.tenantId, rest.branchId);

      // 1. Crear Área y Mesa M-01
      const areaRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/branches/${rest.branchId}/areas`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({ name: 'Salón Principal', sort_order: 1 })
        .expect(201);
      const areaId = areaRes.body.id;

      const tableRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/branches/${rest.branchId}/tables`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({
          area_id: areaId,
          code: 'M-01',
          capacity: 4,
          sort_order: 1,
        })
        .expect(201);
      const tableId = tableRes.body.id;

      // 2. Abrir cuenta en M-01
      const openRes = await request(app.getHttpServer())
        .post(`/api/v1/branches/${rest.branchId}/accounts`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({
          table_id: tableId,
          guest_count: 3,
        })
        .expect(201);

      const accountId = openRes.body.id;
      expect(openRes.body.status).toBe('OPEN');
      expect(openRes.body.version).toBe(1);

      // Verificar que la mesa física pasó a OCCUPIED
      const tableCheck = await prisma.table.findUnique({ where: { id: tableId } });
      expect(tableCheck?.status).toBe('OCCUPIED');

      // 3. Intentar abrir una segunda cuenta OPEN en M-01 debe fallar con 409 Conflict
      const secondOpenRes = await request(app.getHttpServer())
        .post(`/api/v1/branches/${rest.branchId}/accounts`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({
          table_id: tableId,
          guest_count: 2,
        });
      expect(secondOpenRes.status).toBe(409);
      expect(secondOpenRes.body.errorCode).toBe('TABLE_ALREADY_OCCUPIED');

      // 4. Control de Concurrencia Optimista (version):
      // Ambos meseros leen version = 1.
      // Mesero 1 envía comanda con expected_account_version = 1 -> ÉXITO (version sube a 2)
      const order1Res = await request(app.getHttpServer())
        .post(`/api/v1/accounts/${accountId}/orders`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({
          expected_account_version: 1,
          items: [{ product_id: productA.id, quantity: 1 }],
          notes: 'Comanda Mesero 1',
        })
        .expect(201);

      expect(order1Res.body.account.version).toBe(2);
      expect(order1Res.body.account.subtotal_products_cop).toBe(50000);

      // Mesero 2 envía comanda aún con expected_account_version = 1 -> Conflicto 409
      const order2Res = await request(app.getHttpServer())
        .post(`/api/v1/accounts/${accountId}/orders`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({
          expected_account_version: 1,
          items: [{ product_id: productA.id, quantity: 1 }],
          notes: 'Comanda Mesero 2 en conflicto',
        });

      expect(order2Res.status).toBe(409);
      expect(order2Res.body.errorCode).toBe('ACCOUNT_VERSION_CONFLICT');
      expect(order2Res.body.current_version).toBe(2);

      // Verificar que no se duplicaron totales
      const accountFinal = await prisma.diningAccount.findUnique({ where: { id: accountId } });
      expect(accountFinal?.version).toBe(2);
      expect(accountFinal?.subtotal_products_cop).toBe(50000);
    });
  });

  // ---------------------------------------------------------------------------
  // TC-06-I02: Seguridad en Autopedido QR de Mesa TABLE_QR y Confirmación de Mesero
  // ---------------------------------------------------------------------------
  describe('TC-06-I02: Seguridad en Autopedido QR de Mesa TABLE_QR y Confirmación de Mesero', () => {
    it('debe rechazar PIN incorrecto, nacer en REQUESTED fuera del KDS y procesarse a ACCEPTED', async () => {
      const rest = await registerRestaurant('tc06-i02');
      const { productA } = await seedCatalog(rest.tenantId, rest.branchId);

      // Configurar política de canal DINE_IN con require_table_pin = true
      await prisma.branchChannelPolicy.upsert({
        where: {
          tenant_id_branch_id_fulfillment_type: {
            tenant_id: rest.tenantId,
            branch_id: rest.branchId,
            fulfillment_type: 'DINE_IN',
          },
        },
        create: {
          tenant_id: rest.tenantId,
          branch_id: rest.branchId,
          fulfillment_type: 'DINE_IN',
          enabled: true,
          payment_policy: 'OFFLINE_ONLY',
          require_table_pin: true,
        },
        update: {
          enabled: true,
          payment_policy: 'OFFLINE_ONLY',
          require_table_pin: true,
        },
      });

      // Crear Área y Mesa M-02
      const area = await prisma.diningArea.create({
        data: {
          tenant_id: rest.tenantId,
          branch_id: rest.branchId,
          name: 'Zona Terraza',
          sort_order: 1,
        },
      });

      const table = await prisma.table.create({
        data: {
          tenant_id: rest.tenantId,
          branch_id: rest.branchId,
          area_id: area.id,
          code: 'M-02',
          capacity: 4,
          status: 'FREE',
        },
      });

      // Abrir cuenta en M-02 (genera table_session_pin automático de 4 dígitos)
      const openRes = await request(app.getHttpServer())
        .post(`/api/v1/branches/${rest.branchId}/accounts`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({ table_id: table.id, guest_count: 2 })
        .expect(201);

      const accountId = openRes.body.id;
      const validPin = openRes.body.table_session_pin as string;
      expect(validPin).toBeDefined();
      expect(validPin.length).toBe(4);

      // 1. Pedido con PIN incorrecto responde 403 INVALID_TABLE_PIN
      const badPinRes = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('idempotency-key', `idem-bad-pin-${Date.now()}`)
        .send({
          branch_id: rest.branchId,
          origin: 'TABLE_QR',
          fulfillment_type: 'DINE_IN',
          table_id: table.id,
          table_pin: '0000', // PIN incorrecto
          customer: { name: 'Comensal Terraza', phone: '3001234567', privacy_consent_accepted: true },
          items: [{ product_id: productA.id, quantity: 1 }],
        });

      expect(badPinRes.status).toBe(403);
      expect(badPinRes.body.errorCode).toBe('INVALID_TABLE_PIN');

      // 2. Pedido con PIN correcto nace en REQUESTED
      const goodOrderRes = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('idempotency-key', `idem-good-pin-${Date.now()}`)
        .send({
          branch_id: rest.branchId,
          origin: 'TABLE_QR',
          fulfillment_type: 'DINE_IN',
          table_id: table.id,
          table_pin: validPin,
          customer: { name: 'Comensal Terraza', phone: '3001234567', privacy_consent_accepted: true },
          items: [{ product_id: productA.id, quantity: 1 }],
        })
        .expect(201);

      const orderId = goodOrderRes.body.order_id;
      expect(goodOrderRes.body.status).toBe('REQUESTED');

      // 3. No debe aparecer en la cola de cocina (GET /api/v1/kitchen/orders)
      const kitchenResBefore = await request(app.getHttpServer())
        .get(`/api/v1/kitchen/orders?branchId=${rest.branchId}`)
        .set('Authorization', `Bearer ${rest.token}`)
        .expect(200);

      const foundBefore = kitchenResBefore.body.find((o: any) => o.id === orderId);
      expect(foundBefore).toBeUndefined();

      // 4. El mesero lo confirma (POST /api/v1/orders/:id/process)
      const processRes = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/process`)
        .set('Authorization', `Bearer ${rest.token}`)
        .expect(201);

      expect(processRes.body.status).toBe('ACCEPTED');

      // 5. Debe haberse sumado a la DiningAccount y subido su versión
      const accountAfter = await prisma.diningAccount.findUnique({ where: { id: accountId } });
      expect(accountAfter?.subtotal_products_cop).toBe(50000);
      expect(accountAfter?.version).toBe(2);

      // 6. Ahora sí aparece en la cola de cocina
      const kitchenResAfter = await request(app.getHttpServer())
        .get(`/api/v1/kitchen/orders?branchId=${rest.branchId}`)
        .set('Authorization', `Bearer ${rest.token}`)
        .expect(200);

      const foundAfter = kitchenResAfter.body.find((o: any) => o.id === orderId);
      expect(foundAfter).toBeDefined();
      expect(foundAfter.status).toBe('ACCEPTED');
    });
  });

  // ---------------------------------------------------------------------------
  // TC-06-I03: Persistencia e Idempotencia de Distribución Informativa por Persona
  // ---------------------------------------------------------------------------
  describe('TC-06-I03: Persistencia e Idempotencia de Distribución Informativa por Persona', () => {
    it('debe persistir el reparto de $50.000 entre 3 comensales manteniendo $16.667, $16.667 y $16.666 al peso', async () => {
      const rest = await registerRestaurant('tc06-i03');
      const { productA } = await seedCatalog(rest.tenantId, rest.branchId);

      const area = await prisma.diningArea.create({
        data: { tenant_id: rest.tenantId, branch_id: rest.branchId, name: 'Salón', sort_order: 1 },
      });
      const table = await prisma.table.create({
        data: { tenant_id: rest.tenantId, branch_id: rest.branchId, area_id: area.id, code: 'M-03', capacity: 4, status: 'FREE' },
      });

      // Abrir cuenta
      const openRes = await request(app.getHttpServer())
        .post(`/api/v1/branches/${rest.branchId}/accounts`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({ table_id: table.id, guest_count: 3 })
        .expect(201);
      const accountId = openRes.body.id;

      // Agregar picada de $50.000
      const orderRes = await request(app.getHttpServer())
        .post(`/api/v1/accounts/${accountId}/orders`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({
          expected_account_version: 1,
          items: [{ product_id: productA.id, quantity: 1 }],
        })
        .expect(201);

      const orderItemId = orderRes.body.order.items[0].id;
      expect(orderItemId).toBeDefined();

      // Guardar distribución entre 3 comensales: Carlos, Ana, David
      const diner1Id = crypto.randomUUID();
      const diner2Id = crypto.randomUUID();
      const diner3Id = crypto.randomUUID();

      const putDistRes = await request(app.getHttpServer())
        .put(`/api/v1/accounts/${accountId}/consumption-distribution`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({
          expected_account_version: 2,
          split_rule: 'PROPORTIONAL',
          diners: [
            { id: diner1Id, label: 'Carlos', sort_order: 1 },
            { id: diner2Id, label: 'Ana', sort_order: 2 },
            { id: diner3Id, label: 'David', sort_order: 3 },
          ],
          assignments: [
            { diner_id: diner1Id, order_item_id: orderItemId, share_units: 1, total_item_shares: 3 },
            { diner_id: diner2Id, order_item_id: orderItemId, share_units: 1, total_item_shares: 3 },
            { diner_id: diner3Id, order_item_id: orderItemId, share_units: 1, total_item_shares: 3 },
          ],
        })
        .expect(200);

      expect(putDistRes.body.diners).toHaveLength(3);
      expect(putDistRes.body.unassigned_amount_cop).toBe(0);

      // Consultar GET /api/v1/accounts/:id/consumption-distribution
      const getDistRes = await request(app.getHttpServer())
        .get(`/api/v1/accounts/${accountId}/consumption-distribution`)
        .set('Authorization', `Bearer ${rest.token}`)
        .expect(200);

      const diners = getDistRes.body.diners;
      expect(diners[0].label).toBe('Carlos');
      expect(diners[0].diner_total_cop).toBe(16667);

      expect(diners[1].label).toBe('Ana');
      expect(diners[1].diner_total_cop).toBe(16667);

      expect(diners[2].label).toBe('David');
      expect(diners[2].diner_total_cop).toBe(16666);

      // Invariante inquebrantable: 16667 + 16667 + 16666 = 50000
      const sum = diners.reduce((acc: number, d: any) => acc + d.diner_total_cop, 0);
      expect(sum).toBe(50000);
      expect(getDistRes.body.unassigned_amount_cop).toBe(0);

      // Invariante de cuenta: grand_total_cop permanece inalterado
      const accountFinal = await prisma.diningAccount.findUnique({ where: { id: accountId } });
      expect(accountFinal?.grand_total_cop).toBe(50000);
    });
  });

  // ---------------------------------------------------------------------------
  // TC-06-I04: Prohibición de Cobro en Orden Hija y Cierre Automático por Pago Combinado
  // ---------------------------------------------------------------------------
  describe('TC-06-I04: Prohibición de Cobro en Orden Hija y Cierre Automático por Pago Combinado en Cuenta', () => {
    it('debe bloquear pago directo a orden hija y cerrar automáticamente cuenta y liberar mesa al completar $90.000', async () => {
      const rest = await registerRestaurant('tc06-i04');
      const { productA, productB } = await seedCatalog(rest.tenantId, rest.branchId);

      const area = await prisma.diningArea.create({
        data: { tenant_id: rest.tenantId, branch_id: rest.branchId, name: 'Salón', sort_order: 1 },
      });
      const table = await prisma.table.create({
        data: { tenant_id: rest.tenantId, branch_id: rest.branchId, area_id: area.id, code: 'M-04', capacity: 4, status: 'FREE' },
      });

      // Abrir cuenta
      const openRes = await request(app.getHttpServer())
        .post(`/api/v1/branches/${rest.branchId}/accounts`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({ table_id: table.id, guest_count: 2 })
        .expect(201);
      const accountId = openRes.body.id;

      // Agregar comanda: 1 Picada ($50.000) + 4 Bebidas ($40.000) = $90.000
      const orderRes = await request(app.getHttpServer())
        .post(`/api/v1/accounts/${accountId}/orders`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({
          expected_account_version: 1,
          items: [
            { product_id: productA.id, quantity: 1 },
            { product_id: productB.id, quantity: 4 },
          ],
        })
        .expect(201);

      const childOrderId = orderRes.body.order.id;

      // 1. Intentar pagar directamente la orden hija debe fallar con 409 PAY_VIA_DINING_ACCOUNT
      const directPayRes = await request(app.getHttpServer())
        .post(`/api/v1/orders/${childOrderId}/payments/manual`)
        .set('Authorization', `Bearer ${rest.token}`)
        .set('idempotency-key', `pay-direct-child-${Date.now()}`)
        .send({
          amount_cop: 90000,
          method: 'CASH',
        });

      expect(directPayRes.status).toBe(409);
      expect(directPayRes.body.errorCode).toBe('PAY_VIA_DINING_ACCOUNT');

      // 2. Registrar abono de $40.000 en CASH sobre la cuenta
      const pay1Res = await request(app.getHttpServer())
        .post(`/api/v1/accounts/${accountId}/payments/manual`)
        .set('Authorization', `Bearer ${rest.token}`)
        .set('idempotency-key', `pay-acc-part1-${Date.now()}`)
        .send({
          amount_cop: 40000,
          method: 'CASH',
          idempotency_key: `pay-acc-part1-${Date.now()}`,
        })
        .expect(201);

      expect(pay1Res.body.account.status).toBe('OPEN');
      expect(pay1Res.body.account.payment_status).toBe('PARTIALLY_PAID');
      expect(pay1Res.body.account.paid_total_cop).toBe(40000);

      // Mesa sigue OCCUPIED
      const tableCheck1 = await prisma.table.findUnique({ where: { id: table.id } });
      expect(tableCheck1?.status).toBe('OCCUPIED');

      // 3. Registrar los $50.000 restantes en POS_TERMINAL
      const pay2Res = await request(app.getHttpServer())
        .post(`/api/v1/accounts/${accountId}/payments/manual`)
        .set('Authorization', `Bearer ${rest.token}`)
        .set('idempotency-key', `pay-acc-part2-${Date.now()}`)
        .send({
          amount_cop: 50000,
          method: 'POS_TERMINAL',
          reference: 'Voucher Datafono 9988',
          idempotency_key: `pay-acc-part2-${Date.now()}`,
        })
        .expect(201);

      // Cuenta pasa automáticamente a CLOSED y PAID
      expect(pay2Res.body.account.status).toBe('CLOSED');
      expect(pay2Res.body.account.payment_status).toBe('PAID');
      expect(pay2Res.body.account.paid_total_cop).toBe(90000);

      // Mesa física liberada a FREE
      const tableCheck2 = await prisma.table.findUnique({ where: { id: table.id } });
      expect(tableCheck2?.status).toBe('FREE');

      // Órdenes hijas activas sincronizadas a PAID
      const childCheck = await prisma.order.findUnique({ where: { id: childOrderId } });
      expect(childCheck?.payment_status).toBe('PAID');
    });
  });

  // ---------------------------------------------------------------------------
  // TC-06-I05: Cierre Administrativo con Resolución COURTESY / WRITTEN_OFF
  // ---------------------------------------------------------------------------
  describe('TC-06-I05: Cierre Administrativo con Resolución COURTESY / WRITTEN_OFF', () => {
    it('debe rechazar cierre sin resolución con saldo pendiente y permitir COURTESY registrando auditoría', async () => {
      const rest = await registerRestaurant('tc06-i05');
      const { productA, productB } = await seedCatalog(rest.tenantId, rest.branchId);

      const area = await prisma.diningArea.create({
        data: { tenant_id: rest.tenantId, branch_id: rest.branchId, name: 'Salón', sort_order: 1 },
      });
      const table = await prisma.table.create({
        data: { tenant_id: rest.tenantId, branch_id: rest.branchId, area_id: area.id, code: 'M-05', capacity: 4, status: 'FREE' },
      });

      const openRes = await request(app.getHttpServer())
        .post(`/api/v1/branches/${rest.branchId}/accounts`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({ table_id: table.id, guest_count: 2 })
        .expect(201);
      const accountId = openRes.body.id;

      // Agregar $70.000 ($50.000 + 2x$10.000)
      const orderRes = await request(app.getHttpServer())
        .post(`/api/v1/accounts/${accountId}/orders`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({
          expected_account_version: 1,
          items: [
            { product_id: productA.id, quantity: 1 },
            { product_id: productB.id, quantity: 2 },
          ],
        })
        .expect(201);
      const childOrderId = orderRes.body.order.id;

      // 1. Intentar cerrar con saldo pendiente sin resolución debe responder 409 ACCOUNT_HAS_UNPAID_BALANCE
      const closeFailRes = await request(app.getHttpServer())
        .post(`/api/v1/accounts/${accountId}/close`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({
          expected_account_version: 2,
        });

      expect(closeFailRes.status).toBe(409);
      expect(closeFailRes.body.errorCode).toBe('ACCOUNT_HAS_UNPAID_BALANCE');

      // 2. Cerrar con resolución COURTESY
      const closeSuccessRes = await request(app.getHttpServer())
        .post(`/api/v1/accounts/${accountId}/close`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({
          expected_account_version: 2,
          resolution_type: 'COURTESY',
          reason: 'Cortesía autorizada a mesa de críticos gastronómicos',
        })
        .expect(201);

      expect(closeSuccessRes.body.status).toBe('CLOSED');
      expect(closeSuccessRes.body.payment_status).toBe('COURTESY');
      expect(closeSuccessRes.body.uncollected_amount_cop).toBe(70000);
      expect(closeSuccessRes.body.resolution_type).toBe('COURTESY');

      // Mesa física libre
      const tableCheck = await prisma.table.findUnique({ where: { id: table.id } });
      expect(tableCheck?.status).toBe('FREE');

      // Orden hija sincronizada a COURTESY
      const childCheck = await prisma.order.findUnique({ where: { id: childOrderId } });
      expect(childCheck?.payment_status).toBe('COURTESY');

      // Auditoría registrada
      const audit = await prisma.auditEvent.findFirst({
        where: {
          tenant_id: rest.tenantId,
          entity_id: accountId,
          action: 'DINING_ACCOUNT_RESOLVED_UNCOLLECTED',
        },
      });
      expect(audit).toBeDefined();
      expect((audit?.metadata_json as any).resolution_type).toBe('COURTESY');
      expect((audit?.metadata_json as any).uncollected_amount_cop).toBe(70000);
    });
  });

  // ---------------------------------------------------------------------------
  // TC-06-I06: Reapertura Contable ACCOUNTING_ONLY con Mesa Física Reocupada
  // ---------------------------------------------------------------------------
  describe('TC-06-I06: Reapertura Contable ACCOUNTING_ONLY con Mesa Física Reocupada', () => {
    it('debe rechazar FULL_TABLE si mesa reocupada, reabrir ACCOUNTING_ONLY, anular pago y cerrar de nuevo', async () => {
      const rest = await registerRestaurant('tc06-i06');
      const { productA } = await seedCatalog(rest.tenantId, rest.branchId);

      const area = await prisma.diningArea.create({
        data: { tenant_id: rest.tenantId, branch_id: rest.branchId, name: 'Salón', sort_order: 1 },
      });
      const table = await prisma.table.create({
        data: { tenant_id: rest.tenantId, branch_id: rest.branchId, area_id: area.id, code: 'M-06', capacity: 4, status: 'FREE' },
      });

      // 1. Abrir Cuenta #1 en M-06
      const open1Res = await request(app.getHttpServer())
        .post(`/api/v1/branches/${rest.branchId}/accounts`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({ table_id: table.id, guest_count: 2 })
        .expect(201);
      const acc1Id = open1Res.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/accounts/${acc1Id}/orders`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({
          expected_account_version: 1,
          items: [{ product_id: productA.id, quantity: 1 }],
        })
        .expect(201);

      // Pagar Cuenta #1 en CASH $50.000 -> pasa a CLOSED, mesa M-06 pasa a FREE
      const payAcc1Res = await request(app.getHttpServer())
        .post(`/api/v1/accounts/${acc1Id}/payments/manual`)
        .set('Authorization', `Bearer ${rest.token}`)
        .set('idempotency-key', `pay-acc1-cash-${Date.now()}`)
        .send({
          amount_cop: 50000,
          method: 'CASH',
          idempotency_key: `pay-acc1-cash-${Date.now()}`,
        })
        .expect(201);

      const payment1Id = payAcc1Res.body.payment.id;
      expect(payAcc1Res.body.account.status).toBe('CLOSED');

      // 2. Llega otro grupo y se abre Cuenta #2 en la misma mesa M-06
      const open2Res = await request(app.getHttpServer())
        .post(`/api/v1/branches/${rest.branchId}/accounts`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({ table_id: table.id, guest_count: 3 })
        .expect(201);
      const acc2Id = open2Res.body.id;
      expect(open2Res.body.status).toBe('OPEN');

      const tableCheckOccupied = await prisma.table.findUnique({ where: { id: table.id } });
      expect(tableCheckOccupied?.status).toBe('OCCUPIED');

      // 3. Intentar reabrir Cuenta #1 con mode = FULL_TABLE debe fallar con 409 TABLE_ALREADY_OCCUPIED
      const reopenFullRes = await request(app.getHttpServer())
        .post(`/api/v1/accounts/${acc1Id}/reopen`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({
          mode: 'FULL_TABLE',
          reason: 'Intento reabrir con mesa física ocupada',
        });

      expect(reopenFullRes.status).toBe(409);
      expect(reopenFullRes.body.errorCode).toBe('TABLE_ALREADY_OCCUPIED');

      // 4. Reabrir Cuenta #1 con mode = ACCOUNTING_ONLY -> Éxito, REOPENED_ACCOUNTING sin chocar
      const reopenAccRes = await request(app.getHttpServer())
        .post(`/api/v1/accounts/${acc1Id}/reopen`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({
          mode: 'ACCOUNTING_ONLY',
          reason: 'Reapertura para corregir forma de pago a datáfono',
        })
        .expect(201);

      expect(reopenAccRes.body.status).toBe('REOPENED_ACCOUNTING');

      // Mesa física sigue ocupada por Cuenta #2
      const tableStillOccupied = await prisma.table.findUnique({ where: { id: table.id } });
      expect(tableStillOccupied?.status).toBe('OCCUPIED');

      // Cuenta #2 sigue OPEN sin alteración
      const acc2Check = await prisma.diningAccount.findUnique({ where: { id: acc2Id } });
      expect(acc2Check?.status).toBe('OPEN');

      // 5. Anular el pago erróneo en efectivo
      await request(app.getHttpServer())
        .post(`/api/v1/payments/${payment1Id}/void`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({ reason: 'Digitación errónea: era tarjeta débito' })
        .expect(201);

      // Cuenta #1 ahora tiene saldo pendiente $50.000
      const acc1AfterVoid = await prisma.diningAccount.findUnique({ where: { id: acc1Id } });
      expect(acc1AfterVoid?.paid_total_cop).toBe(0);
      expect(acc1AfterVoid?.payment_status).toBe('UNPAID');

      // 6. Registrar pago correcto con datáfono
      const payCorrectRes = await request(app.getHttpServer())
        .post(`/api/v1/accounts/${acc1Id}/payments/manual`)
        .set('Authorization', `Bearer ${rest.token}`)
        .set('idempotency-key', `pay-acc1-pos-${Date.now()}`)
        .send({
          amount_cop: 50000,
          method: 'POS_TERMINAL',
          reference: 'Voucher 4455',
          idempotency_key: `pay-acc1-pos-${Date.now()}`,
        })
        .expect(201);

      // Cierra automáticamente al completar el 100%
      expect(payCorrectRes.body.account.status).toBe('CLOSED');
      expect(payCorrectRes.body.account.payment_status).toBe('PAID');

      // La mesa física sigue OCCUPIED por Cuenta #2
      const tableFinalCheck = await prisma.table.findUnique({ where: { id: table.id } });
      expect(tableFinalCheck?.status).toBe('OCCUPIED');
    });
  });

  // ---------------------------------------------------------------------------
  // TC-06-I07: Extensión de Reportes sin Doble Conteo de Órdenes Hijas
  // ---------------------------------------------------------------------------
  describe('TC-06-I07: Extensión de Reportes sin Doble Conteo de Órdenes Hijas', () => {
    it('debe consolidar órdenes independientes y DiningAccounts sin sumar órdenes hijas, cumpliendo is_balanced', async () => {
      const rest = await registerRestaurant('tc06-i07');
      const testDate = '2026-10-28';
      const orderCreatedAt = new Date('2026-10-28T12:00:00.000-05:00');

      // 1. Orden independiente de domicilio (dining_account_id = null): $100.000 PAID
      await prisma.order.create({
        data: {
          tenant_id: rest.tenantId,
          branch_id: rest.branchId,
          order_code: '#DOM-01',
          origin: 'WEB_DIRECT',
          fulfillment_type: 'DELIVERY',
          status: 'DELIVERED',
          payment_policy: 'OFFLINE_ONLY',
          payment_status: 'PAID',
          public_token: `token-dom-${Date.now()}`,
          subtotal_products_cop: 90000,
          discount_total_cop: 0,
          delivery_fee_cop: 10000,
          tax_total_cop: 0,
          tip_cop: 0,
          grand_total_cop: 100000,
          paid_total_cop: 100000,
          uncollected_amount_cop: 0,
          customer_snapshot_json: { name: 'Comensal Domicilio', phone_e164: '+573001234567' },
          tax_summary_snapshot_json: { taxable_base_cop: 90000, tax_inc_cop: 0, tax_iva_cop: 0 },
          created_at: orderCreatedAt,
          payments: {
            create: {
              tenant_id: rest.tenantId,
              branch_id: rest.branchId,
              method: 'CASH',
              amount_cop: 100000,
              status: 'APPROVED',
              idempotency_key: `pay-dom-${Date.now()}`,
              created_by: rest.adminUserId,
            },
          },
        },
      });

      // 2. Mesa y DiningAccount de salón por $80.000 con 2 órdenes hijas ($50.000 y $30.000)
      const area = await prisma.diningArea.create({
        data: { tenant_id: rest.tenantId, branch_id: rest.branchId, name: 'Salón', sort_order: 1 },
      });
      const table = await prisma.table.create({
        data: { tenant_id: rest.tenantId, branch_id: rest.branchId, area_id: area.id, code: 'M-07', capacity: 4, status: 'FREE' },
      });

      const diningAccount = await prisma.diningAccount.create({
        data: {
          tenant_id: rest.tenantId,
          branch_id: rest.branchId,
          table_id: table.id,
          account_code: '#ACC-07',
          status: 'CLOSED',
          payment_status: 'PAID',
          table_session_pin: '7788',
          subtotal_products_cop: 80000,
          discount_total_cop: 0,
          tip_cop: 0,
          grand_total_cop: 80000,
          paid_total_cop: 80000,
          uncollected_amount_cop: 0,
          opened_at: orderCreatedAt,
          closed_at: orderCreatedAt,
          opened_by: rest.adminUserId,
          closed_by: rest.adminUserId,
          payments: {
            create: {
              tenant_id: rest.tenantId,
              branch_id: rest.branchId,
              method: 'POS_TERMINAL',
              amount_cop: 80000,
              status: 'APPROVED',
              idempotency_key: `pay-acc7-${Date.now()}`,
              created_by: rest.adminUserId,
            },
          },
        },
      });

      // Órdenes hijas vinculadas a la cuenta
      await prisma.order.create({
        data: {
          tenant_id: rest.tenantId,
          branch_id: rest.branchId,
          dining_account_id: diningAccount.id,
          table_id: table.id,
          order_code: '#CHILD-01',
          origin: 'STAFF',
          fulfillment_type: 'DINE_IN',
          status: 'ACCEPTED',
          payment_policy: 'OFFLINE_ONLY',
          payment_status: 'PAID',
          public_token: `token-ch1-${Date.now()}`,
          subtotal_products_cop: 50000,
          discount_total_cop: 0,
          delivery_fee_cop: 0,
          tax_total_cop: 0,
          tip_cop: 0,
          grand_total_cop: 50000,
          paid_total_cop: 0,
          uncollected_amount_cop: 0,
          customer_snapshot_json: { name: 'Comensal Salón 1', phone_e164: '+573001234567' },
          tax_summary_snapshot_json: { taxable_base_cop: 50000, tax_inc_cop: 0, tax_iva_cop: 0 },
          created_at: orderCreatedAt,
        },
      });

      await prisma.order.create({
        data: {
          tenant_id: rest.tenantId,
          branch_id: rest.branchId,
          dining_account_id: diningAccount.id,
          table_id: table.id,
          order_code: '#CHILD-02',
          origin: 'STAFF',
          fulfillment_type: 'DINE_IN',
          status: 'ACCEPTED',
          payment_policy: 'OFFLINE_ONLY',
          payment_status: 'PAID',
          public_token: `token-ch2-${Date.now()}`,
          subtotal_products_cop: 30000,
          discount_total_cop: 0,
          delivery_fee_cop: 0,
          tax_total_cop: 0,
          tip_cop: 0,
          grand_total_cop: 30000,
          paid_total_cop: 0,
          uncollected_amount_cop: 0,
          customer_snapshot_json: { name: 'Comensal Salón 2', phone_e164: '+573001234567' },
          tax_summary_snapshot_json: { taxable_base_cop: 30000, tax_inc_cop: 0, tax_iva_cop: 0 },
          created_at: orderCreatedAt,
        },
      });

      // 3. Consultar reporte de ventas
      const res = await request(app.getHttpServer())
        .get(`/api/v1/reports/sales?date_from=${testDate}&date_to=${testDate}&branch_id=${rest.branchId}`)
        .set('Authorization', `Bearer ${rest.token}`)
        .expect(200);

      const report = res.body;

      // Cero doble conteo: 100.000 (domicilio) + 80.000 (cuenta salón) = 180.000 (¡NUNCA 260.000!)
      expect(report.billing_summary.confirmed_orders_count).toBe(2);
      expect(report.billing_summary.gross_billed_total_cop).toBe(180000);
      expect(report.billing_summary.net_products_sales_cop).toBe(170000);
      expect(report.billing_summary.delivery_fees_total_cop).toBe(10000);

      // Recaudo: CASH 100.000 + POS_TERMINAL 80.000 = 180.000
      expect(report.reconciliation_summary.collected_total_cop).toBe(180000);
      expect(report.collections_by_method.CASH).toBe(100000);
      expect(report.collections_by_method.POS_TERMINAL).toBe(80000);

      // Invariante de balance contable
      expect(report.reconciliation_summary.is_balanced).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // TC-06-I08: Bloqueo de Desactivación de dining y Aislamiento Multi-Tenant
  // ---------------------------------------------------------------------------
  describe('TC-06-I08: Bloqueo de Desactivación de dining por OpenOperationsChecker y Aislamiento Multi-Tenant', () => {
    it('debe rechazar desactivación con 409 si hay cuenta abierta y aislar estrictamente entre tenants', async () => {
      const restA = await registerRestaurant('tc06-i08-a');
      const restB = await registerRestaurant('tc06-i08-b');

      // Crear mesa y abrir cuenta en Restaurante A
      const areaA = await prisma.diningArea.create({
        data: { tenant_id: restA.tenantId, branch_id: restA.branchId, name: 'Salón A', sort_order: 1 },
      });
      const tableA = await prisma.table.create({
        data: { tenant_id: restA.tenantId, branch_id: restA.branchId, area_id: areaA.id, code: 'MA-01', capacity: 4, status: 'FREE' },
      });

      const openRes = await request(app.getHttpServer())
        .post(`/api/v1/branches/${restA.branchId}/accounts`)
        .set('Authorization', `Bearer ${restA.token}`)
        .send({ table_id: tableA.id, guest_count: 2 })
        .expect(201);
      const accountAId = openRes.body.id;

      // 1. Intentar desactivar módulo dining (junto con su dependiente dining.consumption_split)
      // en Restaurante A mientras tiene una cuenta OPEN debe fallar con 409 MODULE_HAS_OPEN_OPERATIONS
      const deactivateRes = await request(app.getHttpServer())
        .patch('/api/v1/admin/modules')
        .set('Authorization', `Bearer ${restA.token}`)
        .send({
          modules: [
            { module_key: 'channel.dine_in_qr', enabled: false },
            { module_key: 'dining.consumption_split', enabled: false },
            { module_key: 'dining', enabled: false },
          ],
        });

      expect(deactivateRes.status).toBe(409);
      expect(deactivateRes.body.errorCode).toBe('MODULE_HAS_OPEN_OPERATIONS');

      // 2. Aislamiento Multi-Tenant: Usuario del Restaurante B intenta consultar o modificar datos del Restaurante A
      // A. Consultar plano de mesas de Restaurante A usando token de B
      const getTablesFail = await request(app.getHttpServer())
        .get(`/api/v1/branches/${restA.branchId}/tables`)
        .set('Authorization', `Bearer ${restB.token}`);
      // Debe responder 404 o lista de áreas vacía (ya que el tenantId del token B no encuentra las mesas de A)
      if (getTablesFail.status === 200) {
        expect(getTablesFail.body.areas).toHaveLength(0);
      } else {
        expect([403, 404]).toContain(getTablesFail.status);
      }

      // B. Consultar cuenta de Restaurante A usando token de B
      const getAccFail = await request(app.getHttpServer())
        .get(`/api/v1/accounts/${accountAId}`)
        .set('Authorization', `Bearer ${restB.token}`);
      expect(getAccFail.status).toBe(404);

      // C. Modificar distribución de cuenta de Restaurante A usando token de B
      const putDistFail = await request(app.getHttpServer())
        .put(`/api/v1/accounts/${accountAId}/consumption-distribution`)
        .set('Authorization', `Bearer ${restB.token}`)
        .send({
          expected_account_version: 1,
          split_rule: 'EQUAL',
          diners: [{ label: 'Hacker', sort_order: 1 }],
        });
      expect(putDistFail.status).toBe(404);
    });
  });
});
