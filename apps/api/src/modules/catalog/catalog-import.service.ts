import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BulkProductImportDto } from '@restaurante-saas/shared';

@Injectable()
export class CatalogImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async importProductsBulk(
    tenantId: string,
    actorId: string,
    dto: BulkProductImportDto,
  ) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('El lote de importación no contiene productos.');
    }

    if (dto.items.length > 300) {
      throw new BadRequestException('El límite máximo por lote es de 300 productos.');
    }

    return this.prisma.withTenant(tenantId, async (tx) => {
      // 1. Obtener o crear menú principal activo
      let menu = await tx.menu.findFirst({
        where: { tenant_id: tenantId, status: 'ACTIVE' },
      });

      if (!menu) {
        menu = await tx.menu.create({
          data: {
            tenant_id: tenantId,
            name: 'Menú Principal',
            status: 'ACTIVE',
          },
        });
      }

      // 2. Obtener defaults de impuestos del tenant
      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { default_tax_type: true, default_tax_rate_bp: true },
      });

      const defaultTaxType = tenant?.default_tax_type || 'NONE';
      const defaultTaxRateBp = tenant?.default_tax_rate_bp ?? 0;

      // 3. Obtener categorías existentes
      const existingCategories = await tx.category.findMany({
        where: { tenant_id: tenantId, menu_id: menu.id },
      });

      const categoryMap = new Map<string, string>(); // nameLower -> id
      for (const cat of existingCategories) {
        categoryMap.set(cat.name.trim().toLowerCase(), cat.id);
      }

      let createdCategoriesCount = 0;
      let createdProductsCount = 0;

      // 4. Crear categorías faltantes
      for (const item of dto.items) {
        const catNameTrimmed = item.category_name.trim();
        const catKey = catNameTrimmed.toLowerCase();

        if (!categoryMap.has(catKey)) {
          const newCat = await tx.category.create({
            data: {
              tenant_id: tenantId,
              menu_id: menu.id,
              name: catNameTrimmed,
              sort_order: existingCategories.length + createdCategoriesCount,
              is_active: true,
            },
          });
          categoryMap.set(catKey, newCat.id);
          createdCategoriesCount++;
        }
      }

      // 5. Insertar productos en bloque
      for (const item of dto.items) {
        const catKey = item.category_name.trim().toLowerCase();
        const categoryId = categoryMap.get(catKey)!;

        await tx.product.create({
          data: {
            tenant_id: tenantId,
            category_id: categoryId,
            name: item.product_name.trim(),
            description: item.description?.trim() || null,
            price_cop: Math.round(item.price_cop),
            tax_type: defaultTaxType,
            tax_rate_bp: defaultTaxRateBp,
            allergen_tags: item.allergen_tags || [],
            status: 'ACTIVE',
          },
        });
        createdProductsCount++;
      }

      // 6. Auditoría inmutable de importación
      await this.auditService.record({
        tenantId,
        actorId,
        action: 'CATALOG_BULK_IMPORTED',
        entityType: 'Menu',
        entityId: menu.id,
        metadata: {
          created_categories_count: createdCategoriesCount,
          created_products_count: createdProductsCount,
          total_imported: dto.items.length,
        },
      });

      return {
        success: true,
        created_categories_count: createdCategoriesCount,
        created_products_count: createdProductsCount,
        total_imported: dto.items.length,
      };
    });
  }
}
