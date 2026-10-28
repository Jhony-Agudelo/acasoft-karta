import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CategoryDto,
  UpdateCategoryDto,
  ProductDto,
  UpdateProductDto,
  ModifierGroupDto,
  UpdateModifierGroupDto,
} from '@restaurante-saas/shared';

@Injectable()
export class CatalogAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // 1. Menús
  // -------------------------------------------------------------------------
  async getOrCreateMainMenu(tenantId: string, branchId?: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      let menu = await tx.menu.findFirst({
        where: {
          tenant_id: tenantId,
          branch_id: branchId || null,
          status: 'ACTIVE',
        },
      });

      if (!menu) {
        menu = await tx.menu.create({
          data: {
            tenant_id: tenantId,
            branch_id: branchId || null,
            name: 'Menú Principal',
            status: 'ACTIVE',
          },
        });
      }

      return menu;
    });
  }

  // -------------------------------------------------------------------------
  // 2. Categorías
  // -------------------------------------------------------------------------
  async getCategories(tenantId: string, menuId?: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      let targetMenuId = menuId;
      if (!targetMenuId) {
        const menu = await this.getOrCreateMainMenu(tenantId);
        targetMenuId = menu.id;
      }

      return tx.category.findMany({
        where: {
          tenant_id: tenantId,
          menu_id: targetMenuId,
        },
        orderBy: { sort_order: 'asc' },
        include: {
          _count: {
            select: { products: true },
          },
        },
      });
    });
  }

  async createCategory(tenantId: string, actorId: string, dto: CategoryDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      let targetMenuId = dto.menu_id;
      if (!targetMenuId) {
        const defaultMenu = await this.getOrCreateMainMenu(tenantId);
        targetMenuId = defaultMenu.id;
      }

      const category = await tx.category.create({
        data: {
          tenant_id: tenantId,
          menu_id: targetMenuId,
          name: dto.name,
          description: dto.description || null,
          sort_order: dto.sort_order ?? 0,
          default_station_key: dto.default_station_key || null,
          availability_schedule_json: dto.availability_schedule_json as any,
          is_active: dto.is_active ?? true,
        },
      });

      await this.auditService.record({
        tenantId,
        actorId,
        action: 'CATEGORY_CREATED',
        entityType: 'Category',
        entityId: category.id,
        metadata: { name: category.name },
      });

      return category;
    });
  }

  async updateCategory(
    tenantId: string,
    actorId: string,
    categoryId: string,
    dto: UpdateCategoryDto,
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.category.findUnique({
        where: { id: categoryId },
      });

      if (!existing || existing.tenant_id !== tenantId) {
        throw new NotFoundException('Categoría no encontrada.');
      }

      const updated = await tx.category.update({
        where: { id: categoryId },
        data: {
          name: dto.name,
          description: dto.description !== undefined ? dto.description : undefined,
          sort_order: dto.sort_order,
          default_station_key: dto.default_station_key !== undefined ? dto.default_station_key : undefined,
          availability_schedule_json: dto.availability_schedule_json as any,
          is_active: dto.is_active,
        },
      });

      await this.auditService.record({
        tenantId,
        actorId,
        action: 'CATEGORY_UPDATED',
        entityType: 'Category',
        entityId: categoryId,
        metadata: { before: existing, after: updated },
      });

      return updated;
    });
  }

  async deleteCategory(tenantId: string, actorId: string, categoryId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.category.findUnique({
        where: { id: categoryId },
      });

      if (!existing || existing.tenant_id !== tenantId) {
        throw new NotFoundException('Categoría no encontrada.');
      }

      await tx.category.delete({
        where: { id: categoryId },
      });

      await this.auditService.record({
        tenantId,
        actorId,
        action: 'CATEGORY_DELETED',
        entityType: 'Category',
        entityId: categoryId,
        metadata: { name: existing.name },
      });

      return { success: true };
    });
  }

  // -------------------------------------------------------------------------
  // 3. Productos
  // -------------------------------------------------------------------------
  async getProducts(tenantId: string, categoryId?: string, status?: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const where: any = { tenant_id: tenantId };
      if (categoryId) where.category_id = categoryId;
      if (status) {
        where.status = status;
      } else {
        where.status = { not: 'ARCHIVED' };
      }

      return tx.product.findMany({
        where,
        orderBy: { sort_order: 'asc' },
        include: {
          category: {
            select: { id: true, name: true },
          },
          variants: {
            orderBy: { sort_order: 'asc' },
          },
          modifier_groups: {
            orderBy: { sort_order: 'asc' },
            include: {
              group: {
                include: {
                  options: {
                    orderBy: { sort_order: 'asc' },
                  },
                },
              },
            },
          },
        },
      });
    });
  }

  async getProductById(tenantId: string, productId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
        include: {
          category: true,
          variants: { orderBy: { sort_order: 'asc' } },
          modifier_groups: {
            orderBy: { sort_order: 'asc' },
            include: {
              group: {
                include: {
                  options: { orderBy: { sort_order: 'asc' } },
                },
              },
            },
          },
        },
      });

      if (!product || product.tenant_id !== tenantId) {
        throw new NotFoundException('Producto no encontrado.');
      }

      return product;
    });
  }

  async createProduct(tenantId: string, actorId: string, dto: ProductDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      // 1. Obtener defaults del tenant si no se envían
      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { default_tax_type: true, default_tax_rate_bp: true },
      });

      const tax_type = dto.tax_type || tenant?.default_tax_type || 'NONE';
      const tax_rate_bp = dto.tax_rate_bp ?? tenant?.default_tax_rate_bp ?? 0;

      // 2. Crear producto
      const product = await tx.product.create({
        data: {
          tenant_id: tenantId,
          category_id: dto.category_id,
          name: dto.name,
          description: dto.description || null,
          image_url: dto.image_url || null,
          price_cop: dto.price_cop,
          tax_type,
          tax_rate_bp,
          override_station_key: dto.override_station_key || null,
          allergen_tags: dto.allergen_tags || [],
          status: dto.status || 'ACTIVE',
          sort_order: dto.sort_order ?? 0,
        },
      });

      // 3. Crear variantes si aplican
      if (dto.variants && dto.variants.length > 0) {
        for (const [i, v] of dto.variants.entries()) {
          if (!v) continue;
          await tx.productVariant.create({
            data: {
              tenant_id: tenantId,
              product_id: product.id,
              name: v.name,
              price_cop: v.price_cop,
              status: v.status || 'ACTIVE',
              sort_order: v.sort_order ?? i,
            },
          });
        }
      }

      // 4. Asociar grupos de modificadores si aplican
      if (dto.modifier_group_ids && dto.modifier_group_ids.length > 0) {
        for (const [i, groupId] of dto.modifier_group_ids.entries()) {
          if (!groupId) continue;
          await tx.productModifierGroup.create({
            data: {
              product_id: product.id,
              group_id: groupId,
              sort_order: i,
            },
          });
        }
      }

      await this.auditService.record({
        tenantId,
        actorId,
        action: 'PRODUCT_CREATED',
        entityType: 'Product',
        entityId: product.id,
        metadata: { name: product.name, price_cop: product.price_cop },
      });

      return this.getProductById(tenantId, product.id);
    });
  }

  async updateProduct(
    tenantId: string,
    actorId: string,
    productId: string,
    dto: UpdateProductDto,
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.product.findUnique({
        where: { id: productId },
      });

      if (!existing || existing.tenant_id !== tenantId) {
        throw new NotFoundException('Producto no encontrado.');
      }

      const updated = await tx.product.update({
        where: { id: productId },
        data: {
          category_id: dto.category_id,
          name: dto.name,
          description: dto.description !== undefined ? dto.description : undefined,
          image_url: dto.image_url !== undefined ? dto.image_url : undefined,
          price_cop: dto.price_cop,
          tax_type: dto.tax_type,
          tax_rate_bp: dto.tax_rate_bp,
          override_station_key: dto.override_station_key !== undefined ? dto.override_station_key : undefined,
          allergen_tags: dto.allergen_tags,
          status: dto.status,
          sort_order: dto.sort_order,
        },
      });

      // Si se especifican modifier_group_ids, sincronizar
      if (dto.modifier_group_ids) {
        await tx.productModifierGroup.deleteMany({
          where: { product_id: productId },
        });

        for (const [i, groupId] of dto.modifier_group_ids.entries()) {
          if (!groupId) continue;
          await tx.productModifierGroup.create({
            data: {
              product_id: productId,
              group_id: groupId,
              sort_order: i,
            },
          });
        }
      }

      await this.auditService.record({
        tenantId,
        actorId,
        action: 'PRODUCT_UPDATED',
        entityType: 'Product',
        entityId: productId,
        metadata: { before: existing, after: updated },
      });

      return this.getProductById(tenantId, productId);
    });
  }

  async toggleProductAvailability(
    tenantId: string,
    actorId: string,
    productId: string,
    status: 'ACTIVE' | 'OUT_OF_STOCK',
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.product.findUnique({
        where: { id: productId },
      });

      if (!existing || existing.tenant_id !== tenantId) {
        throw new NotFoundException('Producto no encontrado.');
      }

      const updated = await tx.product.update({
        where: { id: productId },
        data: { status },
      });

      await this.auditService.record({
        tenantId,
        actorId,
        action: 'PRODUCT_AVAILABILITY_CHANGED',
        entityType: 'Product',
        entityId: productId,
        metadata: { beforeStatus: existing.status, afterStatus: status },
      });

      return updated;
    });
  }

  // -------------------------------------------------------------------------
  // 4. Modificadores
  // -------------------------------------------------------------------------
  async getModifierGroups(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      return tx.modifierGroup.findMany({
        where: { tenant_id: tenantId },
        orderBy: { name: 'asc' },
        include: {
          options: {
            orderBy: { sort_order: 'asc' },
          },
        },
      });
    });
  }

  async getModifierGroupById(tenantId: string, groupId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const group = await tx.modifierGroup.findUnique({
        where: { id: groupId },
        include: {
          options: { orderBy: { sort_order: 'asc' } },
        },
      });

      if (!group || group.tenant_id !== tenantId) {
        throw new NotFoundException('Grupo de modificadores no encontrado.');
      }

      return group;
    });
  }

  async createModifierGroup(tenantId: string, actorId: string, dto: ModifierGroupDto) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const group = await tx.modifierGroup.create({
        data: {
          tenant_id: tenantId,
          name: dto.name,
          min_selections: dto.min_selections ?? 0,
          max_selections: dto.max_selections ?? 1,
          is_required: dto.is_required ?? false,
          options: {
            create: (dto.options || []).map((opt, idx) => ({
              tenant_id: tenantId,
              name: opt.name,
              extra_price_cop: opt.extra_price_cop ?? 0,
              status: opt.status || 'ACTIVE',
              sort_order: opt.sort_order ?? idx,
            })),
          },
        },
        include: { options: true },
      });

      await this.auditService.record({
        tenantId,
        actorId,
        action: 'MODIFIER_GROUP_CREATED',
        entityType: 'ModifierGroup',
        entityId: group.id,
        metadata: { name: group.name, optionsCount: group.options.length },
      });

      return group;
    });
  }

  async updateModifierGroup(
    tenantId: string,
    actorId: string,
    groupId: string,
    dto: UpdateModifierGroupDto,
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.modifierGroup.findUnique({
        where: { id: groupId },
      });

      if (!existing || existing.tenant_id !== tenantId) {
        throw new NotFoundException('Grupo de modificadores no encontrado.');
      }

      const updated = await tx.modifierGroup.update({
        where: { id: groupId },
        data: {
          name: dto.name,
          min_selections: dto.min_selections,
          max_selections: dto.max_selections,
          is_required: dto.is_required,
        },
      });

      // Si se envían opciones en el payload, sincronizar
      if (dto.options) {
        await tx.modifierOption.deleteMany({
          where: { group_id: groupId },
        });

        for (const [i, opt] of dto.options.entries()) {
          if (!opt) continue;
          await tx.modifierOption.create({
            data: {
              tenant_id: tenantId,
              group_id: groupId,
              name: opt.name,
              extra_price_cop: opt.extra_price_cop ?? 0,
              status: opt.status || 'ACTIVE',
              sort_order: opt.sort_order ?? i,
            },
          });
        }
      }

      await this.auditService.record({
        tenantId,
        actorId,
        action: 'MODIFIER_GROUP_UPDATED',
        entityType: 'ModifierGroup',
        entityId: groupId,
        metadata: { before: existing, after: updated },
      });

      return this.getModifierGroupById(tenantId, groupId);
    });
  }

  async deleteModifierGroup(tenantId: string, actorId: string, groupId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.modifierGroup.findUnique({
        where: { id: groupId },
      });

      if (!existing || existing.tenant_id !== tenantId) {
        throw new NotFoundException('Grupo de modificadores no encontrado.');
      }

      await tx.modifierGroup.delete({
        where: { id: groupId },
      });

      await this.auditService.record({
        tenantId,
        actorId,
        action: 'MODIFIER_GROUP_DELETED',
        entityType: 'ModifierGroup',
        entityId: groupId,
        metadata: { name: existing.name },
      });

      return { success: true };
    });
  }

  async toggleModifierOptionAvailability(
    tenantId: string,
    actorId: string,
    optionId: string,
    status: 'ACTIVE' | 'OUT_OF_STOCK',
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const option = await tx.modifierOption.findUnique({
        where: { id: optionId },
      });

      if (!option || option.tenant_id !== tenantId) {
        throw new NotFoundException('Opción no encontrada.');
      }

      const updated = await tx.modifierOption.update({
        where: { id: optionId },
        data: { status },
      });

      await this.auditService.record({
        tenantId,
        actorId,
        action: 'MODIFIER_OPTION_AVAILABILITY_CHANGED',
        entityType: 'ModifierOption',
        entityId: optionId,
        metadata: { name: option.name, beforeStatus: option.status, afterStatus: status },
      });

      return updated;
    });
  }
}
