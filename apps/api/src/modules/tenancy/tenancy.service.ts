import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  UpdateBrandSettingsDto,
  BranchChannelPolicyDto,
} from '@restaurante-saas/shared';

@Injectable()
export class TenancyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Obtiene la configuración de marca del restaurante.
   */
  async getBrand(tenantId: string) {
    const brand = await this.prisma.brandSettings.findUnique({
      where: { tenant_id: tenantId },
    });
    if (!brand) {
      throw new NotFoundException('Configuración de marca no encontrada.');
    }
    return brand;
  }

  /**
   * Actualiza logo, colores primario/secundario y descripción de la marca.
   */
  async updateBrand(tenantId: string, actorId: string, dto: UpdateBrandSettingsDto) {
    const updated = await this.prisma.brandSettings.upsert({
      where: { tenant_id: tenantId },
      update: { ...dto },
      create: {
        tenant_id: tenantId,
        ...dto,
      },
    });

    await this.auditService.record({
      tenantId,
      actorId,
      action: 'BRAND_SETTINGS_UPDATED',
      entityType: 'BrandSettings',
      entityId: tenantId,
      metadata: { ...dto },
    });

    return updated;
  }

  /**
   * Lista las sucursales del restaurante respetando el alcance (branch_scope) del usuario operativo.
   */
  async listBranches(tenantId: string, user?: { roleKey?: string; branchScope?: string[] }) {
    if (
      user &&
      user.roleKey !== 'TENANT_ADMIN' &&
      user.roleKey !== 'PLATFORM_ADMIN' &&
      Array.isArray(user.branchScope) &&
      user.branchScope.length > 0
    ) {
      return this.prisma.branch.findMany({
        where: {
          tenant_id: tenantId,
          id: { in: user.branchScope },
        },
        orderBy: { created_at: 'asc' },
      });
    }

    return this.prisma.branch.findMany({
      where: { tenant_id: tenantId },
      orderBy: { created_at: 'asc' },
    });
  }

  /**
   * Obtiene el detalle de una sucursal específica.
   */
  async getBranch(tenantId: string, branchId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenant_id: tenantId },
      include: { channel_policies: true },
    });
    if (!branch) {
      throw new NotFoundException('Sucursal no encontrada.');
    }
    return branch;
  }

  /**
   * Crea una nueva sucursal y genera sus políticas de canal por defecto.
   */
  async createBranch(
    tenantId: string,
    actorId: string,
    dto: {
      name: string;
      slug: string;
      address: string;
      phone_whatsapp_e164: string;
      timezone?: string;
      operating_hours_json?: any;
    },
  ) {
    const existing = await this.prisma.branch.findUnique({
      where: {
        tenant_id_slug: {
          tenant_id: tenantId,
          slug: dto.slug,
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Ya existe una sucursal con el slug '${dto.slug}'.`);
    }

    const branch = await this.prisma.$transaction(async (tx) => {
      const newBranch = await tx.branch.create({
        data: {
          tenant_id: tenantId,
          name: dto.name,
          slug: dto.slug,
          address: dto.address,
          phone_whatsapp_e164: dto.phone_whatsapp_e164,
          timezone: dto.timezone || 'America/Bogota',
          operating_hours_json: dto.operating_hours_json || [],
        },
      });

      // Crear políticas de canal iniciales
      const channels = [
        { fulfillment_type: 'PICKUP', payment_policy: 'NONE', enabled: true },
        { fulfillment_type: 'DELIVERY', payment_policy: 'NONE', enabled: true },
        { fulfillment_type: 'DINE_IN', payment_policy: 'OFFLINE_ONLY', enabled: false },
      ];

      for (const ch of channels) {
        await tx.branchChannelPolicy.create({
          data: {
            tenant_id: tenantId,
            branch_id: newBranch.id,
            fulfillment_type: ch.fulfillment_type,
            payment_policy: ch.payment_policy,
            require_payment_before_preparation: false,
            enabled: ch.enabled,
            whatsapp_number_e164: dto.phone_whatsapp_e164,
          },
        });
      }

      return newBranch;
    });

    await this.auditService.record({
      tenantId,
      branchId: branch.id,
      actorId,
      action: 'BRANCH_CREATED',
      entityType: 'Branch',
      entityId: branch.id,
      metadata: { name: branch.name, slug: branch.slug },
    });

    return branch;
  }

  /**
   * Actualiza datos de una sucursal.
   */
  async updateBranch(
    tenantId: string,
    actorId: string,
    branchId: string,
    dto: {
      name?: string;
      address?: string;
      phone_whatsapp_e164?: string;
      timezone?: string;
      operating_hours_json?: any;
      status?: string;
    },
  ) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenant_id: tenantId },
    });
    if (!branch) {
      throw new NotFoundException('Sucursal no encontrada.');
    }

    const updated = await this.prisma.branch.update({
      where: { id: branchId },
      data: { ...dto },
    });

    await this.auditService.record({
      tenantId,
      branchId,
      actorId,
      action: 'BRANCH_UPDATED',
      entityType: 'Branch',
      entityId: branchId,
      metadata: { ...dto },
    });

    return updated;
  }

  /**
   * Consulta las políticas de canal de una sucursal.
   */
  async getChannelPolicies(tenantId: string, branchId: string) {
    return this.prisma.branchChannelPolicy.findMany({
      where: { tenant_id: tenantId, branch_id: branchId },
    });
  }

  /**
   * Actualiza la política de un canal específico para una sucursal.
   * Reglas de Oro (TC-01-I02, Sección 2.3 y 4.8):
   * 1. DINE_IN es siempre OFFLINE_ONLY y require_payment_before_preparation es false.
   * 2. Si un canal pasa a payment_policy = 'NONE', se fuerza automáticamente require_payment_before_preparation = false.
   * 3. require_payment_before_preparation solo puede ser true con payment_policy = 'OFFLINE_ONLY' en PICKUP o DELIVERY.
   */
  async updateChannelPolicy(
    tenantId: string,
    actorId: string,
    branchId: string,
    fulfillmentType: string,
    dto: Partial<BranchChannelPolicyDto>,
  ) {
    const current = await this.prisma.branchChannelPolicy.findUnique({
      where: {
        tenant_id_branch_id_fulfillment_type: {
          tenant_id: tenantId,
          branch_id: branchId,
          fulfillment_type: fulfillmentType,
        },
      },
    });

    if (!current) {
      throw new NotFoundException(`Política de canal '${fulfillmentType}' no encontrada para esta sucursal.`);
    }

    let finalPaymentPolicy = dto.payment_policy ?? current.payment_policy;
    let finalRequirePayment =
      dto.require_payment_before_preparation ?? current.require_payment_before_preparation;

    // Regla 1: DINE_IN
    if (fulfillmentType === 'DINE_IN') {
      finalPaymentPolicy = 'OFFLINE_ONLY';
      finalRequirePayment = false;
    }

    // Regla 2: Reinicio automático al bajar a NONE
    if (finalPaymentPolicy === 'NONE') {
      finalRequirePayment = false;
    }

    // Regla 3: Si se intenta activar require_payment_before_preparation con NONE
    if (finalRequirePayment && finalPaymentPolicy === 'NONE') {
      throw new BadRequestException(
        "No se puede activar 'require_payment_before_preparation = true' cuando la política de cobro es 'NONE'.",
      );
    }

    const updated = await this.prisma.branchChannelPolicy.update({
      where: { id: current.id },
      data: {
        enabled: dto.enabled ?? current.enabled,
        payment_policy: finalPaymentPolicy,
        require_payment_before_preparation: finalRequirePayment,
        payment_instructions_json:
          dto.payment_instructions_json !== undefined
            ? (dto.payment_instructions_json as any)
            : current.payment_instructions_json,
        whatsapp_number_e164: dto.whatsapp_number_e164 ?? current.whatsapp_number_e164,
        require_table_pin: dto.require_table_pin ?? current.require_table_pin,
        unprocessed_expiry_minutes:
          dto.unprocessed_expiry_minutes ?? current.unprocessed_expiry_minutes,
      },
    });

    await this.auditService.record({
      tenantId,
      branchId,
      actorId,
      action: 'CHANNEL_POLICY_UPDATED',
      entityType: 'BranchChannelPolicy',
      entityId: updated.id,
      metadata: {
        fulfillmentType,
        before: {
          payment_policy: current.payment_policy,
          require_payment_before_preparation: current.require_payment_before_preparation,
        },
        after: {
          payment_policy: updated.payment_policy,
          require_payment_before_preparation: updated.require_payment_before_preparation,
        },
      },
    });

    return updated;
  }
}
