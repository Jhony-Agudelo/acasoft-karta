import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as crypto from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  RegisterTenantDto,
  LoginDto,
  ChangePasswordDto,
  AcceptInviteDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  OPERATING_PROFILES,
} from '@restaurante-saas/shared';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Registro transaccional de organización, usuario administrador, marca, sucursal inicial y perfil.
   */
  async register(dto: RegisterTenantDto) {
    // 1. Validar unicidad de slug
    const existingTenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.slug },
    });
    if (existingTenant) {
      throw new ConflictException(`El identificador de restaurante '${dto.slug}' ya está en uso.`);
    }

    // 2. Validar si el correo del admin ya existe
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.admin_email },
    });
    if (existingUser) {
      throw new ConflictException(`El correo electrónico '${dto.admin_email}' ya está registrado.`);
    }

    const passwordHash = await argon2.hash(dto.admin_password);
    const profile = OPERATING_PROFILES[dto.initial_profile] || OPERATING_PROFILES.WHATSAPP_SIMPLE;

    // 3. Ejecutar alta completa en transacción
    const result = await this.prisma.$transaction(async (tx) => {
      // a. Crear Organización
      const tenant = await tx.tenant.create({
        data: {
          name: dto.organization_name,
          slug: dto.slug,
          plan_id: dto.plan_id || 'PLAN_STARTER_WHATSAPP',
          status: 'ACTIVE',
        },
      });

      // b. Crear Configuración de Marca por defecto
      const brandSettings = await tx.brandSettings.create({
        data: {
          tenant_id: tenant.id,
          primary_color: '#E11D48',
          secondary_color: '#1E293B',
          description: `Bienvenido a ${dto.organization_name}`,
        },
      });

      // c. Crear Sucursal Principal
      const branch = await tx.branch.create({
        data: {
          tenant_id: tenant.id,
          name: dto.branch_name || 'Sede Principal',
          slug: 'principal',
          address: dto.branch_address || 'Calle Principal # 1-01',
          phone_whatsapp_e164: dto.admin_phone,
          status: 'ACTIVE',
        },
      });

      // d. Crear Usuario Administrador
      const user = await tx.user.create({
        data: {
          name: dto.admin_name,
          email: dto.admin_email,
          phone: dto.admin_phone,
          password_hash: passwordHash,
          status: 'ACTIVE',
          must_change_password: false,
        },
      });

      // e. Crear Membresía TENANT_ADMIN
      const membership = await tx.membership.create({
        data: {
          tenant_id: tenant.id,
          user_id: user.id,
          role_key: 'TENANT_ADMIN',
          branch_scope: [],
          is_active: true,
        },
      });

      // f. Configurar políticas de canal según perfil
      // Regla de Oro: DINE_IN es siempre OFFLINE_ONLY; PICKUP y DELIVERY toman default_pickup_delivery_policy
      const pickupDeliveryPolicy = profile.default_pickup_delivery_policy;
      const channels = [
        {
          fulfillment_type: 'PICKUP',
          payment_policy: pickupDeliveryPolicy,
          require_payment_before_preparation: false,
          enabled: true,
        },
        {
          fulfillment_type: 'DELIVERY',
          payment_policy: pickupDeliveryPolicy,
          require_payment_before_preparation: false,
          enabled: true,
        },
        {
          fulfillment_type: 'DINE_IN',
          payment_policy: 'OFFLINE_ONLY',
          require_payment_before_preparation: false,
          enabled: (profile.module_keys as readonly string[]).includes('dining'),
        },
      ];

      for (const ch of channels) {
        await tx.branchChannelPolicy.create({
          data: {
            tenant_id: tenant.id,
            branch_id: branch.id,
            fulfillment_type: ch.fulfillment_type,
            payment_policy: ch.payment_policy,
            require_payment_before_preparation: ch.require_payment_before_preparation,
            enabled: ch.enabled,
            whatsapp_number_e164: dto.admin_phone,
          },
        });
      }

      // g. Activar módulos del perfil a nivel de organización
      for (const modKey of profile.module_keys) {
        await tx.tenantModuleSetting.create({
          data: {
            tenant_id: tenant.id,
            branch_id: null,
            module_key: modKey,
            enabled: true,
          },
        });
      }

      return { tenant, brandSettings, branch, user, membership };
    });

    // 4. Registrar evento de auditoría
    await this.auditService.record({
      tenantId: result.tenant.id,
      branchId: result.branch.id,
      actorId: result.user.id,
      action: 'ORGANIZATION_REGISTERED',
      entityType: 'Tenant',
      entityId: result.tenant.id,
      metadata: {
        organizationName: dto.organization_name,
        initialProfile: dto.initial_profile,
      },
    });

    // 5. Emitir Tokens de Acceso
    const tokens = await this.generateTokens({
      sub: result.user.id,
      email: result.user.email,
      name: result.user.name,
      tenant_id: result.tenant.id,
      role_key: result.membership.role_key,
      branch_scope: result.membership.branch_scope,
      must_change_password: false,
    });

    return {
      ...tokens,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        roleKey: result.membership.role_key,
        branchScope: result.membership.branch_scope,
        mustChangePassword: false,
      },
      tenant: {
        id: result.tenant.id,
        name: result.tenant.name,
        slug: result.tenant.slug,
        planId: result.tenant.plan_id,
      },
      branch: {
        id: result.branch.id,
        name: result.branch.name,
        slug: result.branch.slug,
      },
    };
  }

  /**
   * Inicio de sesión con correo y contraseña.
   */
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: {
        memberships: {
          where: { is_active: true },
          include: { tenant: true },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    if (user.status === 'SUSPENDED') {
      throw new ForbiddenException('Su cuenta de usuario se encuentra suspendida.');
    }

    const isValid = await argon2.verify(user.password_hash, dto.password);
    if (!isValid) {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    // Seleccionar membresía activa (priorizar TENANT_ADMIN o la primera disponible)
    const primaryMembership =
      user.memberships.find((m) => m.role_key === 'TENANT_ADMIN') || user.memberships[0];

    if (!primaryMembership) {
      throw new ForbiddenException('El usuario no posee membresías activas en ninguna organización.');
    }

    const tokens = await this.generateTokens({
      sub: user.id,
      email: user.email,
      name: user.name,
      tenant_id: primaryMembership.tenant_id,
      role_key: primaryMembership.role_key,
      branch_scope: primaryMembership.branch_scope,
      must_change_password: user.must_change_password,
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roleKey: primaryMembership.role_key,
        branchScope: primaryMembership.branch_scope,
        mustChangePassword: user.must_change_password,
      },
      tenant: {
        id: primaryMembership.tenant.id,
        name: primaryMembership.tenant.name,
        slug: primaryMembership.tenant.slug,
      },
    };
  }

  /**
   * Refresco de token de acceso a partir de cookie HttpOnly.
   */
  async refreshAccessToken(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Token de refresco ausente.');
    }

    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET') || 'jwt_refresh_secret_default';
    try {
      const payload = this.jwtService.verify(refreshToken, { secret: refreshSecret });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: {
          memberships: {
            where: { tenant_id: payload.tenant_id, is_active: true },
          },
        },
      });

      if (!user || user.status === 'SUSPENDED' || user.memberships.length === 0) {
        throw new UnauthorizedException('Sesión revocada o usuario inactivo.');
      }

      const membership = user.memberships[0];
      if (!membership) {
        throw new UnauthorizedException('Membresía no encontrada.');
      }

      const tokens = await this.generateTokens({
        sub: user.id,
        email: user.email,
        name: user.name,
        tenant_id: membership.tenant_id,
        role_key: membership.role_key,
        branch_scope: membership.branch_scope,
        must_change_password: user.must_change_password,
      });

      return tokens;
    } catch {
      throw new UnauthorizedException('Token de refresco inválido o expirado.');
    }
  }

  /**
   * Cambio de contraseña para usuarios autenticados (y desbloqueo de must_change_password).
   */
  async changePassword(userId: string, tenantId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: { tenant_id: tenantId, is_active: true },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado.');
    }

    const isValid = await argon2.verify(user.password_hash, dto.current_password);
    if (!isValid) {
      throw new BadRequestException('La contraseña actual es incorrecta.');
    }

    const newHash = await argon2.hash(dto.new_password);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password_hash: newHash,
        must_change_password: false,
      },
    });

    await this.auditService.record({
      tenantId,
      actorId: userId,
      action: 'PASSWORD_CHANGED',
      entityType: 'User',
      entityId: userId,
    });

    const membership = user.memberships[0];
    const tokens = await this.generateTokens({
      sub: user.id,
      email: user.email,
      name: user.name,
      tenant_id: tenantId,
      role_key: membership?.role_key || 'CASHIER',
      branch_scope: membership?.branch_scope || [],
      must_change_password: false,
    });

    return {
      message: 'Contraseña actualizada exitosamente.',
      ...tokens,
    };
  }

  /**
   * Aceptación de invitación / activación con token de 24 horas.
   */
  async acceptInvite(dto: AcceptInviteDto) {
    const tokenHash = crypto.createHash('sha256').update(dto.token).digest('hex');

    const user = await this.prisma.user.findFirst({
      where: {
        invite_or_reset_token_hash: tokenHash,
        invite_or_reset_expires_at: { gt: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException('El enlace de invitación es inválido o ha expirado.');
    }

    const passwordHash = await argon2.hash(dto.new_password);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password_hash: passwordHash,
        status: 'ACTIVE',
        must_change_password: false,
        invite_or_reset_token_hash: null,
        invite_or_reset_expires_at: null,
      },
    });

    return {
      message: 'Cuenta activada correctamente. Ya puede iniciar sesión con su contraseña.',
    };
  }

  /**
   * Solicitud de restablecimiento de contraseña para propietarios (TENANT_ADMIN).
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: {
        memberships: {
          where: { role_key: 'TENANT_ADMIN', is_active: true },
        },
      },
    });

    if (user && user.memberships.length > 0) {
      const firstMembership = user.memberships[0];
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          invite_or_reset_token_hash: tokenHash,
          invite_or_reset_expires_at: expiresAt,
        },
      });

      if (firstMembership) {
        await this.auditService.record({
          tenantId: firstMembership.tenant_id,
          actorId: user.id,
          action: 'FORGOT_PASSWORD_REQUESTED',
          entityType: 'User',
          entityId: user.id,
        });
      }
    }

    // Mensaje neutro para evitar enumeración de usuarios
    return {
      message:
        'Si el correo electrónico corresponde a un propietario registrado, se han enviado las instrucciones de restablecimiento.',
    };
  }

  /**
   * Restablecimiento final de contraseña mediante token.
   */
  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = crypto.createHash('sha256').update(dto.token).digest('hex');

    const user = await this.prisma.user.findFirst({
      where: {
        invite_or_reset_token_hash: tokenHash,
        invite_or_reset_expires_at: { gt: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException('El enlace de restablecimiento es inválido o ha expirado.');
    }

    const passwordHash = await argon2.hash(dto.new_password);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password_hash: passwordHash,
        must_change_password: false,
        invite_or_reset_token_hash: null,
        invite_or_reset_expires_at: null,
      },
    });

    return {
      message: 'Contraseña restablecida exitosamente. Ya puede iniciar sesión.',
    };
  }

  private async generateTokens(payload: {
    sub: string;
    email: string;
    name: string;
    tenant_id: string;
    role_key: string;
    branch_scope: string[];
    must_change_password: boolean;
  }) {
    const accessToken = this.jwtService.sign(payload);
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET') || 'jwt_refresh_secret_default';
    const refreshExpires = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d';

    const refreshToken = this.jwtService.sign(
      { sub: payload.sub, tenant_id: payload.tenant_id },
      { secret: refreshSecret, expiresIn: refreshExpires },
    );

    return {
      accessToken,
      refreshToken,
    };
  }
}
