import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from './test-app';
import { PrismaService } from '../src/database/prisma.service';

describe('Integración Fase 01: TC-01-I06, TC-01-I08, TC-01-I09', () => {
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

  describe('TC-01-I06: Aislamiento Estricto entre Tenants e Inyección de tenant_id', () => {
    it('debe impedir que un usuario del Restaurante A acceda o modifique datos del Restaurante B', async () => {
      // Registrar Restaurante A
      const regA = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          organization_name: 'Restaurante A',
          slug: `restaurante-a-${Date.now()}`,
          admin_name: 'Admin A',
          admin_email: `admin_a_${Date.now()}@restaurante.co`,
          admin_password: 'Password123!',
          admin_phone: '3001110001',
        })
        .expect(201);

      // Registrar Restaurante B
      const regB = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          organization_name: 'Restaurante B',
          slug: `restaurante-b-${Date.now()}`,
          admin_name: 'Admin B',
          admin_email: `admin_b_${Date.now()}@restaurante.co`,
          admin_password: 'Password123!',
          admin_phone: '3002220002',
        })
        .expect(201);

      const tokenA = regA.body.accessToken;
      const tenantBId = regB.body.tenant.id;
      const branchBId = regB.body.branch.id;

      // Usuario A intenta consultar una sucursal del Restaurante B -> 404 No encontrada
      await request(app.getHttpServer())
        .get(`/api/v1/admin/branches/${branchBId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);

      // Usuario A intenta modificar marca inyectando tenant_id de B en el body
      await request(app.getHttpServer())
        .patch('/api/v1/admin/brand')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          tenant_id: tenantBId, // Inyección maliciosa
          description: 'Ataque de sobreescritura',
        })
        .expect(200);

      // Verificar en base de datos que Restaurante B NO fue modificado
      const brandB = await prisma.brandSettings.findUnique({
        where: { tenant_id: tenantBId },
      });
      expect(brandB?.description).not.toBe('Ataque de sobreescritura');
    });
  });

  describe('TC-01-I08: Alcance de Sucursal por Rol (branch_scope)', () => {
    it('debe rechazar con 403 BRANCH_SCOPE_FORBIDDEN a un gerente que intenta operar fuera de su sucursal', async () => {
      const reg = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          organization_name: 'Restaurante Sucursales',
          slug: `restaurante-scope-${Date.now()}`,
          admin_name: 'Admin Propietario',
          admin_email: `owner_${Date.now()}@restaurante.co`,
          admin_password: 'Password123!',
          admin_phone: '3003334444',
        })
        .expect(201);

      const ownerToken = reg.body.accessToken;
      const branch1Id = reg.body.branch.id;

      // Crear Sucursal 2
      const branch2 = await request(app.getHttpServer())
        .post('/api/v1/admin/branches')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Sucursal 2 Norte',
          slug: 'sucursal-2-norte',
          address: 'Calle 100 # 15-20',
          phone_whatsapp_e164: '3005556666',
        })
        .expect(201);

      const branch2Id = branch2.body.id;

      // Crear un BRANCH_MANAGER cuyo branch_scope solo incluye branch1Id
      const managerEmail = `gerente_${Date.now()}@restaurante.co`;
      const managerUser = await request(app.getHttpServer())
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: 'Gerente Sucursal 1',
          email: managerEmail,
          phone: '3007778899',
          role_key: 'BRANCH_MANAGER',
          branch_scope: [branch1Id], // Exclusivo de Sucursal 1
          delivery_mode: 'TEMPORARY_PASSWORD',
          temp_password: 'ManagerPassword123!',
        })
        .expect(201);

      // Iniciar sesión como gerente
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/session')
        .send({
          email: managerEmail,
          password: 'ManagerPassword123!',
        })
        .expect(200);

      // Cambiar contraseña obligatoria
      const changeRes = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
        .send({
          current_password: 'ManagerPassword123!',
          new_password: 'NewManagerPassword123!',
        })
        .expect(200);

      const managerToken = changeRes.body.accessToken;

      // Gerente puede consultar y modificar sucursal 1 (autorizada)
      await request(app.getHttpServer())
        .get(`/api/v1/admin/branches/${branch1Id}/channel-policies`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      // Gerente intenta consultar o modificar sucursal 2 (fuera de scope) -> 403 BRANCH_SCOPE_FORBIDDEN
      const forbiddenRes = await request(app.getHttpServer())
        .get(`/api/v1/admin/branches/${branch2Id}/channel-policies`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);

      expect(forbiddenRes.body.errorCode).toBe('BRANCH_SCOPE_FORBIDDEN');
    });
  });

  describe('TC-01-I09: Trazabilidad en AuditEvent y Sonda /api/v1/health', () => {
    it('debe responder 200 OK en la sonda de salud activa', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.database).toBe('connected');
      expect(res.body.timestamp).toBeDefined();
    });

    it('debe registrar eventos de auditoría trazables sin incluir PII ni contraseñas', async () => {
      const slug = `restaurante-audit-${Date.now()}`;
      const reg = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          organization_name: 'Restaurante Audit Trail',
          slug,
          admin_name: 'Admin Audit',
          admin_email: `audit_${Date.now()}@restaurante.co`,
          admin_password: 'Password123!',
          admin_phone: '3009990011',
        })
        .expect(201);

      const tenantId = reg.body.tenant.id;
      const token = reg.body.accessToken;

      // Consultar eventos de auditoría
      const auditRes = await request(app.getHttpServer())
        .get('/api/v1/admin/audit-events')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(auditRes.body.items).toBeDefined();
      expect(auditRes.body.items.length).toBeGreaterThan(0);

      const regEvent = auditRes.body.items.find((e: any) => e.action === 'ORGANIZATION_REGISTERED');
      expect(regEvent).toBeDefined();
      expect(regEvent.tenant_id).toBe(tenantId);
      // Validar que no almacene contraseñas ni secretos en metadata_json
      expect(JSON.stringify(regEvent.metadata_json)).not.toContain('Password123!');
    });
  });
});
