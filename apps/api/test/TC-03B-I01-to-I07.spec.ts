import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from './test-app';
import { PrismaService } from '../src/database/prisma.service';
import { SseStreamService } from '../src/modules/notifications/sse-stream.service';
import { firstValueFrom } from 'rxjs';

describe('Integración Fase 03B: TC-03B-I01 a TC-03B-I07', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sseService: SseStreamService;

  beforeAll(async () => {
    const testContext = await createTestApp();
    app = testContext.app;
    prisma = testContext.prisma;
    sseService = app.get(SseStreamService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerRestaurant(prefix: string, profile = 'WHATSAPP_SIMPLE') {
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

    return {
      token: res.body.accessToken as string,
      tenantId: res.body.tenant.id as string,
      branchId: res.body.branch.id as string,
      slug,
    };
  }

  async function seedCatalog(tenantId: string, branchId: string) {
    return prisma.withTenant(tenantId, async (tx) => {
      const menu = await tx.menu.create({
        data: {
          tenant_id: tenantId,
          branch_id: branchId,
          name: 'Menú Hamburguesería',
          status: 'ACTIVE',
        },
      });

      const category = await tx.category.create({
        data: {
          tenant_id: tenantId,
          menu_id: menu.id,
          name: 'Comidas Rápidas',
          sort_order: 1,
          is_active: true,
        },
      });

      const burgerProduct = await tx.product.create({
        data: {
          tenant_id: tenantId,
          category_id: category.id,
          name: 'Hamburguesa Artesanal',
          price_cop: 20000,
          status: 'ACTIVE',
          tax_type: 'NONE',
          tax_rate_bp: 0,
        },
      });

      const drinkProduct = await tx.product.create({
        data: {
          tenant_id: tenantId,
          category_id: category.id,
          name: 'Gaseosa Colombiana',
          price_cop: 5000,
          status: 'ACTIVE',
          tax_type: 'NONE',
          tax_rate_bp: 0,
        },
      });

      const zone = await tx.deliveryZone.create({
        data: {
          tenant_id: tenantId,
          branch_id: branchId,
          name: 'Zona Norte',
          polygon_or_neighborhoods_json: ['Chicó', 'Usaquén'],
          delivery_fee_cop: 0,
          min_order_cop: 20000,
          is_active: true,
        },
      });

      return { menu, category, burgerProduct, drinkProduct, zone };
    });
  }

  // -------------------------------------------------------------------------
  // TC-03B-I01: Ajuste Pre-Procesamiento con Recálculo y OrderEdit
  // -------------------------------------------------------------------------
  describe('TC-03B-I01: Ajuste Pre-Procesamiento con Recálculo en Servidor y Auditoría en OrderEdit', () => {
    it('debe recalcular en servidor a 69.000 COP y persistir snapshots en order_edits', async () => {
      const rest = await registerRestaurant('tc03b-i01');
      const catalog = await seedCatalog(rest.tenantId, rest.branchId);

      // Crear orden pública en REQUESTED con 2 hamburguesas de 20.000 COP
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('Idempotency-Key', `idem-tc03b-i01-${Date.now()}`)
        .set('X-Tenant-Id', rest.tenantId)
        .send({
          branch_id: rest.branchId,
          origin: 'WHATSAPP',
          fulfillment_type: 'DELIVERY',
          customer: {
            name: 'Carlos Ruiz',
            phone: '3001234567',
            privacy_consent_accepted: true,
          },
          delivery: {
            delivery_zone_id: catalog.zone.id,
            address_line: 'Calle 100 # 15-20',
            neighborhood: 'Chicó',
          },
          items: [
            {
              product_id: catalog.burgerProduct.id,
              quantity: 2,
            },
          ],
        })
        .expect(201);

      const orderId = orderRes.body.order_id;
      expect(orderRes.body.grand_total_cop).toBe(40000);

      // Operador ejecuta PATCH /api/v1/orders/:id/items:
      // Cambia a 3 hamburguesas (60.000), agrega 1 bebida (5.000) y fija domicilio en 4.000 -> Total: 69.000
      const adjustRes = await request(app.getHttpServer())
        .patch(`/api/v1/orders/${orderId}/items`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({
          items: [
            {
              product_id: catalog.burgerProduct.id,
              quantity: 3,
            },
            {
              product_id: catalog.drinkProduct.id,
              quantity: 1,
            },
          ],
          delivery_fee_cop: 4000,
          reason: 'Cliente pidió 1 hamburguesa extra y acordó domicilio por WhatsApp',
        })
        .expect(200);

      expect(adjustRes.body.subtotal_products_cop).toBe(65000);
      expect(adjustRes.body.delivery_fee_cop).toBe(4000);
      expect(adjustRes.body.grand_total_cop).toBe(69000);
      expect(adjustRes.body.edits_count).toBe(1);

      // Verificar que se haya insertado en order_edits
      const editRecord = await prisma.orderEdit.findFirst({
        where: { order_id: orderId, tenant_id: rest.tenantId },
      });
      expect(editRecord).toBeDefined();
      expect((editRecord?.before_snapshot_json as any).grand_total_cop).toBe(40000);
      expect((editRecord?.after_snapshot_json as any).grand_total_cop).toBe(69000);
      expect(editRecord?.reason).toBe('Cliente pidió 1 hamburguesa extra y acordó domicilio por WhatsApp');
    });
  });

  // -------------------------------------------------------------------------
  // TC-03B-I02: Procesamiento en 1 Toque y Bloqueo is_locked
  // -------------------------------------------------------------------------
  describe('TC-03B-I02: Procesamiento en 1 Toque, Bloqueo is_locked y Rechazo de Ediciones Posteriores', () => {
    it('debe cambiar a ACCEPTED, fijar is_locked y rechazar modificaciones con 409 Conflict', async () => {
      const rest = await registerRestaurant('tc03b-i02');
      const catalog = await seedCatalog(rest.tenantId, rest.branchId);

      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('Idempotency-Key', `idem-tc03b-i02-${Date.now()}`)
        .set('X-Tenant-Id', rest.tenantId)
        .send({
          branch_id: rest.branchId,
          origin: 'WHATSAPP',
          fulfillment_type: 'DELIVERY',
          customer: {
            name: 'Andrés Morales',
            phone: '3009876543',
            privacy_consent_accepted: true,
          },
          delivery: {
            delivery_zone_id: catalog.zone.id,
            address_line: 'Carrera 7 # 72-10',
            neighborhood: 'Usaquén',
          },
          items: [{ product_id: catalog.burgerProduct.id, quantity: 1 }],
        })
        .expect(201);

      const orderId = orderRes.body.order_id;

      // Procesar pedido
      const processRes = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/process`)
        .set('Authorization', `Bearer ${rest.token}`)
        .expect(201);

      expect(processRes.body.status).toBe('ACCEPTED');
      expect(processRes.body.is_locked).toBe(true);
      expect(processRes.body.processed_at).toBeDefined();
      expect(processRes.body.whatsapp_client_url).toContain('https://wa.me/573009876543');
      expect(processRes.body.copyable_message).toContain('ha sido confirmado');

      // Intentar editar ítems sobre orden procesada -> 409 Conflict
      const reAdjustRes = await request(app.getHttpServer())
        .patch(`/api/v1/orders/${orderId}/items`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({
          items: [{ product_id: catalog.burgerProduct.id, quantity: 2 }],
          delivery_fee_cop: 0,
        })
        .expect(409);

      expect(reAdjustRes.body.errorCode).toBe('ORDER_ALREADY_LOCKED');
    });
  });

  // -------------------------------------------------------------------------
  // TC-03B-I03: Inmutabilidad Histórica ante Cambios en el Catálogo
  // -------------------------------------------------------------------------
  describe('TC-03B-I03: Inmutabilidad Histórica ante Cambios Posteriores en el Catálogo', () => {
    it('debe mantener precio original de 20.000 COP tras subir precio del catálogo a 26.000 COP', async () => {
      const rest = await registerRestaurant('tc03b-i03');
      const catalog = await seedCatalog(rest.tenantId, rest.branchId);

      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('Idempotency-Key', `idem-tc03b-i03-${Date.now()}`)
        .set('X-Tenant-Id', rest.tenantId)
        .send({
          branch_id: rest.branchId,
          origin: 'WHATSAPP',
          fulfillment_type: 'DELIVERY',
          customer: {
            name: 'Laura Castro',
            phone: '3123456789',
            privacy_consent_accepted: true,
          },
          delivery: {
            delivery_zone_id: catalog.zone.id,
            address_line: 'Calle 116 # 19-30',
            neighborhood: 'Usaquén',
          },
          items: [{ product_id: catalog.burgerProduct.id, quantity: 1 }],
        })
        .expect(201);

      const publicToken = orderRes.body.public_token;

      // Subir el precio del plato a 26.000 en el catálogo
      await prisma.product.update({
        where: { id: catalog.burgerProduct.id },
        data: { price_cop: 26000 },
      });

      // Consultar la orden pública: debe mantenerse en 20.000 COP
      const trackRes = await request(app.getHttpServer())
        .get(`/api/v1/public/orders/${publicToken}`)
        .expect(200);

      expect(trackRes.body.items[0].unit_price_cop).toBe(20000);
      expect(trackRes.body.grand_total_cop).toBe(20000);
    });
  });

  // -------------------------------------------------------------------------
  // TC-03B-I04: Seguimiento Público con PII Enmascarado y Adaptación de Módulo
  // -------------------------------------------------------------------------
  describe('TC-03B-I04: Seguimiento Público con PII Enmascarado y Adaptación cuando tracking está Desactivado', () => {
    it('debe retornar PII enmascarado y adaptarse cuando tracking está activo vs inactivo', async () => {
      const rest = await registerRestaurant('tc03b-i04');
      const catalog = await seedCatalog(rest.tenantId, rest.branchId);

      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('Idempotency-Key', `idem-tc03b-i04-${Date.now()}`)
        .set('X-Tenant-Id', rest.tenantId)
        .send({
          branch_id: rest.branchId,
          origin: 'WHATSAPP',
          fulfillment_type: 'DELIVERY',
          customer: {
            name: 'Camila Pardo',
            phone: '3157778899',
            privacy_consent_accepted: true,
          },
          delivery: {
            delivery_zone_id: catalog.zone.id,
            address_line: 'Carrera 15 # 90-20 Apto 401',
            neighborhood: 'Chicó',
          },
          items: [{ product_id: catalog.burgerProduct.id, quantity: 1 }],
        })
        .expect(201);

      const publicToken = orderRes.body.public_token;

      // Con tracking activo (por defecto)
      const trackRes1 = await request(app.getHttpServer())
        .get(`/api/v1/public/orders/${publicToken}`)
        .expect(200);

      expect(trackRes1.body.customer_snapshot.name).toBe('Camila P.');
      expect(trackRes1.body.customer_snapshot.phone_masked).toBe('+57 *** *** 8899');
      expect(trackRes1.body.customer_snapshot.address_masked).toBe('Carrera 15 # ***, Chicó');
      expect(trackRes1.body.dian_fiscal_disclaimer).toContain('No sustituye la factura electrónica');
      expect(trackRes1.body.tracking_enabled).toBe(true);
      expect(trackRes1.body.timeline.length).toBeGreaterThanOrEqual(1);

      // Desactivar módulo tracking para el tenant
      await prisma.tenantModuleSetting.updateMany({
        where: {
          tenant_id: rest.tenantId,
          module_key: 'tracking',
        },
        data: {
          enabled: false,
        },
      });

      // Consultar de nuevo: debe responder con timeline vacío y tracking_enabled: false
      const trackRes2 = await request(app.getHttpServer())
        .get(`/api/v1/public/orders/${publicToken}`)
        .expect(200);

      expect(trackRes2.body.tracking_enabled).toBe(false);
      expect(trackRes2.body.timeline).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // TC-03B-I05: Expiración del Token a las 24 Horas
  // -------------------------------------------------------------------------
  describe('TC-03B-I05: Expiración del Token Público de Seguimiento tras 24 Horas de Estado Final', () => {
    it('debe responder HTTP 410 Gone si el public_token_expires_at ha vencido', async () => {
      const rest = await registerRestaurant('tc03b-i05');
      const catalog = await seedCatalog(rest.tenantId, rest.branchId);

      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('Idempotency-Key', `idem-tc03b-i05-${Date.now()}`)
        .set('X-Tenant-Id', rest.tenantId)
        .send({
          branch_id: rest.branchId,
          origin: 'WHATSAPP',
          fulfillment_type: 'DELIVERY',
          customer: {
            name: 'Felipe Gómez',
            phone: '3161112233',
            privacy_consent_accepted: true,
          },
          delivery: {
            delivery_zone_id: catalog.zone.id,
            address_line: 'Calle 72 # 10-00',
            neighborhood: 'Chicó',
          },
          items: [{ product_id: catalog.burgerProduct.id, quantity: 1 }],
        })
        .expect(201);

      const orderId = orderRes.body.order_id;
      const publicToken = orderRes.body.public_token;

      // Simular que la orden fue entregada y su token expiró en el pasado
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'DELIVERED',
          public_token_expires_at: new Date(Date.now() - 3600000), // Expiró hace 1 hora
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/public/orders/${publicToken}`)
        .expect(410);

      expect(res.body.errorCode).toBe('TRACKING_LINK_EXPIRED');
    });
  });

  // -------------------------------------------------------------------------
  // TC-03B-I06: Notificación en Tiempo Real SSE
  // -------------------------------------------------------------------------
  describe('TC-03B-I06: Notificación en Tiempo Real por Server-Sent Events', () => {
    it('debe emitir eventos al canal público de seguimiento y privado de sucursal', async () => {
      const rest = await registerRestaurant('tc03b-i06');
      const catalog = await seedCatalog(rest.tenantId, rest.branchId);

      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('Idempotency-Key', `idem-tc03b-i06-${Date.now()}`)
        .set('X-Tenant-Id', rest.tenantId)
        .send({
          branch_id: rest.branchId,
          origin: 'WHATSAPP',
          fulfillment_type: 'DELIVERY',
          customer: {
            name: 'Diana Hoyos',
            phone: '3109990011',
            privacy_consent_accepted: true,
          },
          delivery: {
            delivery_zone_id: catalog.zone.id,
            address_line: 'Carrera 9 # 100-02',
            neighborhood: 'Usaquén',
          },
          items: [{ product_id: catalog.burgerProduct.id, quantity: 1 }],
        })
        .expect(201);

      const orderId = orderRes.body.order_id;
      const publicToken = orderRes.body.public_token;

      // Suscribirse al stream público
      const trackingStream$ = sseService.subscribeToTracking(publicToken);

      let receivedEvent: any = null;
      const sub = trackingStream$.subscribe((event) => {
        if (event.type === 'tracking.updated') {
          receivedEvent = event;
        }
      });

      // Procesar la orden
      await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/process`)
        .set('Authorization', `Bearer ${rest.token}`)
        .expect(201);

      // Esperar brevemente la emisión
      await new Promise((r) => setTimeout(r, 100));

      expect(receivedEvent).toBeDefined();
      expect(receivedEvent.type).toBe('tracking.updated');
      expect(receivedEvent.data.status).toBe('ACCEPTED');

      sub.unsubscribe();
    });
  });

  // -------------------------------------------------------------------------
  // TC-03B-I07: Aislamiento Multi-Tenant
  // -------------------------------------------------------------------------
  describe('TC-03B-I07: Aislamiento Multi-Tenant en Ajustes, Procesamiento y Canales SSE', () => {
    it('debe impedir que un usuario del Restaurante B modifique pedidos del Restaurante A', async () => {
      const restA = await registerRestaurant('tc03b-rest-a');
      const restB = await registerRestaurant('tc03b-rest-b');

      const catalogA = await seedCatalog(restA.tenantId, restA.branchId);

      // Crear orden en Restaurante A
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('Idempotency-Key', `idem-tc03b-i07-${Date.now()}`)
        .set('X-Tenant-Id', restA.tenantId)
        .send({
          branch_id: restA.branchId,
          origin: 'WHATSAPP',
          fulfillment_type: 'DELIVERY',
          customer: {
            name: 'Cliente Org A',
            phone: '3001114455',
            privacy_consent_accepted: true,
          },
          delivery: {
            delivery_zone_id: catalogA.zone.id,
            address_line: 'Calle 100 # 20-30',
            neighborhood: 'Chicó',
          },
          items: [{ product_id: catalogA.burgerProduct.id, quantity: 1 }],
        })
        .expect(201);

      const orderIdA = orderRes.body.order_id;

      // Usuario B intenta ajustar la orden de A -> 404 Not Found (aislamiento RLS)
      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${orderIdA}/items`)
        .set('Authorization', `Bearer ${restB.token}`)
        .send({
          items: [{ product_id: catalogA.burgerProduct.id, quantity: 2 }],
          delivery_fee_cop: 0,
        })
        .expect(404);

      // Usuario B intenta procesar la orden de A -> 404 Not Found
      await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderIdA}/process`)
        .set('Authorization', `Bearer ${restB.token}`)
        .expect(404);

      // Usuario B intenta listar órdenes de la sucursal de A -> 404 Not Found
      await request(app.getHttpServer())
        .get(`/api/v1/branches/${restA.branchId}/orders`)
        .set('Authorization', `Bearer ${restB.token}`)
        .expect(404);
    });
  });
});
