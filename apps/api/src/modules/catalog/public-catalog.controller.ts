import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PublicCatalogService } from './public-catalog.service';

@Controller('public')
export class PublicCatalogController {
  constructor(private readonly publicCatalogService: PublicCatalogService) {}

  /**
   * Resuelve un código QR opaco a partir de su token único
   * GET /api/v1/public/qr/:qrToken
   */
  @Public()
  @Get('qr/:qrToken')
  async resolveQrCode(@Param('qrToken') qrToken: string) {
    return this.publicCatalogService.resolveQrCode(qrToken);
  }

  /**
   * Retorna la información pública de marca y sucursales de un restaurante
   * GET /api/v1/public/:restaurantSlug/branches
   */
  @Public()
  @Get(':restaurantSlug/branches')
  async getRestaurantBranches(@Param('restaurantSlug') restaurantSlug: string) {
    return this.publicCatalogService.getRestaurantBranches(restaurantSlug);
  }

  /**
   * Retorna el menú público activo evaluado bajo RLS y horarios de disponibilidad
   * GET /api/v1/public/:restaurantSlug/menu?branchSlug=...
   */
  @Public()
  @Get(':restaurantSlug/menu')
  async getPublicMenu(
    @Param('restaurantSlug') restaurantSlug: string,
    @Query('branchSlug') branchSlug?: string,
  ) {
    return this.publicCatalogService.getPublicMenu(restaurantSlug, branchSlug);
  }
}
