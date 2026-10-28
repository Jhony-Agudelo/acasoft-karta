import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OpenOperationsChecker } from './open-operations.checker';
import {
  MODULES_CATALOG,
  OPERATING_PROFILES,
  OperatingProfileKey,
  validateModuleSetAtomically,
  assertModuleSetValidAtomically,
  BatchUpdateModulesDto,
} from '@restaurante-saas/shared';

@Injectable()
export class CapabilitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly operationsChecker: OpenOperationsChecker,
  ) {}

  /**
   * Resuelve jerárquicamente las capacidades activas para una sucursal:
   * PlanEntitlement && !Module.is_post_mvp && (BranchSetting ?? TenantSetting ?? CoreModule)
   */
  async getBranchCapabilities(tenantId: string, branchId?: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        branches: branchId ? { where: { id: branchId } } : true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('Organización no encontrada.');
    }

    const entitlements = await this.prisma.planEntitlement.findMany({
      where: { plan_id: tenant.plan_id },
    });
    const allowedPlanModules = new Set(entitlements.map((e) => e.module_key));

    // Obtener configuraciones a nivel de tenant (branch_id = null)
    const tenantSettings = await this.prisma.tenantModuleSetting.findMany({
      where: { tenant_id: tenantId, branch_id: null },
    });
    const tenantSettingMap = new Map(tenantSettings.map((s) => [s.module_key, s.enabled]));

    // Obtener configuraciones a nivel de sucursal si aplica
    const branchSettingMap = new Map<string, boolean>();
    if (branchId) {
      const branchSettings = await this.prisma.tenantModuleSetting.findMany({
        where: { tenant_id: tenantId, branch_id: branchId },
      });
      for (const bs of branchSettings) {
        branchSettingMap.set(bs.module_key, bs.enabled);
      }
    }

    const enabledModules: string[] = [];

    for (const [key, modDef] of Object.entries(MODULES_CATALOG)) {
      if (modDef.is_post_mvp) continue;
      if (!allowedPlanModules.has(key)) continue;

      let isEnabled = false;
      if (branchId && branchSettingMap.has(key)) {
        isEnabled = !!branchSettingMap.get(key);
      } else if (tenantSettingMap.has(key)) {
        isEnabled = !!tenantSettingMap.get(key);
      }

      if (isEnabled) {
        enabledModules.push(key);
      }
    }

    return {
      tenantId,
      branchId: branchId || null,
      planId: tenant.plan_id,
      enabledModules,
    };
  }

  /**
   * Retorna el estado completo de los módulos a nivel de organización.
   */
  async getTenantModules(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) throw new NotFoundException('Organización no encontrada.');

    const entitlements = await this.prisma.planEntitlement.findMany({
      where: { plan_id: tenant.plan_id },
    });
    const allowedSet = new Set(entitlements.map((e) => e.module_key));

    const settings = await this.prisma.tenantModuleSetting.findMany({
      where: { tenant_id: tenantId, branch_id: null },
    });
    const settingMap = new Map(settings.map((s) => [s.module_key, s.enabled]));

    return Object.values(MODULES_CATALOG).map((mod) => ({
      key: mod.key,
      name: mod.name,
      description: mod.description,
      isCore: mod.is_core,
      isPostMvp: mod.is_post_mvp,
      isAllowedByPlan: allowedSet.has(mod.key),
      isEnabled: !!settingMap.get(mod.key),
      dependsOnAll: mod.depends_on_all,
      dependsOnAny: mod.depends_on_any,
    }));
  }

  /**
   * Retorna el estado de los módulos de una sucursal específica con su resolución.
   */
  async getBranchModules(tenantId: string, branchId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenant_id: tenantId },
    });
    if (!branch) throw new NotFoundException('Sucursal no encontrada.');

    const tenantModules = await this.getTenantModules(tenantId);
    const branchSettings = await this.prisma.tenantModuleSetting.findMany({
      where: { tenant_id: tenantId, branch_id: branchId },
    });
    const branchMap = new Map(branchSettings.map((s) => [s.module_key, s.enabled]));

    return tenantModules.map((tm) => ({
      ...tm,
      isOverriddenForBranch: branchMap.has(tm.key),
      isEnabledForBranch: branchMap.has(tm.key) ? !!branchMap.get(tm.key) : tm.isEnabled,
    }));
  }

  /**
   * Actualización en lote de módulos de organización con validación atómica del grafo ($S_final).
   */
  async updateTenantModules(tenantId: string, actorId: string, dto: BatchUpdateModulesDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) throw new NotFoundException('Organización no encontrada.');

    const entitlements = await this.prisma.planEntitlement.findMany({
      where: { plan_id: tenant.plan_id },
    });
    const allowedPlanModules = new Set(entitlements.map((e) => e.module_key));

    // Obtener estado actual
    const currentSettings = await this.prisma.tenantModuleSetting.findMany({
      where: { tenant_id: tenantId, branch_id: null },
    });
    const currentEnabled = new Set(currentSettings.filter((s) => s.enabled).map((s) => s.module_key));

    // Construir conjunto resultante S_final
    const targetSet = new Set(currentEnabled);
    for (const item of dto.modules) {
      if (item.enabled) {
        targetSet.add(item.module_key);
      } else {
        targetSet.delete(item.module_key);
      }
    }

    // 1. Validación atómica del grafo
    assertModuleSetValidAtomically(targetSet, allowedPlanModules);

    // 2. Para cada módulo que se desactiva, verificar operaciones abiertas
    for (const item of dto.modules) {
      if (!item.enabled && currentEnabled.has(item.module_key)) {
        await this.operationsChecker.assertNoOpenOperations(tenantId, null, item.module_key);
      }
    }

    // 3. Persistir en base de datos
    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.modules) {
        await tx.tenantModuleSetting.upsert({
          where: {
            tenant_id_branch_id_module_key: {
              tenant_id: tenantId,
              branch_id: null as any,
              module_key: item.module_key,
            },
          },
          update: {
            enabled: item.enabled,
            config_json: (item.config_json || {}) as any,
            updated_by: actorId,
          },
          create: {
            tenant_id: tenantId,
            branch_id: null,
            module_key: item.module_key,
            enabled: item.enabled,
            config_json: (item.config_json || {}) as any,
            updated_by: actorId,
          },
        });
      }
    });

    await this.auditService.record({
      tenantId,
      actorId,
      action: 'TENANT_MODULES_BATCH_UPDATED',
      entityType: 'TenantModuleSetting',
      entityId: tenantId,
      metadata: {
        enabledCount: targetSet.size,
        updatedModules: dto.modules,
      },
    });

    return {
      message: 'Módulos actualizados exitosamente.',
      activeModules: Array.from(targetSet),
    };
  }

  /**
   * Actualización en lote de módulos de sucursal (sobrescritura independiente).
   */
  async updateBranchModules(
    tenantId: string,
    actorId: string,
    branchId: string,
    dto: BatchUpdateModulesDto,
  ) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenant_id: tenantId },
    });
    if (!branch) throw new NotFoundException('Sucursal no encontrada.');

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) throw new NotFoundException('Organización no encontrada.');

    const entitlements = await this.prisma.planEntitlement.findMany({
      where: { plan_id: tenant.plan_id },
    });
    const allowedPlanModules = new Set(entitlements.map((e) => e.module_key));

    // Obtener estado efectivo actual de la sucursal
    const currentBranchRes = await this.getBranchCapabilities(tenantId, branchId);
    const targetSet = new Set(currentBranchRes.enabledModules);

    for (const item of dto.modules) {
      if (item.enabled) {
        targetSet.add(item.module_key);
      } else {
        targetSet.delete(item.module_key);
      }
    }

    // 1. Validación atómica en lote
    assertModuleSetValidAtomically(targetSet, allowedPlanModules);

    // 2. Validar que los módulos apagados no tengan operaciones abiertas
    for (const item of dto.modules) {
      if (!item.enabled && currentBranchRes.enabledModules.includes(item.module_key)) {
        await this.operationsChecker.assertNoOpenOperations(tenantId, branchId, item.module_key);
      }
    }

    // 3. Persistir configuración de la sucursal
    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.modules) {
        await tx.tenantModuleSetting.upsert({
          where: {
            tenant_id_branch_id_module_key: {
              tenant_id: tenantId,
              branch_id: branchId,
              module_key: item.module_key,
            },
          },
          update: {
            enabled: item.enabled,
            config_json: (item.config_json || {}) as any,
            updated_by: actorId,
          },
          create: {
            tenant_id: tenantId,
            branch_id: branchId,
            module_key: item.module_key,
            enabled: item.enabled,
            config_json: (item.config_json || {}) as any,
            updated_by: actorId,
          },
        });
      }
    });

    await this.auditService.record({
      tenantId,
      branchId,
      actorId,
      action: 'BRANCH_MODULES_BATCH_UPDATED',
      entityType: 'Branch',
      entityId: branchId,
      metadata: {
        activeCount: targetSet.size,
        updatedModules: dto.modules,
      },
    });

    return {
      message: 'Módulos de la sucursal actualizados exitosamente.',
      activeModules: Array.from(targetSet),
    };
  }

  /**
   * Aplicación de un perfil operativo del MVP respetando las políticas de canal.
   * Reglas de Oro (Sección 4.0):
   * 1. default_pickup_delivery_policy se asigna únicamente a PICKUP y DELIVERY.
   * 2. Si default_pickup_delivery_policy pasa a NONE, se fuerza require_payment_before_preparation = false.
   * 3. La fila DINE_IN conserva siempre payment_policy = 'OFFLINE_ONLY' y require_payment_before_preparation = false,
   *    con enabled = (dining está activo en el perfil).
   */
  async applyOperatingProfile(
    tenantId: string,
    actorId: string,
    profileKey: string,
    branchId?: string,
  ) {
    const profile = OPERATING_PROFILES[profileKey as OperatingProfileKey];
    if (!profile) {
      throw new BadRequestException(`El perfil operativo '${profileKey}' no existe.`);
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { branches: true },
    });
    if (!tenant) throw new NotFoundException('Organización no encontrada.');

    const entitlements = await this.prisma.planEntitlement.findMany({
      where: { plan_id: tenant.plan_id },
    });
    const allowedPlanModules = new Set(entitlements.map((e) => e.module_key));

    // Validar atómicamente el perfil contra el plan
    assertModuleSetValidAtomically(profile.module_keys, allowedPlanModules);

    const targetBranches = branchId
      ? tenant.branches.filter((b) => b.id === branchId)
      : tenant.branches;

    if (targetBranches.length === 0) {
      throw new NotFoundException('No se encontraron sucursales para aplicar el perfil.');
    }

    const isDiningActive = (profile.module_keys as readonly string[]).includes('dining');
    const pickupDeliveryPolicy = profile.default_pickup_delivery_policy;

    await this.prisma.$transaction(async (tx) => {
      // 1. Actualizar módulos en lote
      for (const modKey of Object.keys(MODULES_CATALOG)) {
        const isEnabledInProfile = (profile.module_keys as readonly string[]).includes(modKey);
        await tx.tenantModuleSetting.upsert({
          where: {
            tenant_id_branch_id_module_key: {
              tenant_id: tenantId,
              branch_id: branchId || (null as any),
              module_key: modKey,
            },
          },
          update: {
            enabled: isEnabledInProfile,
            updated_by: actorId,
          },
          create: {
            tenant_id: tenantId,
            branch_id: branchId || null,
            module_key: modKey,
            enabled: isEnabledInProfile,
            updated_by: actorId,
          },
        });
      }

      // 2. Aplicar políticas de canal por sucursal
      for (const br of targetBranches) {
        // Canales PICKUP y DELIVERY
        for (const ft of ['PICKUP', 'DELIVERY']) {
          await tx.branchChannelPolicy.upsert({
            where: {
              tenant_id_branch_id_fulfillment_type: {
                tenant_id: tenantId,
                branch_id: br.id,
                fulfillment_type: ft,
              },
            },
            update: {
              payment_policy: pickupDeliveryPolicy,
              // Si pasa a NONE, apagar obligatoriamente require_payment_before_preparation
              ...(pickupDeliveryPolicy === 'NONE' ? { require_payment_before_preparation: false } : {}),
            },
            create: {
              tenant_id: tenantId,
              branch_id: br.id,
              fulfillment_type: ft,
              enabled: true,
              payment_policy: pickupDeliveryPolicy,
              require_payment_before_preparation: false,
            },
          });
        }

        // Canal DINE_IN (Siempre OFFLINE_ONLY)
        await tx.branchChannelPolicy.upsert({
          where: {
            tenant_id_branch_id_fulfillment_type: {
              tenant_id: tenantId,
              branch_id: br.id,
              fulfillment_type: 'DINE_IN',
            },
          },
          update: {
            enabled: isDiningActive,
            payment_policy: 'OFFLINE_ONLY',
            require_payment_before_preparation: false,
          },
          create: {
            tenant_id: tenantId,
            branch_id: br.id,
            fulfillment_type: 'DINE_IN',
            enabled: isDiningActive,
            payment_policy: 'OFFLINE_ONLY',
            require_payment_before_preparation: false,
          },
        });
      }
    });

    await this.auditService.record({
      tenantId,
      branchId,
      actorId,
      action: 'OPERATING_PROFILE_APPLIED',
      entityType: 'OperatingProfile',
      entityId: profileKey,
      metadata: {
        profileKey,
        defaultPickupDeliveryPolicy: pickupDeliveryPolicy,
        isDiningActive,
        appliedToBranchesCount: targetBranches.length,
      },
    });

    return {
      message: `Perfil operativo '${profile.name}' aplicado con éxito.`,
      profileKey,
      activeModules: profile.module_keys,
      defaultPickupDeliveryPolicy: pickupDeliveryPolicy,
    };
  }

  listOperatingProfiles() {
    return Object.values(OPERATING_PROFILES);
  }
}
