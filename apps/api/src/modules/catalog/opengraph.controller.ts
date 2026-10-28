import { Controller, Get, Param, Res, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../database/prisma.service';

@Controller('r')
export class OpenGraphController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get(':restaurantSlug')
  async getRestaurantOpenGraph(
    @Param('restaurantSlug') restaurantSlug: string,
    @Res() res: Response,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: restaurantSlug },
      include: { brand_settings: true },
    });

    if (!tenant || tenant.status !== 'ACTIVE') {
      throw new NotFoundException(`Restaurante '${restaurantSlug}' no encontrado.`);
    }

    const brand = tenant.brand_settings;
    const title = `${tenant.name} | Menú Digital`;
    const description =
      brand?.description ||
      `Explora la carta digital de ${tenant.name}. Precios en vivo, opciones y pedidos rápidos.`;
    const imageUrl =
      brand?.cover_url ||
      brand?.logo_url ||
      'https://karta.co/assets/og-karta-default.jpg';

    const webBaseUrl = process.env.PUBLIC_WEB_URL || 'http://localhost:5173';
    const canonicalUrl = `${webBaseUrl}/r/${restaurantSlug}`;

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${escapeHtml(imageUrl)}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
  <meta http-equiv="refresh" content="0;url=${canonicalUrl}" />
  <script>window.location.replace("${canonicalUrl}");</script>
</head>
<body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #faf8f5;">
  <p>Cargando carta digital de <strong>${escapeHtml(tenant.name)}</strong>... <a href="${canonicalUrl}">Haz clic aquí si no redirige</a>.</p>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  }

  @Public()
  @Get(':restaurantSlug/b/:branchSlug')
  async getBranchOpenGraph(
    @Param('restaurantSlug') restaurantSlug: string,
    @Param('branchSlug') branchSlug: string,
    @Res() res: Response,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: restaurantSlug },
      include: { brand_settings: true },
    });

    if (!tenant || tenant.status !== 'ACTIVE') {
      throw new NotFoundException(`Restaurante '${restaurantSlug}' no encontrado.`);
    }

    const branch = await this.prisma.branch.findFirst({
      where: { tenant_id: tenant.id, slug: branchSlug, status: 'ACTIVE' },
    });

    if (!branch) {
      throw new NotFoundException(`Sucursal '${branchSlug}' no encontrada.`);
    }

    const brand = tenant.brand_settings;
    const title = `${tenant.name} (${branch.name}) | Menú Digital`;
    const description =
      brand?.description ||
      `Explora la carta digital de ${tenant.name} - Sede ${branch.name}. Dirección: ${branch.address || 'Bogotá'}.`;
    const imageUrl =
      brand?.cover_url ||
      brand?.logo_url ||
      'https://karta.co/assets/og-karta-default.jpg';

    const webBaseUrl = process.env.PUBLIC_WEB_URL || 'http://localhost:5173';
    const canonicalUrl = `${webBaseUrl}/r/${restaurantSlug}/b/${branchSlug}`;

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${escapeHtml(imageUrl)}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
  <meta http-equiv="refresh" content="0;url=${canonicalUrl}" />
  <script>window.location.replace("${canonicalUrl}");</script>
</head>
<body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #faf8f5;">
  <p>Cargando carta digital de <strong>${escapeHtml(tenant.name)} - Sede ${escapeHtml(branch.name)}</strong>... <a href="${canonicalUrl}">Haz clic aquí si no redirige</a>.</p>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
