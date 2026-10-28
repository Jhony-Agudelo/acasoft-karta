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
