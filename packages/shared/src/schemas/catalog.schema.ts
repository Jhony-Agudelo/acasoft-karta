import { z } from 'zod';

/**
 * Esquemas Zod para Catálogo, Perfiles Tributarios y Códigos QR
 * Alineado con DEFINICION_TECNICA.md (v2.4.0) y FASE_02_CATALOGO_IMPUESTOS_Y_VITRINA.md
 */

import { TaxProfileMode, TaxType } from '../utils/money-cop';

// ---------------------------------------------------------------------------
// 1. Configuración de Perfil Tributario (Tenant / Sucursal)
// ---------------------------------------------------------------------------
export const TaxProfileModeSchema = z.enum([
  'FINAL_PRICE_NO_BREAKDOWN',
  'TAX_INCLUDED_DISCRIMINATED',
  'BASE_PLUS_TAX',
]);

export const TaxTypeSchema = z.enum(['NONE', 'INC', 'IVA', 'EXEMPT']);

export const TaxProfileConfigSchema = z
  .object({
    tax_profile_mode: TaxProfileModeSchema,
    default_tax_type: TaxTypeSchema,
    default_tax_rate_bp: z
      .number()
      .int({ message: 'La tasa de impuesto debe ser un número entero en puntos básicos (bp).' })
      .min(0, { message: 'La tasa en puntos básicos no puede ser negativa.' }),
  })
  .superRefine((data, ctx) => {
    // Si el modo exige discriminación o suma de impuestos (INC o IVA), la tasa no puede ser cero
    if (
      (data.tax_profile_mode === 'TAX_INCLUDED_DISCRIMINATED' ||
        data.tax_profile_mode === 'BASE_PLUS_TAX') &&
      (data.default_tax_type === 'INC' || data.default_tax_type === 'IVA')
    ) {
      if (data.default_tax_rate_bp <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['default_tax_rate_bp'],
          message: `El modo ${data.tax_profile_mode} con impuesto ${data.default_tax_type} requiere una tasa mayor a 0 bp (ej: 800 para INC 8% o 1900 para IVA 19%).`,
        });
      }
    }

    // Si el tipo es NONE o EXEMPT, la tasa debe ser estrictamente cero
    if (data.default_tax_type === 'NONE' || data.default_tax_type === 'EXEMPT') {
      if (data.default_tax_rate_bp > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['default_tax_rate_bp'],
          message: `Para productos con tipo de impuesto ${data.default_tax_type}, la tasa en puntos básicos debe ser 0.`,
        });
      }
    }
  });

export type TaxProfileConfigDto = z.infer<typeof TaxProfileConfigSchema>;

// ---------------------------------------------------------------------------
// 2. Horarios de Disponibilidad de Categoría
// ---------------------------------------------------------------------------
export const CategoryScheduleWindowSchema = z.object({
  day_of_week: z.number().int().min(0).max(6), // 0: Domingo, 1: Lunes, ..., 6: Sábado
  start_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'start_time debe tener formato HH:mm (24h)',
  }),
  end_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'end_time debe tener formato HH:mm (24h)',
  }),
});
export type CategoryScheduleWindow = z.infer<typeof CategoryScheduleWindowSchema>;

// ---------------------------------------------------------------------------
// 3. Categorías
// ---------------------------------------------------------------------------
export const CategorySchema = z.object({
  menu_id: z.string().uuid().optional(),
  name: z.string().min(1, 'El nombre de la categoría es requerido').max(100),
  description: z.string().max(500).optional().nullable(),
  sort_order: z.number().int().default(0),
  default_station_key: z.string().max(50).optional().nullable(),
  availability_schedule_json: z.array(CategoryScheduleWindowSchema).optional().nullable(),
  is_active: z.boolean().default(true),
});
export type CategoryDto = z.infer<typeof CategorySchema>;

export const UpdateCategorySchema = CategorySchema.partial();
export type UpdateCategoryDto = z.infer<typeof UpdateCategorySchema>;

// ---------------------------------------------------------------------------
// 4. Modificadores (Opciones y Grupos)
// ---------------------------------------------------------------------------
export const ModifierOptionStatusSchema = z.enum(['ACTIVE', 'OUT_OF_STOCK']);
export type ModifierOptionStatus = z.infer<typeof ModifierOptionStatusSchema>;

export const ModifierOptionSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'El nombre de la opción es requerido').max(100),
  extra_price_cop: z
    .number()
    .int('El precio adicional debe ser entero en COP')
    .min(0, 'El precio adicional no puede ser negativo')
    .default(0),
  status: ModifierOptionStatusSchema.default('ACTIVE'),
  sort_order: z.number().int().default(0),
});
export type ModifierOptionDto = z.infer<typeof ModifierOptionSchema>;

export const BaseModifierGroupSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'El nombre del grupo de modificadores es requerido').max(100),
  min_selections: z
    .number()
    .int()
    .min(0, 'min_selections no puede ser negativo')
    .default(0),
  max_selections: z
    .number()
    .int()
    .min(1, 'max_selections debe ser al menos 1')
    .default(1),
  is_required: z.boolean().default(false),
  options: z.array(ModifierOptionSchema).default([]),
});

