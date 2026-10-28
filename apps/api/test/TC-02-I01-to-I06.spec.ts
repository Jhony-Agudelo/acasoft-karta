import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from './test-app';
import { PrismaService } from '../src/database/prisma.service';

describe('Integración Fase 02: TC-02-I01 a TC-02-I06', () => {
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

  describe('TC-02-I01: Carga Rápida e Importación Masiva de Menú', () => {
    it('debe importar 12 productos en 3 categorías nuevas en una sola transacción y servirlos en menú público', async () => {
      const rest = await registerRestaurant('tc02-i01');

      const bulkRows = [
        // Categoría 1: Entradas (4 productos)
        { category_name: 'Entradas', product_name: 'Empanadas de Carne (3 und)', price_cop: 12000 },
        { category_name: 'Entradas', product_name: 'Papas Criollas', price_cop: 9000 },
        { category_name: 'Entradas', product_name: 'Dedos de Queso', price_cop: 11000 },
        { category_name: 'Entradas', product_name: 'Chinchulines Crocantes', price_cop: 14000 },
        // Categoría 2: Fuertes (4 productos)
        { category_name: 'Platos Fuertes', product_name: 'Bandeja Paisa Tradicional', price_cop: 32000 },
        { category_name: 'Platos Fuertes', product_name: 'Ajiaco Santafereño', price_cop: 28000 },
        { category_name: 'Platos Fuertes', product_name: 'Churrasco 300g', price_cop: 38000 },
        { category_name: 'Platos Fuertes', product_name: 'Costillas BBQ', price_cop: 35000 },
        // Categoría 3: Bebidas (4 productos)
        { category_name: 'Bebidas', product_name: 'Limonada de Coco', price_cop: 8500 },
        { category_name: 'Bebidas', product_name: 'Jugo Natural de Frutos Rojos', price_cop: 7500 },
        { category_name: 'Bebidas', product_name: 'Cerveza Club Colombia', price_cop: 7000 },
        { category_name: 'Bebidas', product_name: 'Gaseosa Postobón 400ml', price_cop: 5000 },
      ];

      const importRes = await request(app.getHttpServer())
        .post('/api/v1/admin/products/import')
        .set('Authorization', `Bearer ${rest.token}`)
        .send({ items: bulkRows })
        .expect(201);

      expect(importRes.body.created_categories_count).toBe(3);
      expect(importRes.body.created_products_count).toBe(12);

      // Verificar que se registró el AuditEvent
      const audit = await prisma.auditEvent.findFirst({
        where: {
          tenant_id: rest.tenantId,
          action: 'CATALOG_BULK_IMPORTED',
        },
      });
      expect(audit).toBeDefined();

      // Consultar el menú público sin autenticación
      const publicMenuRes = await request(app.getHttpServer())
        .get(`/api/v1/public/${rest.slug}/menu`)
        .expect(200);

      expect(publicMenuRes.body.categories.length).toBe(3);
      const totalProducts = publicMenuRes.body.categories.reduce(
        (sum: number, c: any) => sum + c.products.length,
        0,
      );
      expect(totalProducts).toBe(12);
      expect(publicMenuRes.body.fiscal_disclaimer).toBeDefined();
    });
  });

  describe('TC-02-I02: Generación, Resolución y Revocación en Tabla Unificada QrCodeLink', () => {
    it('debe generar un QR opaco de sucursal, resolverlo en vitrina y responder 410 Gone al revocarlo', async () => {
      const rest = await registerRestaurant('tc02-i02');

      // 1. Generar código QR para la sucursal
      const createQrRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/branches/${rest.branchId}/qr-codes`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({
          target_type: 'BRANCH_MENU',
          label: 'QR Entrada Principal',
        })
        .expect(201);

      const qr = createQrRes.body;
      expect(qr.qr_token).toBeDefined();
      expect(qr.qr_token.length).toBeGreaterThan(32);
      // Debe ser un token opaco en base64url, no un UUID
      expect(qr.qr_token).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i);

      // 2. Resolver el QR de forma pública (sin credenciales)
      const resolveRes = await request(app.getHttpServer())
        .get(`/api/v1/public/qr/${qr.qr_token}`)
        .expect(200);

      expect(resolveRes.body.restaurant_slug).toBe(rest.slug);
      expect(resolveRes.body.branch_id).toBe(rest.branchId);
      expect(resolveRes.body.target_type).toBe('BRANCH_MENU');

      // 3. Revocar el QR desde administración
      const revokeRes = await request(app.getHttpServer())
        .post(`/api/v1/admin/qr-codes/${qr.id}/revoke`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({ generate_replacement: false })
        .expect(200);

      expect(revokeRes.body.is_active).toBe(false);
      expect(revokeRes.body.revoked_at).toBeDefined();

      // 4. Intentar resolver el QR revocado debe responder 410 Gone (QR_CODE_REVOKED)
      const goneRes = await request(app.getHttpServer())
        .get(`/api/v1/public/qr/${qr.qr_token}`)
        .expect(410);

      expect(goneRes.body.errorCode).toBe('QR_CODE_REVOKED');
    });
  });

  describe('TC-02-I03: Disponibilidad en 1 Toque, Filtro de ARCHIVED y Horarios', () => {
    it('debe cambiar disponibilidad a OUT_OF_STOCK y ocultar productos ARCHIVED del menú público', async () => {
      const rest = await registerRestaurant('tc02-i03');

      // Crear una categoría
      const catRes = await request(app.getHttpServer())
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${rest.token}`)
        .send({
          name: 'Pizzas Artesanales',
          sort_order: 1,
        })
        .expect(201);
      const categoryId = catRes.body.id;

      // Crear producto 1
      const p1Res = await request(app.getHttpServer())
        .post('/api/v1/admin/products')
        .set('Authorization', `Bearer ${rest.token}`)
        .send({
          category_id: categoryId,
          name: 'Pizza Pepperoni',
          price_cop: 25000,
        })
        .expect(201);
      const p1Id = p1Res.body.id;

      // Crear producto 2
      const p2Res = await request(app.getHttpServer())
        .post('/api/v1/admin/products')
        .set('Authorization', `Bearer ${rest.token}`)
        .send({
          category_id: categoryId,
          name: 'Pizza Cuatro Quesos',
          price_cop: 28000,
        })
        .expect(201);
      const p2Id = p2Res.body.id;

      // 1. Cambiar producto 1 a OUT_OF_STOCK en un toque
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/products/${p1Id}/availability`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({ status: 'OUT_OF_STOCK' })
        .expect(200);

      // 2. Archivar producto 2
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/products/${p2Id}`)
        .set('Authorization', `Bearer ${rest.token}`)
        .send({ status: 'ARCHIVED' })
        .expect(200);

      // 3. Consultar menú público
      const publicMenuRes = await request(app.getHttpServer())
        .get(`/api/v1/public/${rest.slug}/menu`)
        .expect(200);

      const cat = publicMenuRes.body.categories.find((c: any) => c.id === categoryId);
      expect(cat).toBeDefined();

      // Debe contener producto 1 marcado como OUT_OF_STOCK
      const p1Public = cat.products.find((p: any) => p.id === p1Id);
      expect(p1Public).toBeDefined();
      expect(p1Public.status).toBe('OUT_OF_STOCK');

      // Debe excluir estrictamente producto 2 (ARCHIVED)
      const p2Public = cat.products.find((p: any) => p.id === p2Id);
      expect(p2Public).toBeUndefined();

      // En PostgreSQL, producto 2 sigue existiendo
      const p2InDb = await prisma.product.findUnique({ where: { id: p2Id } });
      expect(p2InDb).toBeDefined();
      expect(p2InDb?.status).toBe('ARCHIVED');
    });
  });

  describe('TC-02-I04: Inyección de Etiquetas OpenGraph para Vista Previa en WhatsApp', () => {
    it('debe responder 200 OK con HTML y etiquetas og:title, og:description, og:image para la tarjeta de WhatsApp', async () => {
      const rest = await registerRestaurant('tc02-i04');

      // Asignar brand settings al tenant para probar la inyección
      await prisma.brandSettings.upsert({
        where: { tenant_id: rest.tenantId },
        update: {
          description: 'La mejor cocina colombiana tradicional en Bogotá.',
          cover_url: 'https://karta.co/storage/demo-cover.jpg',
        },
        create: {
          tenant_id: rest.tenantId,
          description: 'La mejor cocina colombiana tradicional en Bogotá.',
          cover_url: 'https://karta.co/storage/demo-cover.jpg',
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/r/${rest.slug}`)
        .expect(200);

      expect(res.headers['content-type']).toContain('text/html');
      const html = res.text;

      expect(html).toContain('<meta property="og:title"');
      expect(html).toContain('Org tc02-i04');
      expect(html).toContain('<meta property="og:description"');
      expect(html).toContain('La mejor cocina colombiana tradicional');
      expect(html).toContain('<meta property="og:image"');
      expect(html).toContain('https://karta.co/storage/demo-cover.jpg');
      expect(html).toContain('<meta property="og:type" content="website"');
    });
  });

  describe('TC-02-I05: Prevención de Configuración Tributaria Contradictoria y Auditoría', () => {
    it('debe rechazar configuración contradictoria con 400 y guardar y auditar configuración válida', async () => {
      const rest = await registerRestaurant('tc02-i05');

      // 1. Intentar configurar BASE_PLUS_TAX con IVA y default_tax_rate_bp = 0 (Contradictorio!)
      const invalidRes = await request(app.getHttpServer())
        .patch('/api/v1/admin/tax-profile')
        .set('Authorization', `Bearer ${rest.token}`)
        .send({
          tax_profile_mode: 'BASE_PLUS_TAX',
          default_tax_type: 'IVA',
          default_tax_rate_bp: 0,
        })
        .expect(400);

      expect(invalidRes.body.errorCode).toBe('VALIDATION_ERROR');

      // 2. Guardar una configuración válida: TAX_INCLUDED_DISCRIMINATED con INC 800 bp (8%)
      const validRes = await request(app.getHttpServer())
        .patch('/api/v1/admin/tax-profile')
        .set('Authorization', `Bearer ${rest.token}`)
        .send({
          tax_profile_mode: 'TAX_INCLUDED_DISCRIMINATED',
          default_tax_type: 'INC',
          default_tax_rate_bp: 800,
        })
        .expect(200);

      expect(validRes.body.tax_profile_mode).toBe('TAX_INCLUDED_DISCRIMINATED');
      expect(validRes.body.default_tax_type).toBe('INC');
      expect(validRes.body.default_tax_rate_bp).toBe(800);

      // 3. Verificar que se registró en audit_events
      const audit = await prisma.auditEvent.findFirst({
        where: {
          tenant_id: rest.tenantId,
          action: 'TAX_PROFILE_UPDATED',
        },
      });
      expect(audit).toBeDefined();
      expect((audit?.metadata_json as any).after.default_tax_rate_bp).toBe(800);
    });
  });

  describe('TC-02-I06: Aislamiento Multi-Tenant con RLS en Catálogo y Códigos QR', () => {
    it('un admin del Restaurante A no debe poder modificar ni revocar recursos del Restaurante B (404/RLS)', async () => {
      const restA = await registerRestaurant('tc02-i06-a');
      const restB = await registerRestaurant('tc02-i06-b');

      // Restaurante B crea una categoría y un producto
      const catB = await request(app.getHttpServer())
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${restB.token}`)
        .send({ name: 'Especiales B', sort_order: 1 })
        .expect(201);

      const prodB = await request(app.getHttpServer())
        .post('/api/v1/admin/products')
        .set('Authorization', `Bearer ${restB.token}`)
        .send({
          category_id: catB.body.id,
          name: 'Plato Exclusivo B',
          price_cop: 50000,
        })
        .expect(201);

      // Restaurante B genera un código QR
      const qrB = await request(app.getHttpServer())
        .post(`/api/v1/admin/branches/${restB.branchId}/qr-codes`)
        .set('Authorization', `Bearer ${restB.token}`)
        .send({ target_type: 'BRANCH_MENU', label: 'QR de B' })
        .expect(201);

      // 1. Admin A intenta modificar el precio del producto de B -> Debe responder 404
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/products/${prodB.body.id}`)
        .set('Authorization', `Bearer ${restA.token}`)
        .send({ price_cop: 1000 })
        .expect(404);

      // 2. Admin A intenta alternar disponibilidad del producto de B -> Debe responder 404
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/products/${prodB.body.id}/availability`)
        .set('Authorization', `Bearer ${restA.token}`)
        .send({ status: 'OUT_OF_STOCK' })
        .expect(404);

      // 3. Admin A intenta revocar el código QR de B -> Debe responder 404
      await request(app.getHttpServer())
        .post(`/api/v1/admin/qr-codes/${qrB.body.id}/revoke`)
        .set('Authorization', `Bearer ${restA.token}`)
        .send({ generate_replacement: false })
        .expect(404);

      // 4. Comprobar que en PostgreSQL los recursos de B permanecen intactos
      const prodInDb = await prisma.product.findUnique({ where: { id: prodB.body.id } });
      expect(prodInDb?.price_cop).toBe(50000);
      expect(prodInDb?.status).toBe('ACTIVE');

      const qrInDb = await prisma.qrCodeLink.findUnique({ where: { id: qrB.body.id } });
      expect(qrInDb?.is_active).toBe(true);
    });
  });
});
