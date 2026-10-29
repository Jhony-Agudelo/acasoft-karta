import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../database/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class SubscriptionStatusGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const method = request.method?.toUpperCase();
    const path = request.path || '';

    // Rutas permitidas en estado SUSPENDED:
    // - Consultas de solo lectura (GET)
    // - Autenticación y cambio de credenciales (/auth/*)
    // - Consulta de suscripción administrativa (/admin/subscription)
    // - Operaciones de administración de la plataforma (/platform/*)
    if (
      method === 'GET' ||
      path.includes('/auth/') ||
      path.includes('/admin/subscription') ||
      path.includes('/platform/')
    ) {
      return true;
    }

    // Resolver tenantId del usuario autenticado o de cabecera
    const user = request.user;
    const tenantId =
      user?.tenantId ||
      request.headers['x-tenant-id'] ||
      request.tenantContext?.tenantId;

    if (!tenantId) {
      return true;
    }

    const subscription = await this.prisma.subscription.findUnique({
      where: { tenant_id: tenantId },
      select: { status: true },
    });

    if (subscription?.status === 'SUSPENDED') {
      throw new ForbiddenException({
        errorCode: 'TENANT_SUBSCRIPTION_SUSPENDED',
        message:
          'La suscripción del restaurante se encuentra suspendida por falta de pago o vencimiento de periodo.',
      });
    }

    return true;
  }
}
