import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UsePipes,
} from '@nestjs/common';
import { CatalogAdminService } from './catalog-admin.service';
import { CurrentUser, AuthenticatedUserPayload } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CategorySchema,
  CategoryDto,
  UpdateCategorySchema,
  UpdateCategoryDto,
  ProductSchema,
  ProductDto,
  UpdateProductSchema,
  UpdateProductDto,
  UpdateProductAvailabilitySchema,
  UpdateProductAvailabilityDto,
  ModifierGroupSchema,
  ModifierGroupDto,
  UpdateModifierGroupSchema,
  UpdateModifierGroupDto,
} from '@restaurante-saas/shared';

@Controller('admin')
export class CatalogAdminController {
  constructor(private readonly catalogAdminService: CatalogAdminService) {}

  // -------------------------------------------------------------------------
  // 1. Categorías
  // -------------------------------------------------------------------------
  @Get('categories')
  @RequirePermissions('catalog:read')
  async getCategories(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Query('menuId') menuId?: string,
  ) {
    return this.catalogAdminService.getCategories(user.tenantId, menuId);
  }

  @Post('categories')
  @RequirePermissions('catalog:manage')
  @UsePipes(new ZodValidationPipe(CategorySchema))
  async createCategory(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: CategoryDto,
  ) {
    return this.catalogAdminService.createCategory(user.tenantId, user.id, dto);
  }

  @Patch('categories/:id')
  @RequirePermissions('catalog:manage')
  @UsePipes(new ZodValidationPipe(UpdateCategorySchema))
  async updateCategory(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.catalogAdminService.updateCategory(user.tenantId, user.id, id, dto);
  }

  @Delete('categories/:id')
  @RequirePermissions('catalog:manage')
  async deleteCategory(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.catalogAdminService.deleteCategory(user.tenantId, user.id, id);
  }

  // -------------------------------------------------------------------------
  // 2. Productos
  // -------------------------------------------------------------------------
  @Get('products')
  @RequirePermissions('catalog:read')
  async getProducts(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Query('categoryId') categoryId?: string,
    @Query('status') status?: string,
  ) {
    return this.catalogAdminService.getProducts(user.tenantId, categoryId, status);
  }

  @Get('products/:id')
  @RequirePermissions('catalog:read')
  async getProductById(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.catalogAdminService.getProductById(user.tenantId, id);
  }

  @Post('products')
  @RequirePermissions('catalog:manage')
  @UsePipes(new ZodValidationPipe(ProductSchema))
  async createProduct(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: ProductDto,
  ) {
    return this.catalogAdminService.createProduct(user.tenantId, user.id, dto);
  }

  @Patch('products/:id')
  @RequirePermissions('catalog:manage')
  @UsePipes(new ZodValidationPipe(UpdateProductSchema))
  async updateProduct(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.catalogAdminService.updateProduct(user.tenantId, user.id, id, dto);
  }

  @Patch('products/:id/availability')
  @RequirePermissions('catalog:manage')
  @UsePipes(new ZodValidationPipe(UpdateProductAvailabilitySchema))
  async toggleProductAvailability(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateProductAvailabilityDto,
  ) {
    return this.catalogAdminService.toggleProductAvailability(
      user.tenantId,
      user.id,
      id,
      dto.status,
    );
  }

  // -------------------------------------------------------------------------
  // 3. Modificadores
  // -------------------------------------------------------------------------
  @Get('modifier-groups')
  @RequirePermissions('catalog:read')
  async getModifierGroups(@CurrentUser() user: AuthenticatedUserPayload) {
    return this.catalogAdminService.getModifierGroups(user.tenantId);
  }

  @Get('modifier-groups/:id')
  @RequirePermissions('catalog:read')
  async getModifierGroupById(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.catalogAdminService.getModifierGroupById(user.tenantId, id);
  }

  @Post('modifier-groups')
  @RequirePermissions('catalog:manage')
  @UsePipes(new ZodValidationPipe(ModifierGroupSchema))
  async createModifierGroup(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Body() dto: ModifierGroupDto,
  ) {
    return this.catalogAdminService.createModifierGroup(user.tenantId, user.id, dto);
  }

  @Patch('modifier-groups/:id')
  @RequirePermissions('catalog:manage')
  @UsePipes(new ZodValidationPipe(UpdateModifierGroupSchema))
  async updateModifierGroup(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateModifierGroupDto,
  ) {
    return this.catalogAdminService.updateModifierGroup(user.tenantId, user.id, id, dto);
  }

  @Delete('modifier-groups/:id')
  @RequirePermissions('catalog:manage')
  async deleteModifierGroup(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
  ) {
    return this.catalogAdminService.deleteModifierGroup(user.tenantId, user.id, id);
  }

  @Patch('modifier-options/:id/availability')
  @RequirePermissions('catalog:manage')
  @UsePipes(new ZodValidationPipe(UpdateProductAvailabilitySchema))
  async toggleModifierOptionAvailability(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateProductAvailabilityDto,
  ) {
    return this.catalogAdminService.toggleModifierOptionAvailability(
      user.tenantId,
      user.id,
      id,
      dto.status,
    );
  }
}
