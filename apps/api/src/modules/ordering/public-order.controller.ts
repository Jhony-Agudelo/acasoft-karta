import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Param,
  UsePipes,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { CreatePublicOrderService } from './create-public-order.service';
import { PrismaService } from '../../database/prisma.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CreatePublicOrderSchema, CreatePublicOrderDto } from '@restaurante-saas/shared';

@Controller('public/orders')
export class PublicOrderController {
  constructor(
    private readonly orderService: CreatePublicOrderService,
    private readonly prisma: PrismaService,
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

    // Resolver el tenant_id a partir de la sucursal o de la cabecera
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
   * Consulta pública de seguimiento de pedido mediante su token opaco de 256 bits.
   * GET /api/v1/public/orders/track/:publicToken
   */
  @Public()
  @Get('track/:publicToken')
  async trackOrder(@Param('publicToken') publicToken: string) {
    const order = await this.prisma.order.findUnique({
      where: { public_token: publicToken },
      include: {
        branch: {
          select: {
            name: true,
            phone_whatsapp_e164: true,
          },
        },
        items: true,
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
      customer_snapshot: order.customer_snapshot_json,
      created_at: order.created_at,
      branch_name: order.branch.name,
      items: order.items,
      events: order.status_events,
    };
  }
}
