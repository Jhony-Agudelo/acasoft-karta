import {
  Controller,
  Post,
  Get,
  Sse,
  Body,
  Headers,
  Param,
  UsePipes,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  GoneException,
  MessageEvent,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Public } from '../../common/decorators/public.decorator';
import { CreatePublicOrderService } from './create-public-order.service';
import { PrismaService } from '../../database/prisma.service';
import { SseStreamService } from '../notifications/sse-stream.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CreatePublicOrderSchema,
  CreatePublicOrderDto,
  DIAN_FISCAL_DISCLAIMER_TEXT,
  maskCustomerSnapshot,
} from '@restaurante-saas/shared';

@Controller('public/orders')
export class PublicOrderController {
  constructor(
    private readonly orderService: CreatePublicOrderService,
    private readonly prisma: PrismaService,
    private readonly sseStream: SseStreamService,
  ) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe(CreatePublicOrderSchema))
  async createPublicOrder(
    @Headers('idempotency-key') idempotencyKeyHeader: string,
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Body() dto: CreatePublicOrderDto,
  ) {
    if (!idempotencyKeyHeader) {
      throw new BadRequestException({
        errorCode: 'INVALID_IDEMPOTENCY_KEY',
        message: 'La cabecera Idempotency-Key es obligatoria (16 a 64 caracteres).',
      });
    }

    let tenantId = tenantIdHeader;
    if (!tenantId) {
      const branch = await this.prisma.branch.findUnique({
        where: { id: dto.branch_id },
        select: { tenant_id: true },
      });

      if (!branch) {
        throw new NotFoundException({
          errorCode: 'BRANCH_NOT_FOUND',
          message: 'Sucursal no encontrada.',
        });
      }
      tenantId = branch.tenant_id;
    }

    return this.orderService.createPublicOrder(tenantId, idempotencyKeyHeader, dto);
  }

  /**
   * Ruta compatible previa: GET /api/v1/public/orders/track/:publicToken
   */
  @Public()
  @Get('track/:publicToken')
  async trackOrderByTokenAlias(@Param('publicToken') publicToken: string) {
    return this.getPublicOrderTracking(publicToken);
  }

  /**
   * Stream reactivo Server-Sent Events (SSE) público para el comensal en vivo.
   * GET /api/v1/public/orders/:publicOrderToken/events
   */
  @Public()
  @Sse(':publicOrderToken/events')
  async streamTrackingEvents(
    @Param('publicOrderToken') publicOrderToken: string,
  ): Promise<Observable<MessageEvent>> {
    const order = await (this.prisma as any).order.findUnique({
      where: { public_token: publicOrderToken },
      select: { id: true, public_token_expires_at: true },
    });

    if (!order) {
      throw new NotFoundException({
        errorCode: 'ORDER_NOT_FOUND',
        message: 'Pedido no encontrado.',
      });
    }

    if (order.public_token_expires_at && new Date(order.public_token_expires_at) < new Date()) {
      throw new GoneException({
        errorCode: 'TRACKING_LINK_EXPIRED',
        message: 'El enlace de seguimiento ha expirado (24 horas tras finalizar el pedido).',
      });
    }

    return this.sseStream.subscribeToTracking(publicOrderToken) as Observable<MessageEvent>;
  }

  /**
   * Consulta pública de seguimiento de pedido mediante su token opaco de 256 bits.
   * GET /api/v1/public/orders/:publicOrderToken
   */
  @Public()
  @Get(':publicOrderToken')
  async getPublicOrderTracking(@Param('publicOrderToken') publicOrderToken: string) {
    const order = await (this.prisma as any).order.findUnique({
      where: { public_token: publicOrderToken },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
            phone_whatsapp_e164: true,
          },
        },
        items: true,
        edits: {
          select: { id: true, occurred_at: true, reason: true },
        },
        status_events: {
          where: { visible_to_customer: true },
          orderBy: { occurred_at: 'asc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundException({
        errorCode: 'ORDER_NOT_FOUND',
        message: 'Pedido no encontrado.',
      });
    }

    // Verificar si el token ya expiró a las 24 horas
    if (order.public_token_expires_at && new Date(order.public_token_expires_at) < new Date()) {
      throw new GoneException({
        errorCode: 'TRACKING_LINK_EXPIRED',
        message: 'El enlace de seguimiento ha expirado (24 horas tras finalizar el pedido).',
      });
    }

    // Verificar si el módulo 'tracking' está habilitado en el restaurante
    const trackingSetting = await (this.prisma as any).tenantModuleSetting.findFirst({
      where: { tenant_id: order.tenant_id, module_key: 'tracking' },
    });
    const trackingEnabled = trackingSetting ? trackingSetting.enabled : true;

    // Enmascarar snapshot de cliente para cumplimiento de Ley 1581
    const maskedCustomer = maskCustomerSnapshot(order.customer_snapshot_json as any);
    const wasAdjusted = (order.edits?.length || 0) > 0;

    return {
      order_id: order.id,
      order_code: order.order_code,
      origin: order.origin,
      fulfillment_type: order.fulfillment_type,
      status: order.status,
      payment_policy: order.payment_policy,
      payment_status: order.payment_status,
      subtotal_products_cop: order.subtotal_products_cop,
      delivery_fee_cop: order.delivery_fee_cop,
      tax_total_cop: order.tax_total_cop,
      grand_total_cop: order.grand_total_cop,
      paid_total_cop: order.paid_total_cop,
      was_adjusted_by_restaurant: wasAdjusted,
      edits_count: order.edits?.length || 0,
      tracking_enabled: trackingEnabled,
      dian_fiscal_disclaimer: DIAN_FISCAL_DISCLAIMER_TEXT,
      customer_snapshot: maskedCustomer,
      branch_name: order.branch?.name,
      branch_whatsapp: order.branch?.phone_whatsapp_e164,
      created_at: order.created_at,
      items: order.items.map((item: any) => ({
        id: item.id,
        product_name: item.product_snapshot_json?.name || 'Producto',
        variant_name: item.product_snapshot_json?.variant_name || null,
        quantity: item.quantity,
        unit_price_cop: item.unit_price_cop,
        modifiers: item.modifiers_snapshot_json || [],
        line_total_cop: item.line_total_cop,
        notes: item.notes,
      })),
      timeline: trackingEnabled
        ? order.status_events.map((e: any) => ({
            from_status: e.from_status,
            to_status: e.to_status,
            occurred_at: e.occurred_at,
            reason: e.reason,
          }))
        : [],
    };
  }
}
