try {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile('.env');
  }
} catch {
  try {
    if (typeof process.loadEnvFile === 'function') {
      process.loadEnvFile('../../.env');
    }
  } catch {}
}

import { PrismaClient } from '@prisma/client';
import { MODULES_CATALOG, OPERATING_PROFILES } from '@restaurante-saas/shared';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Iniciando Seed Idempotente de Fundación (Fase 01) ---');

  // 1. Catálogo de Permisos
  const permissions = [
    { key: 'tenancy:manage', description: 'Configurar organización, marca y sucursales' },
    { key: 'tenancy:read', description: 'Consultar configuración de la organización' },
    { key: 'users:manage', description: 'Crear, invitar y restablecer personal del restaurante' },
    { key: 'users:read', description: 'Consultar lista de miembros del equipo' },
    { key: 'modules:manage', description: 'Activar o desactivar capacidades y aplicar perfiles' },
    { key: 'modules:read', description: 'Consultar capacidades modulares activas' },
    { key: 'channels:manage', description: 'Configurar políticas de canal e instrucciones de pago' },
    { key: 'channels:read', description: 'Consultar políticas de canal de sucursales' },
    { key: 'orders:manage', description: 'Ajustar, procesar y avanzar pedidos' },
    { key: 'orders:read', description: 'Visualizar pedidos en el panel' },
    { key: 'dining:manage', description: 'Administrar mesas, áreas y cuentas abiertas' },
    { key: 'dining:read', description: 'Consultar estado del salón y cuentas' },
    { key: 'kitchen:operate', description: 'Actualizar estados de preparación en KDS' },
    { key: 'payments:manage', description: 'Registrar cobros manuales y resolver saldos' },
    { key: 'audit:read', description: 'Consultar eventos de auditoría y trazabilidad' },
    { key: 'reports:read', description: 'Consultar y exportar reportes de ventas y conciliación' },
  ];

  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: { description: perm.description },
      create: perm,
    });
  }
  console.log(`✓ ${permissions.length} permisos sincronizados.`);

  // 2. Roles del Sistema
  const roles = [
    { key: 'TENANT_ADMIN', name: 'Administrador / Propietario' },
    { key: 'BRANCH_MANAGER', name: 'Gerente de Sucursal' },
    { key: 'CASHIER', name: 'Cajero / Operador de Panel' },
    { key: 'WAITER', name: 'Mesero' },
    { key: 'KITCHEN', name: 'Cocina / Barra' },
    { key: 'DISPATCH_DRIVER', name: 'Repartidor / Despacho' },
    { key: 'CUSTOMER', name: 'Comensal / Cliente' },
    { key: 'PLATFORM_SUPPORT', name: 'Soporte de la Plataforma' },
    { key: 'PLATFORM_ADMIN', name: 'Administrador SaaS' },
  ];

  for (const r of roles) {
    await prisma.role.upsert({
      where: { key: r.key },
      update: { name: r.name },
      create: r,
    });
  }
  console.log(`✓ ${roles.length} roles sincronizados.`);

  // 3. Matriz de Permisos por Rol
  const rolePermissions: Record<string, string[]> = {
    TENANT_ADMIN: permissions.map((p) => p.key),
    BRANCH_MANAGER: [
      'tenancy:read',
      'users:manage',
      'users:read',
      'channels:manage',
      'channels:read',
      'orders:manage',
      'orders:read',
      'dining:manage',
      'dining:read',
      'kitchen:operate',
      'payments:manage',
      'audit:read',
      'reports:read',
    ],
    CASHIER: [
      'tenancy:read',
      'channels:read',
      'orders:manage',
      'orders:read',
      'dining:read',
      'payments:manage',
      'reports:read',
    ],
    WAITER: [
      'tenancy:read',
      'channels:read',
      'orders:manage',
      'orders:read',
      'dining:manage',
      'dining:read',
    ],
    KITCHEN: ['kitchen:operate', 'orders:read'],
    DISPATCH_DRIVER: ['orders:manage', 'orders:read'],
    CUSTOMER: [],
    PLATFORM_SUPPORT: ['tenancy:read', 'audit:read', 'modules:read'],
    PLATFORM_ADMIN: permissions.map((p) => p.key),
  };

  for (const [roleKey, permKeys] of Object.entries(rolePermissions)) {
    for (const pKey of permKeys) {
      await prisma.rolePermission.upsert({
        where: {
          role_key_permission_key: {
            role_key: roleKey,
            permission_key: pKey,
          },
        },
        update: {},
        create: {
          role_key: roleKey,
          permission_key: pKey,
        },
      });
    }
  }
  console.log('✓ Matriz de permisos por rol asignada.');

  // 4. Catálogo de los 16 Módulos (13 MVP + 3 Post-MVP)
  for (const mod of Object.values(MODULES_CATALOG)) {
    await prisma.module.upsert({
      where: { key: mod.key },
      update: {
        name: mod.name,
        depends_on_all: [...mod.depends_on_all],
        depends_on_any: [...mod.depends_on_any],
        is_core: mod.is_core,
        is_post_mvp: mod.is_post_mvp,
      },
      create: {
        key: mod.key,
        name: mod.name,
        depends_on_all: [...mod.depends_on_all],
        depends_on_any: [...mod.depends_on_any],
        is_core: mod.is_core,
        is_post_mvp: mod.is_post_mvp,
      },
    });
  }
  console.log(`✓ ${Object.keys(MODULES_CATALOG).length} módulos sincronizados (13 MVP + 3 Post-MVP).`);

  // 5. Perfiles de Operación Preconfigurados
  for (const profile of Object.values(OPERATING_PROFILES)) {
    await prisma.operatingProfile.upsert({
      where: { key: profile.key },
      update: {
        name: profile.name,
        module_keys: [...profile.module_keys],
        default_pickup_delivery_policy: profile.default_pickup_delivery_policy,
      },
      create: {
        key: profile.key,
        name: profile.name,
        module_keys: [...profile.module_keys],
        default_pickup_delivery_policy: profile.default_pickup_delivery_policy,
        default_config_json: {},
      },
    });
  }
  console.log(`✓ ${Object.keys(OPERATING_PROFILES).length} perfiles de operación sincronizados.`);

  // 6. Planes Comerciales y Entitlements
  const planEntitlements: Record<string, string[]> = {
    PLAN_STARTER_WHATSAPP: [
      'ordering',
      'channel.pickup',
      'channel.delivery',
      'notifications.whatsapp_click',
      'order_panel',
      'tracking',
    ],
    PLAN_OPERATIONS_PRO: [
      'ordering',
      'channel.pickup',
      'channel.delivery',
      'notifications.whatsapp_click',
      'order_panel',
      'tracking',
      'payments.manual',
      'kitchen',
      'notifications.email',
      'reporting',
    ],
    PLAN_ENTERPRISE_DINING: [
      'ordering',
      'channel.pickup',
      'channel.delivery',
      'dining',
      'channel.dine_in_qr',
      'dining.consumption_split',
      'order_panel',
      'kitchen',
      'tracking',
      'payments.manual',
      'notifications.whatsapp_click',
      'notifications.email',
      'reporting',
    ],
  };

  for (const [planId, moduleKeys] of Object.entries(planEntitlements)) {
    for (const mKey of moduleKeys) {
      await prisma.planEntitlement.upsert({
        where: {
          plan_id_module_key: {
            plan_id: planId,
            module_key: mKey,
          },
        },
        update: {},
        create: {
          plan_id: planId,
          module_key: mKey,
          limits_json: {},
        },
      });
    }
  }
  console.log('✓ Planes comerciales y entitlements sincronizados.');

  // 7. Tenant Demo y Usuario Inicial para Inicio de Sesión Inmediato
  const demoEmail = 'admin@karta.co';
  const demoPassword = 'Password123!';
  const hashedPassword = await argon2.hash(demoPassword);

  let demoTenant = await prisma.tenant.findUnique({
    where: { slug: 'karta-demo' },
  });

  if (!demoTenant) {
    demoTenant = await prisma.tenant.create({
      data: {
        name: 'Karta Gastronomía & Bistro',
        slug: 'karta-demo',
        plan_id: 'PLAN_OPERATIONS_PRO',
        status: 'ACTIVE',
        brand_settings: {
          create: {
            primary_color: '#ea580c',
            secondary_color: '#16a34a',
            description: 'Karta Bistro — Sistema Operativo Gastronómico',
          },
        },
      },
    });
    console.log('✓ Tenant demo "Karta Bistro" creado.');
  }

  // Sucursal principal demo
  let demoBranch = await prisma.branch.findFirst({
    where: { tenant_id: demoTenant.id, slug: 'zona-g' },
  });

  if (!demoBranch) {
    demoBranch = await prisma.branch.create({
      data: {
        tenant_id: demoTenant.id,
        name: 'Sede Gourmet Zona G',
        slug: 'zona-g',
        address: 'Calle 69A # 5-59, Zona G',
        phone_whatsapp_e164: '+573001234567',
        status: 'ACTIVE',
        channel_policies: {
          create: [
            {
              tenant_id: demoTenant.id,
              fulfillment_type: 'DINE_IN',
              enabled: true,
              payment_policy: 'OFFLINE_ONLY',
              require_payment_before_preparation: false,
            },
            {
              tenant_id: demoTenant.id,
              fulfillment_type: 'PICKUP',
              enabled: true,
              payment_policy: 'OFFLINE_ONLY',
              require_payment_before_preparation: false,
              payment_instructions_json: {
                nequi_phone: '+573001234567',
                daviplata_phone: '+573001234567',
                custom_instructions: 'Enviar soporte de transferencia al WhatsApp de la sede.',
              },
            },
            {
              tenant_id: demoTenant.id,
              fulfillment_type: 'DELIVERY',
              enabled: true,
              payment_policy: 'OFFLINE_ONLY',
              require_payment_before_preparation: false,
              payment_instructions_json: {
                nequi_phone: '+573001234567',
                daviplata_phone: '+573001234567',
                custom_instructions: 'Enviar soporte de transferencia al WhatsApp de la sede.',
              },
            },
          ],
        },
      },
    });
    console.log('✓ Sucursal demo creada.');
  }

  // Activar módulos predeterminados para el tenant demo
  const demoModules = planEntitlements['PLAN_OPERATIONS_PRO'] || [];
  for (const modKey of demoModules) {
    const existing = await prisma.tenantModuleSetting.findFirst({
      where: {
        tenant_id: demoTenant.id,
        branch_id: null,
        module_key: modKey,
      },
    });
    if (existing) {
      await prisma.tenantModuleSetting.update({
        where: { id: existing.id },
        data: { enabled: true },
      });
    } else {
      await prisma.tenantModuleSetting.create({
        data: {
          tenant_id: demoTenant.id,
          branch_id: null,
          module_key: modKey,
          enabled: true,
        },
      });
    }
  }
  console.log('✓ Módulos base activados para el tenant demo.');

  // 7.1 Usuarios Demo para Todos los Roles Operativos y de Plataforma
  const demoUsers = [
    {
      email: 'admin@karta.co',
      name: 'Carlos Propietario (Admin)',
      roleKey: 'TENANT_ADMIN',
      phone: '+573001234567',
    },
    {
      email: 'gerente@karta.co',
      name: 'Laura Gerente',
      roleKey: 'BRANCH_MANAGER',
      phone: '+573001234568',
    },
    {
      email: 'cajero@karta.co',
      name: 'Mateo Cajero',
      roleKey: 'CASHIER',
      phone: '+573001234569',
    },
    {
      email: 'mesero@karta.co',
      name: 'Juan Mesero',
      roleKey: 'WAITER',
      phone: '+573001234570',
    },
    {
      email: 'cocina@karta.co',
      name: 'Andrea Jefe de Cocina',
      roleKey: 'KITCHEN',
      phone: '+573001234571',
    },
    {
      email: 'repartidor@karta.co',
      name: 'Diego Repartidor',
      roleKey: 'DISPATCH_DRIVER',
      phone: '+573001234572',
    },
    {
      email: 'superadmin@karta.co',
      name: 'Sophia SaaS Superadmin',
      roleKey: 'PLATFORM_ADMIN',
      phone: '+573001234573',
    },
  ];

  for (const u of demoUsers) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        password_hash: hashedPassword,
        status: 'ACTIVE',
        must_change_password: false,
      },
      create: {
        email: u.email,
        name: u.name,
        password_hash: hashedPassword,
        phone: u.phone,
        status: 'ACTIVE',
        must_change_password: false,
      },
    });

    const existingMembership = await prisma.membership.findFirst({
      where: {
        tenant_id: demoTenant.id,
        user_id: user.id,
      },
    });

    if (existingMembership) {
      await prisma.membership.update({
        where: { id: existingMembership.id },
        data: {
          role_key: u.roleKey,
          is_active: true,
          branch_scope: [],
        },
      });
    } else {
      await prisma.membership.create({
        data: {
          tenant_id: demoTenant.id,
          user_id: user.id,
          role_key: u.roleKey,
          branch_scope: [],
          is_active: true,
        },
      });
    }
  }
  console.log(`✓ ${demoUsers.length} usuarios demo creados para inicio rápido (clave común: Password123!).`);

  console.log('--- Seed completado exitosamente ---');
}

main()
  .catch((e) => {
    console.error('Error durante el seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
