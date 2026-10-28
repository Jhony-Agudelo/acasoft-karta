import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as crypto from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateStaffUserDto,
  UpdateStaffUserDto,
  buildStaffInviteWhatsAppMessage,
  buildWhatsAppLink,
} from '@restaurante-saas/shared';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Lista todos los miembros del personal de un tenant.
   */
  async listStaff(tenantId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { tenant_id: tenantId },
      include: {
        user: true,
        role: true,
      },
      orderBy: { created_at: 'desc' },
    });

    return memberships.map((m) => ({
      membershipId: m.id,
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      phone: m.user.phone,
      roleKey: m.role_key,
      roleName: m.role.name,
      branchScope: m.branch_scope,
      status: m.user.status,
      mustChangePassword: m.user.must_change_password,
      isActive: m.is_active,
      createdAt: m.created_at,
    }));
  }

  /**
   * Crea o invita a un nuevo miembro del equipo mediante clave temporal o enlace para WhatsApp.
   */
  async createStaff(tenantId: string, actorId: string, dto: CreateStaffUserDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException('Organización no encontrada.');
    }

    const role = await this.prisma.role.findUnique({
      where: { key: dto.role_key },
    });
    if (!role) {
      throw new BadRequestException(`El rol '${dto.role_key}' no existe.`);
    }

    // Verificar si ya existe usuario con este email
    let user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (user) {
      const existingMembership = await this.prisma.membership.findFirst({
        where: { tenant_id: tenantId, user_id: user.id },
      });
      if (existingMembership) {
        throw new ConflictException(`El usuario con correo '${dto.email}' ya pertenece a este restaurante.`);
      }
    }

    const webBaseUrl = this.configService.get<string>('PUBLIC_WEB_URL') || 'http://localhost:5173';
    let tempPassword: string | undefined = undefined;
    let inviteUrl: string | undefined = undefined;
    let rawToken: string | undefined = undefined;

    if (dto.delivery_mode === 'TEMPORARY_PASSWORD') {
      tempPassword = dto.temp_password || `TP_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const passwordHash = await argon2.hash(tempPassword);

      if (!user) {
        user = await this.prisma.user.create({
          data: {
            name: dto.name,
            email: dto.email,
            phone: dto.phone,
            password_hash: passwordHash,
            status: 'ACTIVE',
            must_change_password: true,
          },
        });
      } else {
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            password_hash: passwordHash,
            must_change_password: true,
            status: 'ACTIVE',
          },
        });
      }

      inviteUrl = `${webBaseUrl}/auth/login`;
    } else {
      // Modo WHATSAPP_INVITE_LINK con vigencia de 24 horas
      rawToken = crypto.randomBytes(24).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const dummyHash = await argon2.hash(crypto.randomBytes(16).toString('hex'));

      if (!user) {
        user = await this.prisma.user.create({
          data: {
            name: dto.name,
            email: dto.email,
            phone: dto.phone,
            password_hash: dummyHash,
            status: 'INVITED',
            must_change_password: true,
            invite_or_reset_token_hash: tokenHash,
            invite_or_reset_expires_at: expiresAt,
          },
        });
      } else {
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            status: 'INVITED',
            must_change_password: true,
            invite_or_reset_token_hash: tokenHash,
            invite_or_reset_expires_at: expiresAt,
          },
        });
      }

      inviteUrl = `${webBaseUrl}/auth/accept-invite?token=${rawToken}`;
    }

    // Crear membresía para este restaurante
    const membership = await this.prisma.membership.create({
      data: {
        tenant_id: tenantId,
        user_id: user.id,
        role_key: dto.role_key,
        branch_scope: dto.branch_scope || [],
        is_active: true,
      },
    });

    await this.auditService.record({
      tenantId,
      actorId,
      action: 'STAFF_MEMBER_CREATED',
      entityType: 'User',
      entityId: user.id,
      metadata: {
        email: user.email,
        roleKey: dto.role_key,
        deliveryMode: dto.delivery_mode,
        branchScope: dto.branch_scope,
      },
    });

    const whatsappMessage = buildStaffInviteWhatsAppMessage({
      staffName: user.name,
      restaurantName: tenant.name,
      roleName: role.name,
      inviteUrl,
      tempPassword,
    });

    const whatsappInviteUrl = buildWhatsAppLink(user.phone, whatsappMessage);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        status: user.status,
        roleKey: membership.role_key,
        branchScope: membership.branch_scope,
      },
      deliveryMode: dto.delivery_mode,
      tempPassword,
      inviteUrl,
      whatsappInviteUrl,
      whatsappMessageText: whatsappMessage,
    };
  }

  /**
   * Actualiza el rol, sucursales asignadas o datos básicos de un miembro del equipo.
   */
  async updateStaff(tenantId: string, actorId: string, userId: string, dto: UpdateStaffUserDto) {
    const membership = await this.prisma.membership.findFirst({
      where: { tenant_id: tenantId, user_id: userId },
    });

    if (!membership) {
      throw new NotFoundException('Miembro del equipo no encontrado en esta organización.');
    }

    if (dto.role_key) {
      const role = await this.prisma.role.findUnique({
        where: { key: dto.role_key },
      });
      if (!role) {
        throw new BadRequestException(`El rol '${dto.role_key}' no existe.`);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.name || dto.phone || dto.status) {
        await tx.user.update({
          where: { id: userId },
          data: {
            name: dto.name,
            phone: dto.phone,
            status: dto.status,
          },
        });
      }

      if (dto.role_key || dto.branch_scope !== undefined) {
        await tx.membership.update({
          where: { id: membership.id },
          data: {
            role_key: dto.role_key ?? membership.role_key,
            branch_scope: dto.branch_scope !== undefined ? (dto.branch_scope || []) : membership.branch_scope,
          },
        });
      }
    });

    await this.auditService.record({
      tenantId,
      actorId,
      action: 'STAFF_MEMBER_UPDATED',
      entityType: 'User',
      entityId: userId,
      metadata: { ...dto },
    });

    return { message: 'Miembro del personal actualizado exitosamente.' };
  }

  /**
   * Restablece la contraseña de un empleado generando una nueva contraseña temporal y enlace para WhatsApp.
   */
  async resetStaffPassword(tenantId: string, actorId: string, userId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { tenant_id: tenantId, user_id: userId },
      include: { user: true, role: true, tenant: true },
    });

    if (!membership) {
      throw new NotFoundException('Usuario no encontrado en este restaurante.');
    }

    const tempPassword = `RESET_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const passwordHash = await argon2.hash(tempPassword);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password_hash: passwordHash,
        must_change_password: true,
      },
    });

    await this.auditService.record({
      tenantId,
      actorId,
      action: 'STAFF_PASSWORD_RESET_BY_ADMIN',
      entityType: 'User',
      entityId: userId,
    });

    const webBaseUrl = this.configService.get<string>('PUBLIC_WEB_URL') || 'http://localhost:5173';
    const whatsappMessage = buildStaffInviteWhatsAppMessage({
      staffName: membership.user.name,
      restaurantName: membership.tenant.name,
      roleName: membership.role.name,
      inviteUrl: `${webBaseUrl}/auth/login`,
      tempPassword,
    });

    const whatsappInviteUrl = buildWhatsAppLink(membership.user.phone, whatsappMessage);

    return {
      message: 'Contraseña temporal generada con éxito.',
      tempPassword,
      whatsappInviteUrl,
      whatsappMessageText: whatsappMessage,
    };
  }
}
