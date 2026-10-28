import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from './test-app';
import { PrismaService } from '../src/database/prisma.service';

describe('Integración Fase 01: TC-01-I01 a TC-01-I05', () => {
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

  describe('TC-01-I01: Onboarding de Perfil WHATSAPP_SIMPLE y Compatibilidad con CHECK de DINE_IN', () => {
    it('debe registrar el restaurante, aplicar WHATSAPP_SIMPLE y cumplir restricciones CHECK en DB', async () => {
      const slug = `restaurante-simple-${Date.now()}`;
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          organization_name: 'Restaurante Simple',
          slug,
          admin_name: 'Don Pedro',
          admin_email: `pedro_${Date.now()}@restaurante.co`,
          admin_password: 'Password123!',
          admin_phone: '3001234567',
          initial_profile: 'WHATSAPP_SIMPLE',
        })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      const branchId = res.body.branch.id;
      const tenantId = res.body.tenant.id;

      // Consultar capacidades de la sucursal
      const capRes = await request(app.getHttpServer())
        .get(`/api/v1/branches/${branchId}/capabilities?tenantId=${tenantId}`)
        .expect(200);

      const activeMods = capRes.body.enabledModules as string[];
      expect(activeMods).toContain('ordering');
      expect(activeMods).toContain('channel.pickup');
      expect(activeMods).toContain('channel.delivery');
      expect(activeMods).toContain('notifications.whatsapp_click');
      expect(activeMods).toContain('order_panel');
      expect(activeMods).toContain('tracking');
      expect(activeMods).not.toContain('dining');
      expect(activeMods).not.toContain('payments.manual');

      // Verificar en base de datos las políticas de canal y los CHECK constraints
      const policies = await prisma.branchChannelPolicy.findMany({
        where: { branch_id: branchId },
      });

      const pickup = policies.find((p) => p.fulfillment_type === 'PICKUP');
      const delivery = policies.find((p) => p.fulfillment_type === 'DELIVERY');
      const dineIn = policies.find((p) => p.fulfillment_type === 'DINE_IN');

      expect(pickup?.payment_policy).toBe('NONE');
      expect(delivery?.payment_policy).toBe('NONE');
      // DINE_IN siempre debe ser OFFLINE_ONLY con enabled = false
      expect(dineIn?.payment_policy).toBe('OFFLINE_ONLY');
      expect(dineIn?.enabled).toBe(false);
      expect(dineIn?.require_payment_before_preparation).toBe(false);
    });
  });

  describe('TC-01-I02: Reinicio Automático de require_payment_before_preparation al Bajar a NONE', () => {
    it('debe forzar require_payment_before_preparation = false al cambiar DELIVERY a NONE', async () => {
      const slug = `restaurante-full-${Date.now()}`;
      const reg = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          organization_name: 'Restaurante Full',
          slug,
          admin_name: 'Admin Full',
          admin_email: `full_${Date.now()}@restaurante.co`,
          admin_password: 'Password123!',
          admin_phone: '3007654321',
          plan_id: 'PLAN_OPERATIONS_PRO',
          initial_profile: 'FULL_PANEL',
        })
        .expect(201);

      const token = reg.body.accessToken;
      const branchId = reg.body.branch.id;

      // Configurar require_payment_before_preparation: true en DELIVERY (bajo OFFLINE_ONLY)
      const patch1 = await request(app.getHttpServer())
        .patch(`/api/v1/admin/branches/${branchId}/channel-policies/DELIVERY`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          payment_policy: 'OFFLINE_ONLY',
          require_payment_before_preparation: true,
        });

      if (patch1.status !== 200) {
        console.log('PATCH1 ERROR:', patch1.status, patch1.body);
      }
      expect(patch1.status).toBe(200);

      expect(patch1.body.require_payment_before_preparation).toBe(true);
      expect(patch1.body.payment_policy).toBe('OFFLINE_ONLY');

      // Ahora cambiar la política de DELIVERY a NONE
      const patch2 = await request(app.getHttpServer())
        .patch(`/api/v1/admin/branches/${branchId}/channel-policies/DELIVERY`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          payment_policy: 'NONE',
        })
        .expect(200);

      // El backend debe reiniciar automáticamente require_payment_before_preparation a false
      expect(patch2.body.payment_policy).toBe('NONE');
      expect(patch2.body.require_payment_before_preparation).toBe(false);
    });
  });

  describe('TC-01-I03: Sobrescritura por Sucursal y Activación Atómica en Lote', () => {
    it('debe activar dining y payments.manual en un solo lote en Sucursal 1 sin alterar Sucursal 2', async () => {
      const slug = `restaurante-multi-${Date.now()}`;
      const reg = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          organization_name: 'Cadena Multi',
          slug,
          admin_name: 'Admin Enterprise',
          admin_email: `multi_${Date.now()}@restaurante.co`,
          admin_password: 'Password123!',
          admin_phone: '3151234567',
          plan_id: 'PLAN_ENTERPRISE_DINING',
          initial_profile: 'WHATSAPP_SIMPLE',
        })
        .expect(201);

      const token = reg.body.accessToken;
      const tenantId = reg.body.tenant.id;
      const branch1Id = reg.body.branch.id;

      // Crear Sucursal 2 (Cocina oculta)
      const branch2Res = await request(app.getHttpServer())
        .post('/api/v1/admin/branches')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Sucursal 2 - Cocina Oculta',
          slug: 'cocina-oculta',
          address: 'Avenida 2 # 20-30',
          phone_whatsapp_e164: '3159998877',
        });

      if (branch2Res.status !== 201) {
        console.log('BRANCH2 RES ERROR:', branch2Res.status, branch2Res.body);
      }
      expect(branch2Res.status).toBe(201);

      const branch2Id = branch2Res.body.id;

      // Activar en un solo lote dining y payments.manual para Sucursal 1
      const updateBatch = await request(app.getHttpServer())
        .patch(`/api/v1/admin/branches/${branch1Id}/modules`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          modules: [
            { module_key: 'dining', enabled: true },
            { module_key: 'payments.manual', enabled: true },
          ],
        })
        .expect(200);

      expect(updateBatch.body.activeModules).toContain('dining');
      expect(updateBatch.body.activeModules).toContain('payments.manual');

      // Verificar que Sucursal 1 tiene dining activo y Sucursal 2 NO tiene dining activo
      const cap1 = await request(app.getHttpServer())
        .get(`/api/v1/branches/${branch1Id}/capabilities?tenantId=${tenantId}`)
        .expect(200);
      expect(cap1.body.enabledModules).toContain('dining');

      const cap2 = await request(app.getHttpServer())
        .get(`/api/v1/branches/${branch2Id}/capabilities?tenantId=${tenantId}`)
        .expect(200);
      expect(cap2.body.enabledModules).not.toContain('dining');
    });
  });

  describe('TC-01-I04: Bloqueo Real en Backend por ModuleCapabilityGuard y PlanEntitlement', () => {
    it('debe responder 403 MODULE_DISABLED si la sucursal tiene dining apagado', async () => {
      const slug = `restaurante-guard-${Date.now()}`;
      const reg = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          organization_name: 'Restaurante Guard',
          slug,
          admin_name: 'Admin Guard',
          admin_email: `guard_${Date.now()}@restaurante.co`,
          admin_password: 'Password123!',
          admin_phone: '3201112233',
          plan_id: 'PLAN_STARTER_WHATSAPP',
          initial_profile: 'WHATSAPP_SIMPLE',
        })
        .expect(201);

      const token = reg.body.accessToken;

      // El endpoint de prueba requiere 'dining'
      const res = await request(app.getHttpServer())
        .get('/api/v1/test/dining-feature')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(res.body.errorCode).toBe('MODULE_DISABLED');
      expect(res.body.details?.moduleKey || res.body.moduleKey).toBe('dining');
    });

    it('debe responder 403 PLAN_UPGRADE_REQUIRED si intenta activar dining en PLAN_STARTER_WHATSAPP', async () => {
      const slug = `restaurante-upgrade-${Date.now()}`;
      const reg = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          organization_name: 'Restaurante Starter',
          slug,
          admin_name: 'Admin Starter',
          admin_email: `starter_${Date.now()}@restaurante.co`,
          admin_password: 'Password123!',
          admin_phone: '3204445566',
          plan_id: 'PLAN_STARTER_WHATSAPP',
          initial_profile: 'WHATSAPP_SIMPLE',
        })
        .expect(201);

      const token = reg.body.accessToken;

      const res = await request(app.getHttpServer())
        .patch('/api/v1/admin/modules')
        .set('Authorization', `Bearer ${token}`)
        .send({
          modules: [{ module_key: 'dining', enabled: true }],
        })
        .expect(403);

      expect(res.body.errorCode).toBe('PLAN_UPGRADE_REQUIRED');
    });
  });

  describe('TC-01-I05: Ciclo de Usuario con Clave Temporal e Invitación por WhatsApp sin Email', () => {
    it('debe obligar al cambio de contraseña a un usuario con clave temporal y permitir operar tras cambiarla', async () => {
      const slug = `restaurante-staff-${Date.now()}`;
      const reg = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          organization_name: 'Restaurante Staff Demo',
          slug,
          admin_name: 'Admin Don Jose',
          admin_email: `jose_${Date.now()}@restaurante.co`,
          admin_password: 'Password123!',
          admin_phone: '3009998877',
          initial_profile: 'WHATSAPP_SIMPLE',
        })
        .expect(201);

      const adminToken = reg.body.accessToken;

      // 1. Crear mesero con contraseña temporal
      const waiterEmail = `mesero_${Date.now()}@restaurante.co`;
      const staffRes = await request(app.getHttpServer())
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Juan Mesero',
          email: waiterEmail,
          phone: '3105556677',
          role_key: 'WAITER',
          delivery_mode: 'TEMPORARY_PASSWORD',
        })
        .expect(201);

      const tempPassword = staffRes.body.tempPassword;
      expect(tempPassword).toBeDefined();
      expect(staffRes.body.whatsappInviteUrl).toContain('https://wa.me/');

      // 2. Mesero inicia sesión con clave temporal
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/session')
        .send({
          email: waiterEmail,
          password: tempPassword,
        })
        .expect(200);

      const waiterToken = loginRes.body.accessToken;
      expect(loginRes.body.user.mustChangePassword).toBe(true);

      // 3. Mesero intenta acceder a una ruta protegida antes de cambiar la clave -> 403 PASSWORD_CHANGE_REQUIRED
      const blockedRes = await request(app.getHttpServer())
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${waiterToken}`)
        .expect(403);

      expect(blockedRes.body.errorCode).toBe('PASSWORD_CHANGE_REQUIRED');

      // 4. Mesero cambia su contraseña obligatoria
      const changeRes = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${waiterToken}`)
        .send({
          current_password: tempPassword,
          new_password: 'NewStrongPassword123!',
        })
        .expect(200);

      const newWaiterToken = changeRes.body.accessToken;
      expect(newWaiterToken).toBeDefined();

      // 5. Mesero puede operar ahora sin bloqueo de contraseña
      await request(app.getHttpServer())
        .get('/api/v1/admin/brand')
        .set('Authorization', `Bearer ${newWaiterToken}`)
        .expect(200);
    });

    it('debe permitir a un cajero activar su cuenta mediante accept-invite desde el enlace de WhatsApp', async () => {
      const slug = `restaurante-cajero-${Date.now()}`;
      const reg = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          organization_name: 'Restaurante Caja Demo',
          slug,
          admin_name: 'Admin Caja',
          admin_email: `caja_admin_${Date.now()}@restaurante.co`,
          admin_password: 'Password123!',
          admin_phone: '3008889900',
          initial_profile: 'WHATSAPP_SIMPLE',
        })
        .expect(201);

      const adminToken = reg.body.accessToken;

      // Crear cajero con enlace de invitación
      const cashierEmail = `cajero_${Date.now()}@restaurante.co`;
      const staffRes = await request(app.getHttpServer())
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Ana Cajera',
          email: cashierEmail,
          phone: '3112223344',
          role_key: 'CASHIER',
          delivery_mode: 'WHATSAPP_INVITE_LINK',
        })
        .expect(201);

      expect(staffRes.body.inviteUrl).toContain('/auth/accept-invite?token=');
      const urlParts = staffRes.body.inviteUrl.split('token=');
      const rawToken = urlParts[1];

      // Cajero activa su cuenta y define su contraseña
      await request(app.getHttpServer())
        .post('/api/v1/auth/accept-invite')
        .send({
          token: rawToken,
          new_password: 'PasswordCajero123!',
        })
        .expect(200);

      // Cajero puede iniciar sesión exitosamente
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/session')
        .send({
          email: cashierEmail,
          password: 'PasswordCajero123!',
        })
        .expect(200);

      expect(loginRes.body.accessToken).toBeDefined();
      expect(loginRes.body.user.mustChangePassword).toBe(false);
    });
  });
});
