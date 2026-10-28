import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

@Injectable()
export class TenantContextGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Si el usuario está autenticado, su tenantId proviene exclusivamente del JWT
    if (user && user.tenantId) {
      request.tenantContext = {
        tenantId: user.tenantId,
        branchId: request.params?.branchId || request.body?.branch_id || undefined,
      };

      // Regla de Oro: Si el body contiene un tenant_id malicioso o discordante,
      // se ignora y se sobreescribe con el tenantId real del JWT para evitar filtraciones.
      if (request.body && typeof request.body === 'object') {
        if ('tenant_id' in request.body && request.body.tenant_id !== user.tenantId) {
          request.body.tenant_id = user.tenantId;
        }
      }

      return true;
    }

    // Para rutas no autenticadas (públicas), el contexto se resuelve si existe restaurantSlug o similar
    return true;
  }
}
