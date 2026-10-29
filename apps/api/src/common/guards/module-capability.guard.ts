import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_MODULE_KEY } from '../decorators/require-module.decorator';
import { PrismaService } from '../../database/prisma.service';
import { MODULES_CATALOG, ModuleKey } from '@restaurante-saas/shared';

@Injectable()
export class ModuleCapabilityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredModule = this.reflector.getAllAndOverride<string>(
      REQUIRE_MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredModule) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const tenantId = user?.tenantId || request.tenantContext?.tenantId;
    let branchId = request.params?.branchId || request.body?.branch_id;

    if (!branchId && request.params?.accountId) {
      const acc = await this.prisma.diningAccount.findUnique({
        where: { id: request.params.accountId },
        select: { branch_id: true },
      });
      if (acc) {
        branchId = acc.branch_id;
      }
    }

    if (!tenantId) {
      // Si la ruta requiere un módulo pero no hay contexto de tenant, se rechaza
      throw new ForbiddenException({
        errorCode: 'MODULE_DISABLED',
        moduleKey: requiredModule,
        message: `El módulo '${requiredModule}' requiere contexto de restaurante activo.`,
      });
    }

    // 1. Verificar si el módulo es Post-MVP (prohibido)
    const modDef = MODULES_CATALOG[requiredModule as ModuleKey];
    if (modDef?.is_post_mvp) {
      throw new ForbiddenException({
        errorCode: 'MODULE_RESERVED_POST_MVP',
        moduleKey: requiredModule,
        message: `El módulo '${requiredModule}' está reservado para Post-MVP.`,
      });
    }

    // 2. Obtener el tenant y verificar PlanEntitlement
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan_id: true },
    });

    if (!tenant) {
      throw new ForbiddenException({
        errorCode: 'MODULE_DISABLED',
        moduleKey: requiredModule,
        message: 'Organización no encontrada.',
      });
    }

    const entitlement = await this.prisma.planEntitlement.findUnique({
      where: {
        plan_id_module_key: {
          plan_id: tenant.plan_id,
          module_key: requiredModule,
        },
      },
    });

    if (!entitlement) {
      throw new ForbiddenException({
        errorCode: 'MODULE_DISABLED',
        moduleKey: requiredModule,
        message: `El plan comercial actual no incluye el módulo '${requiredModule}'.`,
      });
    }

    // 3. Resolución jerárquica: BranchSetting ?? TenantSetting ?? CoreModule
    if (branchId) {
      const branchSetting = await this.prisma.tenantModuleSetting.findUnique({
        where: {
          tenant_id_branch_id_module_key: {
            tenant_id: tenantId,
            branch_id: branchId,
            module_key: requiredModule,
          },
        },
      });

      if (branchSetting) {
        if (!branchSetting.enabled) {
          throw new ForbiddenException({
            errorCode: 'MODULE_DISABLED',
            moduleKey: requiredModule,
            message: `El módulo '${requiredModule}' está desactivado para esta sucursal.`,
          });
        }
        return true;
      }
    }

    // Si no hay configuración de sucursal, buscar configuración a nivel de tenant (branch_id = null)
    const tenantSetting = await this.prisma.tenantModuleSetting.findFirst({
      where: {
        tenant_id: tenantId,
        branch_id: null,
        module_key: requiredModule,
      },
    });

    if (tenantSetting) {
      if (!tenantSetting.enabled) {
        throw new ForbiddenException({
          errorCode: 'MODULE_DISABLED',
          moduleKey: requiredModule,
          message: `El módulo '${requiredModule}' está desactivado para este restaurante.`,
        });
      }
      return true;
    }

    // Si no hay fila explícita, los módulos del MVP inician según perfil o desactivados por defecto
    throw new ForbiddenException({
      errorCode: 'MODULE_DISABLED',
      moduleKey: requiredModule,
      message: `El módulo '${requiredModule}' no está activo en este restaurante.`,
    });
  }
}
