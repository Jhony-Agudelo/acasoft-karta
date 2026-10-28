import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  tenant_id: string;
  role_key: string;
  branch_scope: string[];
  must_change_password: boolean;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService?: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService?.get?.('JWT_ACCESS_SECRET') ||
        process.env.JWT_ACCESS_SECRET ||
        'acasoft_restaurant_saas_jwt_access_secret_super_secure_key_2026_x',
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload.sub || !payload.tenant_id) {
      throw new UnauthorizedException('Token inválido: faltan campos obligatorios.');
    }

    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      tenantId: payload.tenant_id,
      roleKey: payload.role_key,
      branchScope: payload.branch_scope || [],
      mustChangePassword: !!payload.must_change_password,
    };
  }
}
