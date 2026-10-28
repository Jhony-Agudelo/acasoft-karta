import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRE_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Validación de alcance de sucursal (branch_scope)
    const targetBranchId = request.params?.branchId || request.body?.branch_id;
    if (user && targetBranchId && user.roleKey !== 'TENANT_ADMIN' && user.roleKey !== 'PLATFORM_ADMIN') {
      const scope = user.branchScope as string[] | undefined;
      if (scope && scope.length > 0 && !scope.includes(targetBranchId)) {
        throw new ForbiddenException({
          errorCode: 'BRANCH_SCOPE_FORBIDDEN',
          message: `El usuario no tiene autorización para operar en la sucursal '${targetBranchId}'.`,
        });
      }
    }

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    if (!user || !user.roleKey) {
      throw new ForbiddenException({
        errorCode: 'FORBIDDEN',
        message: 'No posee los permisos necesarios para realizar esta acción.',
      });
    }

    // Administradores tienen acceso total
    if (user.roleKey === 'TENANT_ADMIN' || user.roleKey === 'PLATFORM_ADMIN') {
      return true;
    }

    // Consultar permisos del rol en base de datos
    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: { role_key: user.roleKey },
      select: { permission_key: true },
    });

    const userPerms = new Set(rolePermissions.map((rp) => rp.permission_key));
    const hasAll = requiredPermissions.every((p) => userPerms.has(p));

    if (!hasAll) {
      throw new ForbiddenException({
        errorCode: 'INSUFFICIENT_PERMISSIONS',
        message: 'No posee los permisos suficientes para esta operación.',
        requiredPermissions,
      });
    }

    return true;
  }
}