export const ModifierGroupSchema = BaseModifierGroupSchema.superRefine((data, ctx) => {
  if (data.min_selections > data.max_selections) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['min_selections'],
      message: 'min_selections no puede ser mayor que max_selections.',
    });
  }
  if (data.is_required && data.min_selections < 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['min_selections'],
      message: 'Si el grupo es obligatorio (is_required: true), min_selections debe ser al menos 1.',
    });
  }
});
export type ModifierGroupDto = z.infer<typeof ModifierGroupSchema>;

export const UpdateModifierGroupSchema = BaseModifierGroupSchema.partial();
export type UpdateModifierGroupDto = z.infer<typeof UpdateModifierGroupSchema>;

// ---------------------------------------------------------------------------
// 5. Variantes de Producto
// ---------------------------------------------------------------------------
export const ProductVariantStatusSchema = z.enum(['ACTIVE', 'OUT_OF_STOCK']);
export type ProductVariantStatus = z.infer<typeof ProductVariantStatusSchema>;

export const ProductVariantSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'El nombre de la variante es requerido').max(100),
  price_cop: z
    .number()
    .int('El precio de la variante debe ser un entero en COP')
    .min(0, 'El precio no puede ser negativo'),
  status: ProductVariantStatusSchema.default('ACTIVE'),
  sort_order: z.number().int().default(0),
});
export type ProductVariantDto = z.infer<typeof ProductVariantSchema>;

// ---------------------------------------------------------------------------
// 6. Productos
// ---------------------------------------------------------------------------
export const ProductStatusSchema = z.enum(['ACTIVE', 'OUT_OF_STOCK', 'ARCHIVED']);
export type ProductStatus = z.infer<typeof ProductStatusSchema>;

export const ProductSchema = z.object({
  category_id: z.string().uuid('category_id debe ser un UUID válido'),
  name: z.string().min(1, 'El nombre del producto es requerido').max(150),
  description: z.string().max(1000).optional().nullable(),
  image_url: z.string().url('image_url debe ser una URL válida').optional().nullable(),
  price_cop: z
    .number()
    .int('El precio debe ser un número entero en pesos colombianos')
    .min(0, 'El precio no puede ser negativo'),
  tax_type: TaxTypeSchema.optional(),
  tax_rate_bp: z.number().int().min(0).optional(),
  override_station_key: z.string().max(50).optional().nullable(),
  allergen_tags: z.array(z.string()).default([]),
  status: ProductStatusSchema.default('ACTIVE'),
  sort_order: z.number().int().default(0),
  variants: z.array(ProductVariantSchema).optional(),
  modifier_group_ids: z.array(z.string().uuid()).optional(),
});
export type ProductDto = z.infer<typeof ProductSchema>;

export const UpdateProductSchema = ProductSchema.partial();
export type UpdateProductDto = z.infer<typeof UpdateProductSchema>;

export const UpdateProductAvailabilitySchema = z.object({
  status: z.enum(['ACTIVE', 'OUT_OF_STOCK']),
});
export type UpdateProductAvailabilityDto = z.infer<typeof UpdateProductAvailabilitySchema>;

// ---------------------------------------------------------------------------
// 7. Importación Rápida Masiva (CSV / Pegado de Tabla)
// ---------------------------------------------------------------------------
export const BulkProductItemSchema = z.object({
  category_name: z.string().min(1, 'Nombre de categoría requerido').max(100),
  product_name: z.string().min(1, 'Nombre de producto requerido').max(150),
  price_cop: z.coerce
    .number()
    .int('El precio debe ser entero en COP')
    .min(0, 'El precio no puede ser negativo'),
  description: z.string().max(1000).optional().nullable(),
  allergen_tags: z
    .union([z.array(z.string()), z.string()])
    .optional()
    .transform((val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      return val
        .split(',')
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean);
    }),
});
export type BulkProductItemDto = z.infer<typeof BulkProductItemSchema>;

export const BulkProductImportSchema = z.object({
  items: z
    .array(BulkProductItemSchema)
    .min(1, 'Debe incluir al menos un producto')
    .max(300, 'El límite por lote es de 300 productos'),
});
export type BulkProductImportDto = z.infer<typeof BulkProductImportSchema>;

// ---------------------------------------------------------------------------
// 8. Códigos QR Opacos y Revocables (QrCodeLink)
// ---------------------------------------------------------------------------
export const QrTargetTypeSchema = z.enum([
  'GENERAL_MENU',
  'BRANCH_MENU',
  'DINING_TABLE',
]);
export type QrTargetType = z.infer<typeof QrTargetTypeSchema>;

export const CreateQrCodeLinkSchema = z
  .object({
    branch_id: z.string().uuid().optional(),
    target_type: QrTargetTypeSchema,
    table_id: z.string().uuid().optional().nullable(),
    label: z.string().min(1, 'La etiqueta es requerida').max(100),
  })
  .superRefine((data, ctx) => {
    if (data.target_type === 'DINING_TABLE' && !data.table_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['table_id'],
        message: 'table_id es obligatorio cuando target_type es DINING_TABLE.',
      });
    }
  });
export type CreateQrCodeLinkDto = z.infer<typeof CreateQrCodeLinkSchema>;
