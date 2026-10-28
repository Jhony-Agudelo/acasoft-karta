import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from './test-app';
import { PrismaService } from '../src/database/prisma.service';
import { OrderExpirationScheduler } from '../src/modules/ordering/order-expiration.scheduler';

describe('Integración Fase 03A: TC-03A-I01 a TC-03A-I08', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let expirationScheduler: OrderExpirationScheduler;

  beforeAll(async () => {
    const testContext = await createTestApp();
    app = testContext.app;
    prisma = testContext.prisma;
    expirationScheduler = app.get(OrderExpirationScheduler);
  });

  afterAll(async () => {
    await app.close();
  });

  // Helper para registrar un restaurante de prueba
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

  // Helper para crear un menú y producto base
  async function seedCatalog(tenantId: string, branchId: string, priceCop = 25000) {
    return prisma.withTenant(tenantId, async (tx) => {
      const menu = await tx.menu.create({
        data: {
          tenant_id: tenantId,
          branch_id: branchId,
          name: 'Menú Principal',
          status: 'ACTIVE',
        },
      });

      const category = await tx.category.create({
        data: {
          tenant_id: tenantId,
          menu_id: menu.id,
          name: 'Hamburguesas',
          sort_order: 1,
          is_active: true,
        },
      });

      const product = await tx.product.create({
        data: {
          tenant_id: tenantId,
          category_id: category.id,
          name: 'Hamburguesa Clásica',
          price_cop: priceCop,
          status: 'ACTIVE',
          tax_type: 'NONE',
          tax_rate_bp: 0,
        },
      });

      const zone = await tx.deliveryZone.create({
        data: {
          tenant_id: tenantId,
          branch_id: branchId,
          name: 'Zona Centro',
          polygon_or_neighborhoods_json: ['Centro', 'Candelaria'],
          delivery_fee_cop: 4000,
          min_order_cop: 20000,
          is_active: true,
        },
      });

      return { menu, category, product, zone };
    });
  }

  // -------------------------------------------------------------------------
  // TC-03A-I01: Creación Nivel 1 WHATSAPP, Precios de Servidor y Numeración #A101
  // -------------------------------------------------------------------------
  describe('TC-03A-I01: Creación de Pedido Público y Numeración Secuencial #A101', () => {
    it('debe calcular precios en servidor, asignar #A101 e inicializar estado REQUESTED y NOT_TRACKED', async () => {
      const rest = await registerRestaurant('tc03a-i01');
      const { product, zone } = await seedCatalog(rest.tenantId, rest.branchId, 25000);

      const idemKey = `idem-${Date.now()}-001`;

      const res = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('Idempotency-Key', idemKey)
        .set('x-tenant-id', rest.tenantId)
        .send({
          branch_id: rest.branchId,
          origin: 'WHATSAPP',
          fulfillment_type: 'DELIVERY',
          customer: {
            name: 'Carlos Ramírez',
            phone: '300 123 4567',
            privacy_consent_accepted: true,
          },
          delivery: {
            delivery_zone_id: zone.id,
            address_line: 'Calle 19 # 8-45 Apto 302',
            neighborhood: 'Centro',
            reference_notes: 'Edificio esquinero',
          },
          notes: 'Sin cebolla',
          items: [
            {
              product_id: product.id,
              quantity: 2,
            },
          ],
        })
        .expect(201);

      expect(res.body.order_code).toBe('#A101');
      expect(res.body.origin).toBe('WHATSAPP');
      expect(res.body.fulfillment_type).toBe('DELIVERY');
      expect(res.body.status).toBe('REQUESTED');
      expect(res.body.payment_policy).toBe('NONE');
      expect(res.body.payment_status).toBe('NOT_TRACKED');
      expect(res.body.subtotal_products_cop).toBe(50000); // 2 x 25000
      expect(res.body.delivery_fee_cop).toBe(4000);
      expect(res.body.grand_total_cop).toBe(54000);
      expect(res.body.whatsapp_redirect_url).toContain('https://wa.me/');
      expect(res.body.whatsapp_redirect_url).toContain('%23A101');

      // Segundo pedido del mismo día debe recibir #A102
      const res2 = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('Idempotency-Key', `idem-${Date.now()}-002`)
        .set('x-tenant-id', rest.tenantId)
        .send({
          branch_id: rest.branchId,
          origin: 'WHATSAPP',
          fulfillment_type: 'PICKUP',
          customer: {
            name: 'Ana María',
            phone: '310 987 6543',
            privacy_consent_accepted: true,
          },
          items: [
            {
              product_id: product.id,
              quantity: 1,
            },
          ],
        })
        .expect(201);

      expect(res2.body.order_code).toBe('#A102');
      expect(res2.body.subtotal_products_cop).toBe(25000);
      expect(res2.body.grand_total_cop).toBe(25000);
    });
  });

  // -------------------------------------------------------------------------
  // TC-03A-I02: Concurrencia en Numeración Diaria #A10X
  // -------------------------------------------------------------------------
  describe('TC-03A-I02: Concurrencia en Numeración Diaria', () => {
    it('debe generar exactamente 10 códigos únicos consecutivos (#A101 a #A110) bajo peticiones simultáneas', async () => {
      const rest = await registerRestaurant('tc03a-i02');
      const { product } = await seedCatalog(rest.tenantId, rest.branchId, 15000);

      // Disparar 10 peticiones simultáneas
      const promises = Array.from({ length: 10 }).map((_, idx) => {
        return request(app.getHttpServer())
          .post('/api/v1/public/orders')
          .set('Idempotency-Key', `concurrent-key-${Date.now()}-${idx}`)
          .set('x-tenant-id', rest.tenantId)
          .send({
            branch_id: rest.branchId,
            origin: 'WHATSAPP',
            fulfillment_type: 'PICKUP',
            customer: {
              name: `Cliente ${idx}`,
              phone: `300123450${idx}`,
              privacy_consent_accepted: true,
            },
            items: [{ product_id: product.id, quantity: 1 }],
          });
      });

      const responses = await Promise.all(promises);
      const codes = responses.map((r) => r.body.order_code);

      // Todos deben ser 201 Created
      responses.forEach((r) => expect(r.status).toBe(201));

      // 10 códigos únicos
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(10);

      // Deben ir de #A101 a #A110
      const sortedCodes = Array.from(uniqueCodes).sort();
      expect(sortedCodes).toEqual([
        '#A101', '#A102', '#A103', '#A104', '#A105',
        '#A106', '#A107', '#A108', '#A109', '#A110',
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // TC-03A-I03: Idempotencia Aislada por Tenant
  // -------------------------------------------------------------------------
  describe('TC-03A-I03: Idempotencia Aislada por Tenant', () => {
    it('debe devolver la orden existente si se repite la clave en el mismo tenant, y permitir la misma clave en otro tenant', async () => {
      const restA = await registerRestaurant('tc03a-i03-a');
      const restB = await registerRestaurant('tc03a-i03-b');

      const catA = await seedCatalog(restA.tenantId, restA.branchId, 20000);
      const catB = await seedCatalog(restB.tenantId, restB.branchId, 30000);

      const sharedKey = 'shared-idempotency-key-xyz-1234';

      // 1. Envío al Restaurante A
      const resA1 = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('Idempotency-Key', sharedKey)
        .set('x-tenant-id', restA.tenantId)
        .send({
          branch_id: restA.branchId,
          origin: 'WHATSAPP',
          fulfillment_type: 'PICKUP',
          customer: { name: 'Cliente A', phone: '3001234567', privacy_consent_accepted: true },
          items: [{ product_id: catA.product.id, quantity: 1 }],
        })
        .expect(201);

      // 2. Re-envío con la misma clave al Restaurante A
      const resA2 = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('Idempotency-Key', sharedKey)
        .set('x-tenant-id', restA.tenantId)
        .send({
          branch_id: restA.branchId,
          origin: 'WHATSAPP',
          fulfillment_type: 'PICKUP',
          customer: { name: 'Cliente A', phone: '3001234567', privacy_consent_accepted: true },
          items: [{ product_id: catA.product.id, quantity: 1 }],
        });

      expect([200, 201]).toContain(resA2.status);
      expect(resA2.body.order_id).toBe(resA1.body.order_id);
      expect(resA2.body.order_code).toBe(resA1.body.order_code);
      expect(resA2.body.public_token).toBe(resA1.body.public_token);

      // 3. Envío al Restaurante B con la misma clave: debe crearse sin conflicto
      const resB = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('Idempotency-Key', sharedKey)
        .set('x-tenant-id', restB.tenantId)
        .send({
          branch_id: restB.branchId,
          origin: 'WHATSAPP',
          fulfillment_type: 'PICKUP',
          customer: { name: 'Cliente B', phone: '3009876543', privacy_consent_accepted: true },
          items: [{ product_id: catB.product.id, quantity: 1 }],
        })
        .expect(201);

      expect(resB.body.order_id).not.toBe(resA1.body.order_id);
    });
  });

  // -------------------------------------------------------------------------
  // TC-03A-I04: Cobertura, Pedido Mínimo y Modificador Agotado
  // -------------------------------------------------------------------------
  describe('TC-03A-I04: Cobertura, Pedido Mínimo y Modificador Agotado', () => {
    it('debe rechazar pedido con 400 MIN_ORDER_AMOUNT_NOT_MET si el subtotal no alcanza el mínimo de la zona', async () => {
      const rest = await registerRestaurant('tc03a-i04-min');
      const { product, zone } = await seedCatalog(rest.tenantId, rest.branchId, 15000);

      // La zona exige min_order_cop = 20000 y el producto cuesta 15000
      const res = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('Idempotency-Key', `idem-min-order-${Date.now()}`)
        .set('x-tenant-id', rest.tenantId)
        .send({
          branch_id: rest.branchId,
          origin: 'WHATSAPP',
          fulfillment_type: 'DELIVERY',
          customer: { name: 'Comensal', phone: '3001234567', privacy_consent_accepted: true },
          delivery: {
            delivery_zone_id: zone.id,
            address_line: 'Calle 10 # 5-20',
            neighborhood: 'Centro',
          },
          items: [{ product_id: product.id, quantity: 1 }],
        })
        .expect(400);

      expect(res.body.errorCode).toBe('MIN_ORDER_AMOUNT_NOT_MET');
    });

    it('debe rechazar pedido con 400 PRODUCT_OR_MODIFIER_UNAVAILABLE si un modificador está OUT_OF_STOCK', async () => {
      const rest = await registerRestaurant('tc03a-i04-mod');
      const { product } = await seedCatalog(rest.tenantId, rest.branchId, 25000);

      // Crear grupo y modificador agotado
      const { group, option } = await prisma.withTenant(rest.tenantId, async (tx) => {
        const grp = await tx.modifierGroup.create({
          data: {
            tenant_id: rest.tenantId,
            name: 'Toppings',
            is_required: false,
          },
        });
        const opt = await tx.modifierOption.create({
          data: {
            tenant_id: rest.tenantId,
            group_id: grp.id,
            name: 'Queso Azul',
            extra_price_cop: 5000,
            status: 'OUT_OF_STOCK', // AGOTADO
          },
        });
        await tx.productModifierGroup.create({
          data: {
            product_id: product.id,
            group_id: grp.id,
          },
        });
        return { group: grp, option: opt };
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('Idempotency-Key', `idem-mod-stock-${Date.now()}`)
        .set('x-tenant-id', rest.tenantId)
        .send({
          branch_id: rest.branchId,
          origin: 'WHATSAPP',
          fulfillment_type: 'PICKUP',
          customer: { name: 'Comensal', phone: '3001234567', privacy_consent_accepted: true },
          items: [
            {
              product_id: product.id,
              quantity: 1,
              modifiers: [{ group_id: group.id, option_id: option.id }],
            },
          ],
        })
        .expect(400);

      expect(res.body.errorCode).toBe('PRODUCT_OR_MODIFIER_UNAVAILABLE');
    });
  });

  // -------------------------------------------------------------------------
  // TC-03A-I05: Antifraude: Límite de 3 Solicitudes Abiertas por Teléfono
  // -------------------------------------------------------------------------
  describe('TC-03A-I05: Control Antifraude de Solicitudes Abiertas', () => {
    it('debe rechazar con 429 MAX_OPEN_ORDERS_PER_PHONE_EXCEEDED al intentar crear el 4.º pedido abierto', async () => {
      const rest = await registerRestaurant('tc03a-i05');
      const { product } = await seedCatalog(rest.tenantId, rest.branchId, 20000);

      const targetPhone = '300 111 2233';

      // Crear 3 pedidos válidos
      for (let i = 1; i <= 3; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/public/orders')
          .set('Idempotency-Key', `open-order-rate-${Date.now()}-${i}`)
          .set('x-tenant-id', rest.tenantId)
          .send({
            branch_id: rest.branchId,
            origin: 'WHATSAPP',
            fulfillment_type: 'PICKUP',
            customer: { name: 'Usuario Frecuente', phone: targetPhone, privacy_consent_accepted: true },
            items: [{ product_id: product.id, quantity: 1 }],
          })
          .expect(201);
      }

      // El 4.º pedido debe ser rechazado con 429
      const res4 = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('Idempotency-Key', `open-order-rate-${Date.now()}-4`)
        .set('x-tenant-id', rest.tenantId)
        .send({
          branch_id: rest.branchId,
          origin: 'WHATSAPP',
          fulfillment_type: 'PICKUP',
          customer: { name: 'Usuario Frecuente', phone: targetPhone, privacy_consent_accepted: true },
          items: [{ product_id: product.id, quantity: 1 }],
        })
        .expect(429);

      expect(res4.body.errorCode).toBe('MAX_OPEN_ORDERS_PER_PHONE_EXCEEDED');
    });
  });

  // -------------------------------------------------------------------------
  // TC-03A-I06: Anonimización Ley 1581 y Persistencia Antifraude con HMAC
  // -------------------------------------------------------------------------
  describe('TC-03A-I06: Anonimización Irreversible Ley 1581 y HMAC Antifraude', () => {
    it('Subcaso 1: debe anonimizar con UUID puro, borrar direcciones y redactar snapshot sin alterar totales contables', async () => {
      const rest = await registerRestaurant('tc03a-i06-s1');
      const { product, zone } = await seedCatalog(rest.tenantId, rest.branchId, 50000);

      // Crear pedido y marcarlo como entregado
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('Idempotency-Key', `idem-anon-${Date.now()}`)
        .set('x-tenant-id', rest.tenantId)
        .send({
          branch_id: rest.branchId,
          origin: 'WHATSAPP',
          fulfillment_type: 'DELIVERY',
          customer: { name: 'Carlos Ramírez', phone: '3009998877', privacy_consent_accepted: true },
          delivery: {
            delivery_zone_id: zone.id,
            address_line: 'Calle 100 # 15-20 Apto 401',
            neighborhood: 'Chicó',
          },
          items: [{ product_id: product.id, quantity: 1 }],
        })
        .expect(201);

      // Finalizar la orden a DELIVERED directamente
      await prisma.order.update({
        where: { id: orderRes.body.order_id },
        data: { status: 'DELIVERED' },
      });

      const customer = await prisma.customer.findFirst({
        where: { tenant_id: rest.tenantId, phone_e164: '+573009998877' },
      });
      expect(customer).toBeDefined();

      // Solicitar anonimización
      const anonRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/customers/${customer!.id}/anonymize`)
        .set('Authorization', `Bearer ${rest.token}`)
        .expect(201);

      expect(anonRes.body.success).toBe(true);

      // Verificar en BD
      const updatedCustomer = await prisma.customer.findUnique({
        where: { id: customer!.id },
      });
      expect(updatedCustomer?.name).toBe('Cliente Anonimizado');
      expect(updatedCustomer?.phone_e164).toMatch(/^ANON_[0-9a-f-]{36}$/);
      expect(updatedCustomer?.anonymized_at).toBeDefined();

      // Direcciones deben haber sido borradas
      const addressesCount = await prisma.deliveryAddress.count({
        where: { customer_id: customer!.id },
      });
      expect(addressesCount).toBe(0);

      // Orden debe tener customer_snapshot_json redactado pero grand_total_cop intacto
      const updatedOrder = await prisma.order.findUnique({
        where: { id: orderRes.body.order_id },
      });
      const snap = updatedOrder?.customer_snapshot_json as any;
      expect(snap.name).toBe('Anonimizado');
      expect(snap.phone_e164).toBe('REDACTED');
      expect(snap.address_line).toBe('REDACTED');
      expect(updatedOrder?.grand_total_cop).toBe(54000); // 50000 + 4000 domicilio intacto
    });

    it('Subcaso 2: debe rechazar con 409 Conflict si el cliente tiene pedidos activos en curso', async () => {
      const rest = await registerRestaurant('tc03a-i06-s2');
      const { product } = await seedCatalog(rest.tenantId, rest.branchId, 25000);

      await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('Idempotency-Key', `idem-active-order-${Date.now()}`)
        .set('x-tenant-id', rest.tenantId)
        .send({
          branch_id: rest.branchId,
          origin: 'WHATSAPP',
          fulfillment_type: 'PICKUP',
          customer: { name: 'Cliente Activo', phone: '3123456789', privacy_consent_accepted: true },
          items: [{ product_id: product.id, quantity: 1 }],
        })
        .expect(201);

      const customer = await prisma.customer.findFirst({
        where: { tenant_id: rest.tenantId, phone_e164: '+573123456789' },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/customers/${customer!.id}/anonymize`)
        .set('Authorization', `Bearer ${rest.token}`)
        .expect(409);

      expect(res.body.errorCode).toBe('CUSTOMER_HAS_ACTIVE_ORDERS');
    });

    it('Subcaso 3: cliente bloqueado que pide anonimización mantiene su HMAC y es rechazado en nuevos pedidos (403)', async () => {
      const rest = await registerRestaurant('tc03a-i06-s3');
      const { product } = await seedCatalog(rest.tenantId, rest.branchId, 25000);
      const targetPhone = '3112223344';

      // Crear pedido y marcarlo DELIVERED
      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('Idempotency-Key', `idem-fraud-case-${Date.now()}`)
        .set('x-tenant-id', rest.tenantId)
        .send({
          branch_id: rest.branchId,
          origin: 'WHATSAPP',
          fulfillment_type: 'PICKUP',
          customer: { name: 'Usuario Fraudulento', phone: targetPhone, privacy_consent_accepted: true },
          items: [{ product_id: product.id, quantity: 1 }],
        })
        .expect(201);

      await prisma.order.update({
        where: { id: orderRes.body.order_id },
        data: { status: 'DELIVERED' },
      });

      const customer = await prisma.customer.findFirst({
        where: { tenant_id: rest.tenantId, phone_e164: '+573112223344' },
      });

      // 1. Gerente bloquea al cliente
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/customers/${customer!.id}/block`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({ is_blocked: true, reason: 'Fraude reiterado' })
        .expect(200);

      // 2. Cliente ejerce derecho de supresión y es anonimizado
      await request(app.getHttpServer())
        .post(`/api/v1/admin/customers/${customer!.id}/anonymize`)
        .set('Authorization', `Bearer ${rest.token}`)
        .expect(201);

      const checkCustomer = await prisma.customer.findUnique({
        where: { id: customer!.id },
      });
      expect(checkCustomer?.phone_e164).toMatch(/^ANON_/);
      expect(checkCustomer?.blocked_phone_hmac).toBeDefined();

      // 3. El mismo número de teléfono intenta hacer un nuevo pedido público: rechazo 403 CUSTOMER_PHONE_BLOCKED
      const newOrderRes = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('Idempotency-Key', `idem-blocked-new-try-${Date.now()}`)
        .set('x-tenant-id', rest.tenantId)
        .send({
          branch_id: rest.branchId,
          origin: 'WHATSAPP',
          fulfillment_type: 'PICKUP',
          customer: { name: 'Intento Nuevo', phone: targetPhone, privacy_consent_accepted: true },
          items: [{ product_id: product.id, quantity: 1 }],
        })
        .expect(403);

      expect(newOrderRes.body.errorCode).toBe('CUSTOMER_PHONE_BLOCKED');
    });
  });

  // -------------------------------------------------------------------------
  // TC-03A-I07: Caducidad Automática a EXPIRED_UNPROCESSED
  // -------------------------------------------------------------------------
  describe('TC-03A-I07: Caducidad Automática de Pedidos Stale', () => {
    it('debe transicionar automáticamente órdenes REQUESTED antiguas a EXPIRED_UNPROCESSED', async () => {
      const rest = await registerRestaurant('tc03a-i07');
      const { product } = await seedCatalog(rest.tenantId, rest.branchId, 20000);

      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('Idempotency-Key', `idem-expire-${Date.now()}`)
        .set('x-tenant-id', rest.tenantId)
        .send({
          branch_id: rest.branchId,
          origin: 'WHATSAPP',
          fulfillment_type: 'PICKUP',
          customer: { name: 'Comensal Expirable', phone: '3005556677', privacy_consent_accepted: true },
          items: [{ product_id: product.id, quantity: 1 }],
        })
        .expect(201);

      // Simular que el pedido fue creado hace 2 horas
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      await prisma.order.update({
        where: { id: orderRes.body.order_id },
        data: { created_at: twoHoursAgo },
      });

      // Ejecutar el scheduler con ventana de 30 minutos
      const expiredCount = await expirationScheduler.handleExpiredRequests(30);
      expect(expiredCount).toBeGreaterThanOrEqual(1);

      // Comprobar estado final en base de datos
      const expiredOrder = await prisma.order.findUnique({
        where: { id: orderRes.body.order_id },
        include: { status_events: true },
      });

      expect(expiredOrder?.status).toBe('EXPIRED_UNPROCESSED');
      expect(
        expiredOrder?.status_events.some((e) => e.to_status === 'EXPIRED_UNPROCESSED'),
      ).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // TC-03A-I08: Restricciones CHECK en PostgreSQL y Aislamiento Multi-Tenant
  // -------------------------------------------------------------------------
  describe('TC-03A-I08: Restricciones CHECK en PostgreSQL y Aislamiento Multi-Tenant', () => {
    it('debe violar la restricción CHECK chk_orders_payment_status_policy si payment_policy=NONE y payment_status!=NOT_TRACKED', async () => {
      const rest = await registerRestaurant('tc03a-i08-chk1');

      await expect(
        prisma.order.create({
          data: {
            tenant_id: rest.tenantId,
            branch_id: rest.branchId,
            order_code: '#A999',
            origin: 'WHATSAPP',
            fulfillment_type: 'PICKUP',
            status: 'REQUESTED',
            payment_policy: 'NONE',
            payment_status: 'UNPAID', // Violación CHECK
            customer_snapshot_json: {},
            public_token: `token-${Date.now()}`,
            subtotal_products_cop: 10000,
            grand_total_cop: 10000,
            tax_summary_snapshot_json: {},
          },
        }),
      ).rejects.toThrow();
    });

    it('debe violar la restricción CHECK chk_orders_no_payment_in_requested si status=REQUESTED y paid_total_cop > 0', async () => {
      const rest = await registerRestaurant('tc03a-i08-chk2');

      await expect(
        prisma.order.create({
          data: {
            tenant_id: rest.tenantId,
            branch_id: rest.branchId,
            order_code: '#A998',
            origin: 'WHATSAPP',
            fulfillment_type: 'PICKUP',
            status: 'REQUESTED',
            payment_policy: 'NONE',
            payment_status: 'NOT_TRACKED',
            paid_total_cop: 5000, // Violación CHECK
            customer_snapshot_json: {},
            public_token: `token-${Date.now()}`,
            subtotal_products_cop: 10000,
            grand_total_cop: 10000,
            tax_summary_snapshot_json: {},
          },
        }),
      ).rejects.toThrow();
    });

    it('no debe permitir a un gerente del Restaurante A listar ni anonimizar clientes del Restaurante B', async () => {
      const restA = await registerRestaurant('tc03a-i08-iso-a');
      const restB = await registerRestaurant('tc03a-i08-iso-b');
      const { product } = await seedCatalog(restB.tenantId, restB.branchId, 20000);

      // Crear cliente en Restaurante B
      const orderB = await request(app.getHttpServer())
        .post('/api/v1/public/orders')
        .set('Idempotency-Key', `idem-cust-b-${Date.now()}`)
        .set('x-tenant-id', restB.tenantId)
        .send({
          branch_id: restB.branchId,
          origin: 'WHATSAPP',
          fulfillment_type: 'PICKUP',
          customer: { name: 'Cliente B', phone: '3101112233', privacy_consent_accepted: true },
          items: [{ product_id: product.id, quantity: 1 }],
        })
        .expect(201);

      const customerB = await prisma.customer.findFirst({
        where: { tenant_id: restB.tenantId, phone_e164: '+573101112233' },
      });

      // Gerente de Restaurante A intenta anonimizar cliente del Restaurante B
      await request(app.getHttpServer())
        .post(`/api/v1/admin/customers/${customerB!.id}/anonymize`)
        .set('Authorization', `Bearer ${restA.token}`) // Token del Restaurante A
        .expect(404);
    });
  });
});
