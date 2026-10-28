import {
  Injectable,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const canActivate = (await super.canActivate(context)) as boolean;
    if (!canActivate) {
      return false;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Sesión no autorizada o expirada.');
    }

    // Regla de Oro: Si el usuario tiene must_change_password = true,
    // solo se le permite invocar change-password o cerrar sesión.
    if (user.mustChangePassword) {
      const path = request.path || '';
      const allowedPaths = ['/api/v1/auth/change-password', '/api/v1/auth/session'];
      const isAllowed = allowedPaths.some((p) => path.startsWith(p));

      if (!isAllowed) {
        throw new ForbiddenException({
          errorCode: 'PASSWORD_CHANGE_REQUIRED',
          message: 'Debe cambiar su contraseña obligatoriamente antes de realizar operaciones en el sistema.',
        });
      }
    }

    return true;
  }
}
