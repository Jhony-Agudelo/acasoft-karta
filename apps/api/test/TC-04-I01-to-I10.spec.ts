import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from './test-app';
import { PrismaService } from '../src/database/prisma.service';

describe('Integración Fase 04: TC-04-I01 a TC-04-I10', () => {
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

  async function registerRestaurant(prefix: string, profile = 'FULL_PANEL') {
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
        initial_profile: profile,
      })
      .expect(201);

    const tenantId = res.body.tenant.id as string;
    const branchId = res.body.branch.id as string;

    // Actualizar plan a PLAN_OPERATIONS_PRO para tener entitlements de payments.manual y kitchen
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { plan_id: 'PLAN_OPERATIONS_PRO' },
    });

    // Asegurar activación de módulos de Fase 04
    const modulesToEnable = ['ordering', 'order_panel', 'payments.manual', 'kitchen'];
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
      slug,
    };
  }

  async function seedCatalog(tenantId: string, branchId: string) {
    return prisma.withTenant(tenantId, async (tx) => {
      const menu = await tx.menu.create({
        data: {
          tenant_id: tenantId,
          branch_id: branchId,
          name: 'Menú Gastronómico',
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
          name: 'Parrillada Mixta',
          price_cop: 35000,
          status: 'ACTIVE',
          tax_type: 'NONE',
          tax_rate_bp: 0,
        },
      });

      const productB = await tx.product.create({
        data: {
          tenant_id: tenantId,
          category_id: category.id,
          name: 'Jugo Natural',
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
  // TC-04-I01: Bloqueo de Cobros sobre Solicitudes en REQUESTED y NOT_TRACKED
  // ---------------------------------------------------------------------------
  describe('TC-04-I01: Bloqueo de Cobros sobre Solicitudes en REQUESTED y NOT_TRACKED', () => {
    it('debe rechazar cobro con 409 ORDER_MUST_BE_ACCEPTED_BEFORE_PAYMENT si el pedido está en REQUESTED', async () => {
      const rest = await registerRestaurant('tc04-i01-req');
      const { productA } = await seedCatalog(rest.tenantId, rest.branchId);

      // Crear pedido público en REQUESTED con política OFFLINE_ONLY
      await prisma.branchChannelPolicy.updateMany({
        where: { tenant_id: rest.tenantId, branch_id: rest.branchId, fulfillment_type: 'PICKUP' },
        data: { payment_policy: 'OFFLINE_ONLY' },
      });

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('x-tenant-id', rest.tenantId)
        .set('idempotency-key', `idem-${Date.now()}`)
        .send({
          branch_id: rest.branchId,
          origin: 'WHATSAPP',
          fulfillment_type: 'PICKUP',
          customer: {
            name: 'Cliente Prueba',
            phone: '3001234567',
            privacy_consent_accepted: true,
          },
          items: [{ product_id: productA.id, quantity: 1 }],
        })
        .expect(201);

      const orderId = createRes.body.order_id;

      // Intentar registrar cobro manual en REQUESTED
      const payRes = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/payments/manual`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({
          method: 'CASH',
          amount_cop: 35000,
        })
        .expect(409);

      expect(payRes.body.errorCode).toBe('ORDER_MUST_BE_ACCEPTED_BEFORE_PAYMENT');
    });

    it('debe rechazar cobro con 409 PAYMENT_NOT_ALLOWED_FOR_POLICY si la orden tiene política NONE (NOT_TRACKED)', async () => {
      const rest = await registerRestaurant('tc04-i01-none');
      const { productA } = await seedCatalog(rest.tenantId, rest.branchId);

      // Política NONE
      await prisma.branchChannelPolicy.updateMany({
        where: { tenant_id: rest.tenantId, branch_id: rest.branchId, fulfillment_type: 'PICKUP' },
        data: { payment_policy: 'NONE' },
      });

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('x-tenant-id', rest.tenantId)
        .set('idempotency-key', `idem-${Date.now()}`)
        .send({
          branch_id: rest.branchId,
          origin: 'WHATSAPP',
          fulfillment_type: 'PICKUP',
          customer: {
            name: 'Cliente None',
            phone: '3001234567',
            privacy_consent_accepted: true,
          },
          items: [{ product_id: productA.id, quantity: 1 }],
        })
        .expect(201);

      const orderId = createRes.body.order_id;

      // Aceptar la orden
      await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/process`)
        .set('Authorization', `Bearer ${rest.token}`)
        .expect(201);

      // Intentar registrar cobro manual sobre política NONE
      const payRes = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/payments/manual`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({
          method: 'CASH',
          amount_cop: 35000,
        })
        .expect(409);

      expect(payRes.body.errorCode).toBe('PAYMENT_NOT_ALLOWED_FOR_POLICY');
    });
  });

  // ---------------------------------------------------------------------------
  // TC-04-I02: Pagos Combinados, Idempotencia por Tenant y Prevención de Sobrecobro
  // ---------------------------------------------------------------------------
  describe('TC-04-I02: Pagos Combinados, Idempotencia por Tenant y Prevención de Sobrecobro', () => {
    it('debe permitir abono parcial, reintentar idempotentemente, bloquear sobrecobro y liquidar a PAID', async () => {
      const rest = await registerRestaurant('tc04-i02');
      const { productA, productB } = await seedCatalog(rest.tenantId, rest.branchId);

      await prisma.branchChannelPolicy.updateMany({
        where: { tenant_id: rest.tenantId, branch_id: rest.branchId, fulfillment_type: 'PICKUP' },
        data: { payment_policy: 'OFFLINE_ONLY' },
      });

      // Total: 35000 + 10000 = 45000 COP
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('x-tenant-id', rest.tenantId)
        .set('idempotency-key', `idem-${Date.now()}`)
        .send({
          branch_id: rest.branchId,
          origin: 'WHATSAPP',
          fulfillment_type: 'PICKUP',
          customer: {
            name: 'Cliente Combinado',
            phone: '3001234567',
            privacy_consent_accepted: true,
          },
          items: [
            { product_id: productA.id, quantity: 1 },
            { product_id: productB.id, quantity: 1 },
          ],
        })
        .expect(201);

      const orderId = createRes.body.order_id;
      expect(createRes.body.grand_total_cop).toBe(45000);

      // Procesar orden a ACCEPTED
      await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/process`)
        .set('Authorization', `Bearer ${rest.token}`)
        .expect(201);

      const paymentKey1 = `pay-key-1-${Date.now()}`;

      // 1. Primer abono parcial de $20.000 en CASH
      const pay1Res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/payments/manual`)
        .set('Authorization', `Bearer ${rest.token}`)
        .set('idempotency-key', paymentKey1)
        .send({
          method: 'CASH',
          amount_cop: 20000,
          cash_received_cop: 50000,
        })
        .expect(201);

      expect(pay1Res.body.order.payment_status).toBe('PARTIALLY_PAID');
      expect(pay1Res.body.order.paid_total_cop).toBe(20000);
      expect(pay1Res.body.payment.change_given_cop).toBe(30000);

      // 2. Replay idempotente con la misma clave: debe devolver el mismo pago sin sumar
      const replayRes = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/payments/manual`)
        .set('Authorization', `Bearer ${rest.token}`)
        .set('idempotency-key', paymentKey1)
        .send({
          method: 'CASH',
          amount_cop: 20000,
        })
        .expect(201);

      expect(replayRes.body.idempotent_replayed).toBe(true);
      expect(replayRes.body.order.paid_total_cop).toBe(20000);

      // 3. Intento de sobrecobro: $30.000 (20000 + 30000 = 50000 > 45000)
      const overRes = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/payments/manual`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({
          method: 'POS_TERMINAL',
          amount_cop: 30000,
        })
        .expect(409);

      expect(overRes.body.errorCode).toBe('PAYMENT_EXCEEDS_BALANCE');

      // 4. Segundo pago exacto restante: $25.000 en MANUAL_TRANSFER -> PAID
      const pay2Res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/payments/manual`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({
          method: 'MANUAL_TRANSFER',
          amount_cop: 25000,
          reference_note: 'Transferencia Nequi Ref 9901',
        })
        .expect(201);

      expect(pay2Res.body.order.payment_status).toBe('PAID');
      expect(pay2Res.body.order.paid_total_cop).toBe(45000);
    });
  });

  // ---------------------------------------------------------------------------
  // TC-04-I03: Anulación Parcial con void y Recálculo a PARTIALLY_PAID
  // ---------------------------------------------------------------------------
  describe('TC-04-I03: Anulación Parcial con void y Recálculo a PARTIALLY_PAID', () => {
    it('debe anular el segundo pago y regresar la orden automáticamente a PARTIALLY_PAID', async () => {
      const rest = await registerRestaurant('tc04-i03');
      const { productA, productB } = await seedCatalog(rest.tenantId, rest.branchId);

      await prisma.branchChannelPolicy.updateMany({
        where: { tenant_id: rest.tenantId, branch_id: rest.branchId, fulfillment_type: 'PICKUP' },
        data: { payment_policy: 'OFFLINE_ONLY' },
      });

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('x-tenant-id', rest.tenantId)
        .set('idempotency-key', `idem-${Date.now()}`)
        .send({
          branch_id: rest.branchId,
          origin: 'WHATSAPP',
          fulfillment_type: 'PICKUP',
          customer: {
            name: 'Cliente Anulacion',
            phone: '3001234567',
            privacy_consent_accepted: true,
          },
          items: [
            { product_id: productA.id, quantity: 1 },
            { product_id: productB.id, quantity: 1 },
          ],
        })
        .expect(201);

      const orderId = createRes.body.order_id;
      await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/process`)
        .set('Authorization', `Bearer ${rest.token}`)
        .expect(201);

      // Pago 1: $20.000
      await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/payments/manual`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({ method: 'CASH', amount_cop: 20000 })
        .expect(201);

      // Pago 2: $25.000
      const pay2Res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/payments/manual`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({ method: 'POS_TERMINAL', amount_cop: 25000 })
        .expect(201);

      const payment2Id = pay2Res.body.payment.id;

      // Anular el Pago 2
      const voidRes = await request(app.getHttpServer())
        .post(`/api/v1/payments/${payment2Id}/void`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({ reason: 'Tarjeta rechazada tras aprobación inicial en datáfono' })
        .expect(201);

      expect(voidRes.body.payment.status).toBe('VOIDED');
      expect(voidRes.body.order.payment_status).toBe('PARTIALLY_PAID');
      expect(voidRes.body.order.paid_total_cop).toBe(20000);
    });
  });

  // ---------------------------------------------------------------------------
  // TC-04-I04: Bloqueo de Cancelación con Pagos Activos y Bloqueo de Reducción
  // ---------------------------------------------------------------------------
  describe('TC-04-I04: Bloqueo de Cancelación con Pagos Activos y Bloqueo de Reducción', () => {
    it('debe impedir cancelar la orden con pagos activos y permitirla tras anular todos los pagos', async () => {
      const rest = await registerRestaurant('tc04-i04');
      const { productA } = await seedCatalog(rest.tenantId, rest.branchId);

      await prisma.branchChannelPolicy.updateMany({
        where: { tenant_id: rest.tenantId, branch_id: rest.branchId, fulfillment_type: 'PICKUP' },
        data: { payment_policy: 'OFFLINE_ONLY' },
      });

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('x-tenant-id', rest.tenantId)
        .set('idempotency-key', `idem-${Date.now()}`)
        .send({
          branch_id: rest.branchId,
          origin: 'WHATSAPP',
          fulfillment_type: 'PICKUP',
          customer: {
            name: 'Cliente Cancelacion',
            phone: '3001234567',
            privacy_consent_accepted: true,
          },
          items: [{ product_id: productA.id, quantity: 1 }],
        })
        .expect(201);

      const orderId = createRes.body.order_id;
      await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/process`)
        .set('Authorization', `Bearer ${rest.token}`)
        .expect(201);

      // Registrar pago de $35.000
      const payRes = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/payments/manual`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({ method: 'CASH', amount_cop: 35000 })
        .expect(201);

      const paymentId = payRes.body.payment.id;

      // 1. Intentar cancelar con pago activo -> 409
      const cancelRes = await request(app.getHttpServer())
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({ to_status: 'CANCELLED', reason: 'Cliente canceló' })
        .expect(409);

      expect(cancelRes.body.errorCode).toBe('ORDER_HAS_ACTIVE_PAYMENTS');

      // 2. Anular el pago
      await request(app.getHttpServer())
        .post(`/api/v1/payments/${paymentId}/void`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({ reason: 'Reembolso por cancelación solicitada' })
        .expect(201);

      // 3. Cancelar ahora que paid_total_cop = 0 -> 200 OK
      const cancelOkRes = await request(app.getHttpServer())
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({ to_status: 'CANCELLED', reason: 'Cancelación confirmada y dinero reembolsado' })
        .expect(200);

      expect(cancelOkRes.body.order?.status ?? cancelOkRes.body.status).toBe('CANCELLED');
    });
  });

  // ---------------------------------------------------------------------------
  // TC-04-I05: Ciclo Completo de Resolución COURTESY / WRITTEN_OFF y Reversión
  // ---------------------------------------------------------------------------
  describe('TC-04-I05: Ciclo Completo de Resolución COURTESY / WRITTEN_OFF y Reversión', () => {
    it('debe rechazar WRITTEN_OFF en ACCEPTED, permitirlo en READY/DELIVERED, congelar y revertir', async () => {
      const rest = await registerRestaurant('tc04-i05');
      const { productA } = await seedCatalog(rest.tenantId, rest.branchId);

      await prisma.branchChannelPolicy.updateMany({
        where: { tenant_id: rest.tenantId, branch_id: rest.branchId, fulfillment_type: 'PICKUP' },
        data: { payment_policy: 'OFFLINE_ONLY' },
      });

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('x-tenant-id', rest.tenantId)
        .set('idempotency-key', `idem-${Date.now()}`)
        .send({
          branch_id: rest.branchId,
          origin: 'WHATSAPP',
          fulfillment_type: 'PICKUP',
          customer: {
            name: 'Cliente Resolucion',
            phone: '3001234567',
            privacy_consent_accepted: true,
          },
          items: [{ product_id: productA.id, quantity: 1 }],
        })
        .expect(201);

      const orderId = createRes.body.order_id;
      await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/process`)
        .set('Authorization', `Bearer ${rest.token}`)
        .expect(201);

      // Abono de $10.000
      const payRes = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/payments/manual`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({ method: 'CASH', amount_cop: 10000 })
        .expect(201);

      const paymentId = payRes.body.payment.id;

      // 1. Intentar WRITTEN_OFF en estado ACCEPTED -> 400 Bad Request
      const earlyWriteOff = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/resolve-uncollected`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({
          resolution_type: 'WRITTEN_OFF',
          reason: 'Cliente se fue sin pagar',
        })
        .expect(400);

      expect(earlyWriteOff.body.errorCode).toBe('INVALID_ORDER_STATUS_FOR_RESOLUTION');

      // Avanzar pedido a PREPARING -> READY -> PICKED_UP
      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({ to_status: 'PREPARING' })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({ to_status: 'READY' })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({ to_status: 'PICKED_UP' })
        .expect(200);

      // 2. Ejecutar WRITTEN_OFF sobre orden entregada
      const resolveRes = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/resolve-uncollected`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({
          resolution_type: 'WRITTEN_OFF',
          reason: 'Cliente retiró y prometió transferencia Nequi que nunca llegó',
        })
        .expect(201);

      expect(resolveRes.body.payment_status).toBe('WRITTEN_OFF');
      expect(resolveRes.body.uncollected_amount_cop).toBe(25000);
      expect(resolveRes.body.paid_total_cop).toBe(10000);

      // 3. Congelamiento: Intentar anular el pago previo -> 409
      const voidFreezeRes = await request(app.getHttpServer())
        .post(`/api/v1/payments/${paymentId}/void`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({ reason: 'Intento de anulación en orden resuelta' })
        .expect(409);

      expect(voidFreezeRes.body.errorCode).toBe('ORDER_RESOLUTION_ACTIVE');

      // 4. Revertir resolución
      const revertRes = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/revert-resolution`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({ reason: 'Cliente se comunicó y envió comprobante' })
        .expect(201);

      expect(revertRes.body.payment_status).toBe('PARTIALLY_PAID');
      expect(revertRes.body.uncollected_amount_cop).toBe(0);

      // 5. Completar pago tras reversión -> PAID
      const finalPay = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/payments/manual`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({ method: 'MANUAL_TRANSFER', amount_cop: 25000 })
        .expect(201);

      expect(finalPay.body.order.payment_status).toBe('PAID');
    });
  });

  // ---------------------------------------------------------------------------
  // TC-04-I06: Puerta de Pre-Cobro require_payment_before_preparation
  // ---------------------------------------------------------------------------
  describe('TC-04-I06: Puerta de Pre-Cobro require_payment_before_preparation', () => {
    it('debe excluir de KDS y bloquear paso a PREPARING hasta que la orden esté PAID', async () => {
      const rest = await registerRestaurant('tc04-i06');
      const { productA } = await seedCatalog(rest.tenantId, rest.branchId);

      // Configurar require_payment_before_preparation = true
      await prisma.branchChannelPolicy.updateMany({
        where: { tenant_id: rest.tenantId, branch_id: rest.branchId, fulfillment_type: 'PICKUP' },
        data: {
          payment_policy: 'OFFLINE_ONLY',
          require_payment_before_preparation: true,
        },
      });

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('x-tenant-id', rest.tenantId)
        .set('idempotency-key', `idem-${Date.now()}`)
        .send({
          branch_id: rest.branchId,
          origin: 'WHATSAPP',
          fulfillment_type: 'PICKUP',
          customer: {
            name: 'Cliente Pre-Cobro',
            phone: '3001234567',
            privacy_consent_accepted: true,
          },
          items: [{ product_id: productA.id, quantity: 1 }],
        })
        .expect(201);

      const orderId = createRes.body.order_id;
      await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/process`)
        .set('Authorization', `Bearer ${rest.token}`)
        .expect(201);

      // 1. Consultar KDS: no debe aparecer
      const kdsRes1 = await request(app.getHttpServer())
        .get(`/api/v1/kitchen/orders?branchId=${rest.branchId}`)
        .set('Authorization', `Bearer ${rest.token}`)
        .expect(200);

      const found1 = kdsRes1.body.some((o: any) => o.id === orderId);
      expect(found1).toBe(false);

      // 2. Intentar avanzar manualmente a PREPARING -> 409
      const prepRes = await request(app.getHttpServer())
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({ to_status: 'PREPARING' })
        .expect(409);

      expect(prepRes.body.errorCode).toBe('PAYMENT_REQUIRED_BEFORE_PREPARATION');

      // 3. Registrar pago total en caja
      await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/payments/manual`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({ method: 'CASH', amount_cop: 35000 })
        .expect(201);

      // 4. Ahora sí aparece en KDS
      const kdsRes2 = await request(app.getHttpServer())
        .get(`/api/v1/kitchen/orders?branchId=${rest.branchId}`)
        .set('Authorization', `Bearer ${rest.token}`)
        .expect(200);

      const found2 = kdsRes2.body.some((o: any) => o.id === orderId);
      expect(found2).toBe(true);

      // 5. Ahora permite avanzar a PREPARING
      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({ to_status: 'PREPARING' })
        .expect(200);
    });
  });

  // ---------------------------------------------------------------------------
  // TC-04-I07: Enrutamiento por Estación en KDS y Sincronización Automática a Orden
  // ---------------------------------------------------------------------------
  describe('TC-04-I07: Enrutamiento por Estación en KDS y Sincronización Automática', () => {
    it('debe sincronizar automáticamente PREPARING al marcar un ítem y READY cuando todos están READY', async () => {
      const rest = await registerRestaurant('tc04-i07');
      const { productA, productB } = await seedCatalog(rest.tenantId, rest.branchId);

      await prisma.branchChannelPolicy.updateMany({
        where: { tenant_id: rest.tenantId, branch_id: rest.branchId, fulfillment_type: 'PICKUP' },
        data: { payment_policy: 'OFFLINE_ONLY' },
      });

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('x-tenant-id', rest.tenantId)
        .set('idempotency-key', `idem-${Date.now()}`)
        .send({
          branch_id: rest.branchId,
          origin: 'WHATSAPP',
          fulfillment_type: 'PICKUP',
          customer: {
            name: 'Cliente Estaciones',
            phone: '3001234567',
            privacy_consent_accepted: true,
          },
          items: [
            { product_id: productA.id, quantity: 1 },
            { product_id: productB.id, quantity: 1 },
          ],
        })
        .expect(201);

      const orderId = createRes.body.order_id;
      await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/process`)
        .set('Authorization', `Bearer ${rest.token}`)
        .expect(201);

      const orderBefore = await prisma.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });

      const item1Id = orderBefore!.items[0].id;
      const item2Id = orderBefore!.items[1].id;

      // 1. Marcar item1 como PREPARING -> la orden pasa a PREPARING
      const kdsUpdate1 = await request(app.getHttpServer())
        .patch(`/api/v1/kitchen/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({
          item_ids: [item1Id],
          to_status: 'PREPARING',
        })
        .expect(200);

      expect(kdsUpdate1.body.order.status).toBe('PREPARING');

      // 2. Marcar item1 como READY mientras item2 sigue en PENDING -> orden sigue en PREPARING
      const kdsUpdate2 = await request(app.getHttpServer())
        .patch(`/api/v1/kitchen/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({
          item_ids: [item1Id],
          to_status: 'READY',
        })
        .expect(200);

      expect(kdsUpdate2.body.order.status).toBe('PREPARING');

      // 3. Marcar item2 como READY -> toda la orden pasa a READY
      const kdsUpdate3 = await request(app.getHttpServer())
        .patch(`/api/v1/kitchen/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({
          item_ids: [item2Id],
          to_status: 'READY',
        })
        .expect(200);

      expect(kdsUpdate3.body.order.status).toBe('READY');
    });
  });

  // ---------------------------------------------------------------------------
  // TC-04-I08: Bloqueo en OpenOperationsChecker
  // ---------------------------------------------------------------------------
  describe('TC-04-I08: Bloqueo en OpenOperationsChecker por Órdenes PREPARING o Saldos sin Resolver', () => {
    it('debe rechazar desactivación de kitchen si hay orden en PREPARING y de payments.manual si hay saldo UNPAID', async () => {
      const rest = await registerRestaurant('tc04-i08');
      const { productA } = await seedCatalog(rest.tenantId, rest.branchId);

      await prisma.branchChannelPolicy.updateMany({
        where: { tenant_id: rest.tenantId, branch_id: rest.branchId, fulfillment_type: 'PICKUP' },
        data: { payment_policy: 'OFFLINE_ONLY' },
      });

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('x-tenant-id', rest.tenantId)
        .set('idempotency-key', `idem-${Date.now()}`)
        .send({
          branch_id: rest.branchId,
          origin: 'WHATSAPP',
          fulfillment_type: 'PICKUP',
          customer: {
            name: 'Cliente OpenOps',
            phone: '3001234567',
            privacy_consent_accepted: true,
          },
          items: [{ product_id: productA.id, quantity: 1 }],
        })
        .expect(201);

      const orderId = createRes.body.order_id;
      await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/process`)
        .set('Authorization', `Bearer ${rest.token}`)
        .expect(201);

      // Pasar a PREPARING
      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({ to_status: 'PREPARING' })
        .expect(200);

      // 1. Intentar desactivar módulo kitchen -> 409 Conflict
      const disableKitchenRes = await request(app.getHttpServer())
        .patch('/api/v1/admin/modules')
        .set('Authorization', `Bearer ${rest.token}`)
        .send({
          modules: [{ module_key: 'kitchen', enabled: false }],
        })
        .expect(409);

      expect(disableKitchenRes.body.errorCode).toBe('MODULE_HAS_OPEN_OPERATIONS');

      // 2. Intentar desactivar payments.manual mientras está UNPAID -> 409 Conflict
      const disablePaymentsRes = await request(app.getHttpServer())
        .patch('/api/v1/admin/modules')
        .set('Authorization', `Bearer ${rest.token}`)
        .send({
          modules: [{ module_key: 'payments.manual', enabled: false }],
        })
        .expect(409);

      expect(disablePaymentsRes.body.errorCode).toBe('MODULE_HAS_OPEN_OPERATIONS');
    });
  });

  // ---------------------------------------------------------------------------
  // TC-04-I09: Inmutabilidad Histórica de NOT_TRACKED al Subir de Nivel 1 a Nivel 2
  // ---------------------------------------------------------------------------
  describe('TC-04-I09: Inmutabilidad Histórica de NOT_TRACKED al Subir de Nivel 1 a Nivel 2', () => {
    it('debe preservar NOT_TRACKED en pedidos creados en Nivel 1 tras activar FULL_PANEL', async () => {
      // Registrar en Nivel 1 (WHATSAPP_SIMPLE)
      const rest = await registerRestaurant('tc04-i09', 'WHATSAPP_SIMPLE');
      const { productA } = await seedCatalog(rest.tenantId, rest.branchId);

      // Crear pedido bajo política NONE
      await prisma.branchChannelPolicy.updateMany({
        where: { tenant_id: rest.tenantId, branch_id: rest.branchId, fulfillment_type: 'PICKUP' },
        data: { payment_policy: 'NONE' },
      });

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('x-tenant-id', rest.tenantId)
        .set('idempotency-key', `idem-${Date.now()}`)
        .send({
          branch_id: rest.branchId,
          origin: 'WHATSAPP',
          fulfillment_type: 'PICKUP',
          customer: {
            name: 'Cliente Nivel 1',
            phone: '3001234567',
            privacy_consent_accepted: true,
          },
          items: [{ product_id: productA.id, quantity: 1 }],
        })
        .expect(201);

      expect(createRes.body.payment_status).toBe('NOT_TRACKED');

      // Subir a Nivel 2 (activar OFFLINE_ONLY en canal)
      await prisma.branchChannelPolicy.updateMany({
        where: { tenant_id: rest.tenantId, branch_id: rest.branchId, fulfillment_type: 'PICKUP' },
        data: { payment_policy: 'OFFLINE_ONLY' },
      });

      // Consultar pedidos con filtro payment_status=UNPAID
      const listRes = await request(app.getHttpServer())
        .get(`/api/v1/branches/${rest.branchId}/orders?payment_status=UNPAID`)
        .set('Authorization', `Bearer ${rest.token}`)
        .expect(200);

      const containsOldOrder = listRes.body.data.some((o: any) => o.id === createRes.body.order_id);
      expect(containsOldOrder).toBe(false);

      // Verificar que la orden antigua sigue conservando NOT_TRACKED
      const oldOrder = await prisma.order.findUnique({
        where: { id: createRes.body.order_id },
      });
      expect(oldOrder!.payment_status).toBe('NOT_TRACKED');
    });
  });

  // ---------------------------------------------------------------------------
  // TC-04-I10: Aislamiento Multi-Tenant en KDS, Pagos y Resoluciones
  // ---------------------------------------------------------------------------
  describe('TC-04-I10: Aislamiento Multi-Tenant en KDS, Pagos y Resoluciones', () => {
    it('debe rechazar con 404/403 cualquier intento de cobrar o modificar órdenes de otro tenant', async () => {
      const restA = await registerRestaurant('tc04-i10-a');
      const restB = await registerRestaurant('tc04-i10-b');

      const { productA: prodA } = await seedCatalog(restA.tenantId, restA.branchId);

      await prisma.branchChannelPolicy.updateMany({
        where: { tenant_id: restA.tenantId, branch_id: restA.branchId, fulfillment_type: 'PICKUP' },
        data: { payment_policy: 'OFFLINE_ONLY' },
      });

      // Crear orden en Restaurante A
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('x-tenant-id', restA.tenantId)
        .set('idempotency-key', `idem-${Date.now()}`)
        .send({
          branch_id: restA.branchId,
          origin: 'WHATSAPP',
          fulfillment_type: 'PICKUP',
          customer: {
            name: 'Cliente Tenant A',
            phone: '3001234567',
            privacy_consent_accepted: true,
          },
          items: [{ product_id: prodA.id, quantity: 1 }],
        })
        .expect(201);

      const orderAId = createRes.body.order_id;
      await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderAId}/process`)
        .set('Authorization', `Bearer ${restA.token}`)
        .expect(201);

      // Usuario de Restaurante B intenta cobrar sobre orden de Restaurante A -> 404 o 403
      const foreignPay = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderAId}/payments/manual`)
        .set('Authorization', `Bearer ${restB.token}`)
        .send({ method: 'CASH', amount_cop: 35000 });

      expect([403, 404]).toContain(foreignPay.status);

      // Usuario de Restaurante B intenta resolver sobre orden de Restaurante A -> 404 o 403
      const foreignResolve = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderAId}/resolve-uncollected`)
        .set('Authorization', `Bearer ${restB.token}`)
        .send({ resolution_type: 'COURTESY', reason: 'Intrusión externa' });

      expect([403, 404]).toContain(foreignResolve.status);

      // Usuario de Restaurante B intenta consultar KDS de Restaurante A -> 403 Forbidden
      const foreignKds = await request(app.getHttpServer())
        .get(`/api/v1/kitchen/orders?branchId=${restA.branchId}`)
        .set('Authorization', `Bearer ${restB.token}`);

      expect([403, 404]).toContain(foreignKds.status);
    });
  });
});
