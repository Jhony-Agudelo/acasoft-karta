import { Injectable, NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { DIAN_FISCAL_DISCLAIMER_TEXT } from '@restaurante-saas/shared';

export interface ColombiaTime {
  dayOfWeek: number; // 0 (Domingo) - 6 (Sábado)
  timeMinutes: number; // 0 - 1439
  timeStr: string; // HH:mm
}

export function getColombiaCurrentTime(): ColombiaTime {
  const now = new Date();
  // Colombia es UTC-5 sin cambio de horario (siempre -5 horas)
  const utc5 = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  const dayOfWeek = utc5.getUTCDay();
  const hours = utc5.getUTCHours();
  const minutes = utc5.getUTCMinutes();
  const timeMinutes = hours * 60 + minutes;
  const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  return { dayOfWeek, timeMinutes, timeStr };
}

export function isScheduleAvailable(
  scheduleJson: unknown,
  currentTime: ColombiaTime = getColombiaCurrentTime(),
): boolean {
  if (!scheduleJson) return true;
  if (!Array.isArray(scheduleJson) || scheduleJson.length === 0) return true;

  return scheduleJson.some((slot: any) => {
    if (!slot) return false;
    const days: number[] = Array.isArray(slot.days)
      ? slot.days
      : typeof slot.day === 'number'
        ? [slot.day]
        : [0, 1, 2, 3, 4, 5, 6];

    if (!days.includes(currentTime.dayOfWeek)) return false;

    if (!slot.start_time || !slot.end_time) return true;

    const [sH, sM] = String(slot.start_time).split(':').map(Number);
    const [eH, eM] = String(slot.end_time).split(':').map(Number);
    const startMinutes = (sH ?? 0) * 60 + (sM ?? 0);
    const endMinutes = (eH ?? 0) * 60 + (eM ?? 0);

    return currentTime.timeMinutes >= startMinutes && currentTime.timeMinutes <= endMinutes;
  });
}

export function isBranchOpenNow(
  operatingHoursJson: unknown,
  currentTime: ColombiaTime = getColombiaCurrentTime(),
): boolean {
  if (!operatingHoursJson) return true;
  if (!Array.isArray(operatingHoursJson) || operatingHoursJson.length === 0) return true;

  return operatingHoursJson.some((slot: any) => {
    if (!slot) return false;
    const day = typeof slot.day === 'number' ? slot.day : slot.dayOfWeek;
    if (day !== undefined && day !== currentTime.dayOfWeek) return false;

    const openTime = slot.open || slot.start_time;
    const closeTime = slot.close || slot.end_time;

    if (!openTime || !closeTime) return true;

    const [oH, oM] = String(openTime).split(':').map(Number);
    const [cH, cM] = String(closeTime).split(':').map(Number);
    const openMinutes = (oH ?? 0) * 60 + (oM ?? 0);
    const closeMinutes = (cH ?? 0) * 60 + (cM ?? 0);

    return currentTime.timeMinutes >= openMinutes && currentTime.timeMinutes <= closeMinutes;
  });
}

@Injectable()
export class PublicCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Obtiene la información pública de la marca y las sucursales activas de un restaurante por slug
   */
  async getRestaurantBranches(restaurantSlug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: restaurantSlug },
      include: {
        brand_settings: true,
      },
    });

    if (!tenant || tenant.status !== 'ACTIVE') {
      throw new NotFoundException({
        errorCode: 'RESTAURANT_NOT_FOUND',
        message: `El restaurante con slug '${restaurantSlug}' no existe o no está activo.`,
      });
    }

    const branches = await this.prisma.branch.findMany({
      where: { tenant_id: tenant.id, status: 'ACTIVE' },
      include: {
        channel_policies: true,
      },
      orderBy: { created_at: 'asc' },
    });

    // Módulos activos para determinar capacidades públicas
    const tenantModuleSettings = await this.prisma.tenantModuleSetting.findMany({
      where: { tenant_id: tenant.id },
    });

    const currentTime = getColombiaCurrentTime();

    const formattedBranches = branches.map((b) => {
      // Configuración de módulos a nivel de sucursal, con fallback a tenant
      const getModuleEnabled = (moduleKey: string): boolean => {
        const branchSetting = tenantModuleSettings.find(
          (s) => s.branch_id === b.id && s.module_key === moduleKey,
        );
        if (branchSetting) return branchSetting.enabled;

        const tenantSetting = tenantModuleSettings.find(
          (s) => s.branch_id === null && s.module_key === moduleKey,
        );
        return tenantSetting ? tenantSetting.enabled : false;
      };

      const isOpen = isBranchOpenNow(b.operating_hours_json, currentTime);

      // Extraer instrucciones de pago de las políticas de canal si existen
      const defaultPolicy = b.channel_policies.find((p) => p.enabled) || b.channel_policies[0];
      const paymentInstructions = defaultPolicy?.payment_instructions_json ?? null;

      return {
        id: b.id,
        name: b.name,
        slug: b.slug,
        address: b.address,
        phone: b.phone_whatsapp_e164,
        timezone: b.timezone,
        operating_hours_json: b.operating_hours_json,
        is_open_now: isOpen,
        payment_instructions_json: paymentInstructions,
        capabilities: {
          ordering: getModuleEnabled('ordering'),
          pickup: getModuleEnabled('channel.pickup'),
          delivery: getModuleEnabled('channel.delivery'),
          dine_in_qr: getModuleEnabled('channel.dine_in_qr'),
          tracking: getModuleEnabled('tracking'),
          whatsapp_click: getModuleEnabled('notifications.whatsapp_click'),
        },
      };
    });

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        brand_settings: tenant.brand_settings ?? {
          primary_color: '#B93815',
          secondary_color: '#F79009',
          cover_url: null,
          logo_url: null,
          description: null,
        },
        tax_profile_mode: tenant.tax_profile_mode,
        default_tax_type: tenant.default_tax_type,
        default_tax_rate_bp: tenant.default_tax_rate_bp,
      },
      fiscal_disclaimer: DIAN_FISCAL_DISCLAIMER_TEXT,
      branches: formattedBranches,
    };
  }

  /**
   * Obtiene el menú público activo evaluado bajo RLS y ventanas de disponibilidad
   */
  async getPublicMenu(restaurantSlug: string, branchSlug?: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: restaurantSlug },
    });

    if (!tenant || tenant.status !== 'ACTIVE') {
      throw new NotFoundException({
        errorCode: 'RESTAURANT_NOT_FOUND',
        message: `El restaurante con slug '${restaurantSlug}' no existe o no está activo.`,
      });
    }

    // Resolver sucursal objetivo
    let branch = null;
    if (branchSlug) {
      branch = await this.prisma.branch.findFirst({
        where: { tenant_id: tenant.id, slug: branchSlug, status: 'ACTIVE' },
      });
      if (!branch) {
        throw new NotFoundException({
          errorCode: 'BRANCH_NOT_FOUND',
          message: `La sucursal '${branchSlug}' no existe o no está activa en este restaurante.`,
        });
      }
    } else {
      branch = await this.prisma.branch.findFirst({
        where: { tenant_id: tenant.id, status: 'ACTIVE' },
        orderBy: { created_at: 'asc' },
      });
    }

    // Ejecutar lectura bajo RLS del tenant
    return this.prisma.withTenant(tenant.id, async (tx) => {
      // Localizar menú activo (preferir menú específico de sucursal, o menú general)
      let menu = null;
      if (branch) {
        menu = await tx.menu.findFirst({
          where: { tenant_id: tenant.id, branch_id: branch.id, status: 'ACTIVE' },
        });
      }
      if (!menu) {
        menu = await tx.menu.findFirst({
          where: { tenant_id: tenant.id, branch_id: null, status: 'ACTIVE' },
        });
      }
      if (!menu) {
        menu = await tx.menu.findFirst({
          where: { tenant_id: tenant.id, status: 'ACTIVE' },
        });
      }

      if (!menu) {
        return {
          tenant_id: tenant.id,
          restaurant_name: tenant.name,
          restaurant_slug: tenant.slug,
          branch: branch ? { id: branch.id, name: branch.name, slug: branch.slug } : null,
          fiscal_disclaimer: DIAN_FISCAL_DISCLAIMER_TEXT,
          tax_profile_mode: tenant.tax_profile_mode,
          default_tax_type: tenant.default_tax_type,
          default_tax_rate_bp: tenant.default_tax_rate_bp,
          categories: [],
        };
      }

      const categories = await tx.category.findMany({
        where: {
          tenant_id: tenant.id,
          menu_id: menu.id,
          is_active: true,
        },
        orderBy: { sort_order: 'asc' },
        include: {
          products: {
            where: {
              status: { in: ['ACTIVE', 'OUT_OF_STOCK'] }, // Excluye estrictamente ARCHIVED
            },
            orderBy: { sort_order: 'asc' },
            include: {
              variants: {
                where: { status: 'ACTIVE' },
                orderBy: { sort_order: 'asc' },
              },
              modifier_groups: {
                orderBy: { sort_order: 'asc' },
                include: {
                  group: {
                    include: {
                      options: {
                        where: { status: 'ACTIVE' },
                        orderBy: { sort_order: 'asc' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      const currentTime = getColombiaCurrentTime();

      const formattedCategories = categories.map((cat) => {
        const isCurrentlyAvailable = isScheduleAvailable(
          cat.availability_schedule_json,
          currentTime,
        );

        return {
          id: cat.id,
          name: cat.name,
          description: cat.description,
          sort_order: cat.sort_order,
          default_station_key: cat.default_station_key,
          availability_schedule_json: cat.availability_schedule_json,
          is_currently_available: isCurrentlyAvailable,
          products: cat.products.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            image_url: p.image_url,
            price_cop: p.price_cop,
            tax_type: p.tax_type,
            tax_rate_bp: p.tax_rate_bp,
            override_station_key: p.override_station_key,
            allergen_tags: p.allergen_tags,
            status: p.status,
            sort_order: p.sort_order,
            variants: p.variants.map((v) => ({
              id: v.id,
              name: v.name,
              price_cop: v.price_cop,
              status: v.status,
              sort_order: v.sort_order,
            })),
            modifier_groups: p.modifier_groups.map((pmg) => ({
              id: pmg.group.id,
              name: pmg.group.name,
              min_selections: pmg.group.min_selections,
              max_selections: pmg.group.max_selections,
              is_required: pmg.group.is_required,
              sort_order: pmg.sort_order,
              options: pmg.group.options.map((opt) => ({
                id: opt.id,
                name: opt.name,
                extra_price_cop: opt.extra_price_cop,
                status: opt.status,
                sort_order: opt.sort_order,
              })),
            })),
          })),
        };
      });

      return {
        tenant_id: tenant.id,
        restaurant_name: tenant.name,
        restaurant_slug: tenant.slug,
        branch: branch ? { id: branch.id, name: branch.name, slug: branch.slug } : null,
        fiscal_disclaimer: DIAN_FISCAL_DISCLAIMER_TEXT,
        tax_profile_mode: tenant.tax_profile_mode,
        default_tax_type: tenant.default_tax_type,
        default_tax_rate_bp: tenant.default_tax_rate_bp,
        categories: formattedCategories,
      };
    });
  }

  /**
   * Resuelve un token de código QR unificado
   */
  async resolveQrCode(qrToken: string) {
    const qr = await this.prisma.qrCodeLink.findUnique({
      where: { qr_token: qrToken },
    });

    if (!qr) {
      throw new NotFoundException({
        errorCode: 'QR_CODE_NOT_FOUND',
        message: 'Código QR no encontrado.',
      });
    }

    if (!qr.is_active) {
      throw new HttpException(
        {
          errorCode: 'QR_CODE_REVOKED',
          message: 'Este código QR ha sido revocado y ya no es válido.',
          revoked_at: qr.revoked_at,
        },
        HttpStatus.GONE,
      );
    }

    // Obtener los datos con RLS del tenant correspondiente
    return this.prisma.withTenant(qr.tenant_id, async (tx) => {
      const tenant = await tx.tenant.findUnique({
        where: { id: qr.tenant_id },
        select: { slug: true, name: true },
      });

      const branch = await tx.branch.findUnique({
        where: { id: qr.branch_id },
        select: { slug: true, name: true },
      });

      return {
        restaurant_slug: tenant?.slug || '',
        restaurant_name: tenant?.name || '',
        branch_slug: branch?.slug || '',
        branch_name: branch?.name || '',
        branch_id: qr.branch_id,
        target_type: qr.target_type,
        table_id: qr.table_id,
        label: qr.label,
      };
    });
  }
}
