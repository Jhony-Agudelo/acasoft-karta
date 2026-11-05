import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { OrderCodeGeneratorService } from './order-code-generator.service';
import { SseStreamService } from '../notifications/sse-stream.service';
import {
  calculateLinePricing,
  formatMoneyCop,
  normalizeColombianPhoneToE164,
  buildCustomerToBranchWhatsappUrl,
  DIAN_FISCAL_DISCLAIMER_TEXT,
  type CreatePublicOrderDto,
  type CustomerSnapshot,
  type OrderTaxSummarySnapshot,
  type OrderItemProductSnapshot,
  type OrderItemModifierSnapshot,
  type OrderItemTaxSnapshot,
  type TaxProfileMode,
  type TaxType,
} from '@restaurante-saas/shared';

@Injectable()
export class CreatePublicOrderService {
  private readonly fraudPepperSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderCodeGenerator: OrderCodeGeneratorService,
    private readonly sseStream: SseStreamService,
  ) {
    this.fraudPepperSecret =
      process.env.FRAUD_PEPPER_SECRET || 'karta-default-fraud-pepper-secret-2026';
  }

  /**
   * Crea un pedido público de forma idempotente, con estricta autoridad del servidor sobre precios
   * y validando los 5 controles antifraude.
   */
  async createPublicOrder(tenantId: string, idempotencyKey: string, dto: CreatePublicOrderDto) {
    // 1. Validación de cabecera de idempotencia
    if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.length < 16 || idempotencyKey.length > 64) {
      throw new BadRequestException({
        errorCode: 'INVALID_IDEMPOTENCY_KEY',
        message: 'La cabecera Idempotency-Key es obligatoria y debe tener entre 16 y 64 caracteres.',
      });
    }

    // 1.1 Verificación de estado de la suscripción SaaS
    const sub = await (this.prisma as any).subscription.findUnique({
      where: { tenant_id: tenantId },
      select: { status: true },
    });
    if (sub?.status === 'SUSPENDED') {
      throw new ForbiddenException({
        errorCode: 'TENANT_SUBSCRIPTION_SUSPENDED',
        message: 'El restaurante no puede recibir pedidos en este momento debido a que su suscripción se encuentra suspendida.',
      });
    }

    return this.prisma.withTenant(tenantId, async (tx) => {
      // 2. Control de idempotencia aislado por tenant
      const existingOrder = await tx.order.findUnique({
        where: {
          uq_orders_tenant_idempotency: {
            tenant_id: tenantId,
            idempotency_key: idempotencyKey,
          },
        },
        include: {
          branch: true,
        },
      });

      if (existingOrder) {
        const trackingUrl = `http://localhost:5173/t/${existingOrder.public_token}`;
        return {
          order_id: existingOrder.id,
          order_code: existingOrder.order_code,
          origin: existingOrder.origin,
          fulfillment_type: existingOrder.fulfillment_type,
          status: existingOrder.status,
          payment_policy: existingOrder.payment_policy,
          payment_status: existingOrder.payment_status,
          subtotal_products_cop: existingOrder.subtotal_products_cop,
          delivery_fee_cop: existingOrder.delivery_fee_cop,
          tax_total_cop: existingOrder.tax_total_cop,
          grand_total_cop: existingOrder.grand_total_cop,
          public_token: existingOrder.public_token,
          tracking_url: trackingUrl,
          whatsapp_redirect_url: `https://wa.me/${existingOrder.branch.phone_whatsapp_e164.replace(/\D/g, '')}`,
          payment_instructions: null,
        };
      }

      // 3. Validación de Sucursal y Tenancy
      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
      });

      if (!tenant || tenant.status !== 'ACTIVE') {
        throw new NotFoundException({
          errorCode: 'TENANT_NOT_FOUND',
          message: 'Restaurante no encontrado o inactivo.',
        });
      }

      const branch = await tx.branch.findFirst({
        where: { id: dto.branch_id, tenant_id: tenantId },
      });

      if (!branch || branch.status !== 'ACTIVE') {
        throw new NotFoundException({
          errorCode: 'BRANCH_NOT_FOUND',
          message: 'Sucursal no encontrada o inactiva.',
        });
      }

      // 4. Verificación de políticas del canal y horario
      const channelPolicy = await tx.branchChannelPolicy.findFirst({
        where: {
          tenant_id: tenantId,
          branch_id: dto.branch_id,
          fulfillment_type: dto.fulfillment_type,
        },
      });

      if (channelPolicy && !channelPolicy.enabled) {
        throw new BadRequestException({
          errorCode: 'CHANNEL_DISABLED',
          message: `La modalidad '${dto.fulfillment_type}' no está habilitada actualmente en esta sucursal.`,
        });
      }

      const paymentPolicy = channelPolicy?.payment_policy || 'NONE';
      const requirePaymentBeforePrep =
        paymentPolicy === 'OFFLINE_ONLY' ? channelPolicy?.require_payment_before_preparation ?? false : false;

      // Verificación de Salón y PIN para TABLE_QR / DINE_IN
      let tableId: string | null = null;
      let tableCode: string | null = null;
      let diningAccountId: string | null = null;

      if (dto.origin === 'TABLE_QR' || dto.fulfillment_type === 'DINE_IN') {
        let table = null;
        if (dto.qr_token) {
          const qrLink = await (tx as any).qrCodeLink.findFirst({
            where: {
              tenant_id: tenantId,
              branch_id: dto.branch_id,
              qr_token: dto.qr_token,
              target_type: 'DINING_TABLE',
              is_active: true,
            },
          });
          if (qrLink && qrLink.table_id) {
            table = await (tx as any).table.findUnique({ where: { id: qrLink.table_id } });
          }
        }
        if (!table && dto.table_id) {
          table = await (tx as any).table.findFirst({
            where: { id: dto.table_id, tenant_id: tenantId, branch_id: dto.branch_id },
          });
        }

        if (table) {
          tableId = table.id;
          tableCode = table.code;
          const openAccount = await (tx as any).diningAccount.findFirst({
            where: {
              tenant_id: tenantId,
              branch_id: dto.branch_id,
              table_id: table.id,
              status: 'OPEN',
            },
          });

          if (!openAccount) {
            throw new ConflictException({
              errorCode: 'TABLE_ACCOUNT_NOT_OPEN',
              message:
                'La mesa no tiene una cuenta abierta actualmente. Por favor solicite a su mesero la apertura de la mesa.',
            });
          }

          if (channelPolicy?.require_table_pin) {
            if (!dto.table_pin || dto.table_pin !== openAccount.table_session_pin) {
              throw new ForbiddenException({
                errorCode: 'INVALID_TABLE_PIN',
                message: 'El PIN de mesa ingresado es incorrecto.',
              });
            }
          }

          diningAccountId = openAccount.id;
        }
      }

      // 5. Antifraude: Normalización telefónica, firma HMAC y límite de pedidos abiertos
      let phoneE164: string;
      try {
        phoneE164 = normalizeColombianPhoneToE164(dto.customer.phone);
      } catch (err: any) {
        throw new BadRequestException({
          errorCode: 'INVALID_PHONE_NUMBER',
          message: err?.message || 'Número de teléfono inválido.',
        });
      }

      const phoneHmac = crypto
        .createHmac('sha256', this.fraudPepperSecret)
        .update(`${tenantId}:${phoneE164}`)
        .digest('hex');

      // Comprobar bloqueo directo o por HMAC
      const blockedCustomer = await tx.customer.findFirst({
        where: {
          tenant_id: tenantId,
          is_blocked: true,
          OR: [
            { phone_e164: phoneE164 },
            { blocked_phone_hmac: phoneHmac },
          ],
        },
      });

      if (blockedCustomer) {
        throw new ForbiddenException({
          errorCode: 'CUSTOMER_PHONE_BLOCKED',
          message: 'No es posible procesar solicitudes desde este número.',
        });
      }

      // Comprobar límite de 3 pedidos abiertos por teléfono en la misma sucursal
      const openStatuses = [
        'REQUESTED',
        'RECEIVED',
        'ACCEPTED',
        'PREPARING',
        'READY',
        'OUT_FOR_DELIVERY',
      ];

      const activeOrdersCount = await tx.order.count({
        where: {
          tenant_id: tenantId,
          branch_id: dto.branch_id,
          status: { in: openStatuses },
          customer: {
            phone_e164: phoneE164,
          },
        },
      });

      if (activeOrdersCount >= 3) {
        throw new HttpException(
          {
            errorCode: 'MAX_OPEN_ORDERS_PER_PHONE_EXCEEDED',
            message: 'Ya tienes 3 pedidos en curso en esta sucursal.',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // 6. Upsert del Cliente
      let customer = await tx.customer.findUnique({
        where: {
          uq_customers_tenant_phone: {
            tenant_id: tenantId,
            phone_e164: phoneE164,
          },
        },
      });

      const now = new Date();
      if (customer) {
        customer = await tx.customer.update({
          where: { id: customer.id },
          data: {
            name: dto.customer.name,
            last_order_at: now,
          },
        });
      } else {
        customer = await tx.customer.create({
          data: {
            tenant_id: tenantId,
            name: dto.customer.name,
            phone_e164: phoneE164,
            privacy_consent_at: now,
            last_order_at: now,
          },
        });
      }

      // 7. Zona de Entrega y Dirección
      let deliveryZoneId: string | null = null;
      let deliveryZoneName: string | null = null;
      let deliveryFeeCop = 0;
      let minOrderRequiredCop = 0;

      if (dto.fulfillment_type === 'DELIVERY') {
        if (!dto.delivery?.delivery_zone_id) {
          throw new BadRequestException({
            errorCode: 'DELIVERY_ZONE_REQUIRED',
            message: 'Debe especificar una zona de entrega para pedidos a domicilio.',
          });
        }

        const zone = await tx.deliveryZone.findFirst({
          where: {
            id: dto.delivery.delivery_zone_id,
            tenant_id: tenantId,
            branch_id: dto.branch_id,
          },
        });

        if (!zone || !zone.is_active) {
          throw new BadRequestException({
            errorCode: 'DELIVERY_ZONE_NOT_FOUND',
            message: 'Zona de entrega no válida o inactiva.',
          });
        }

        deliveryZoneId = zone.id;
        deliveryZoneName = zone.name;
        deliveryFeeCop = zone.delivery_fee_cop;
        minOrderRequiredCop = zone.min_order_cop;

        // Registrar dirección de entrega
        await tx.deliveryAddress.create({
          data: {
            tenant_id: tenantId,
            customer_id: customer.id,
            address_line: dto.delivery.address_line,
            neighborhood: dto.delivery.neighborhood,
            reference_notes: dto.delivery.reference_notes || null,
          },
        });
      }

      // 8. Carga de Productos y Modificadores desde PostgreSQL (Autoridad Absoluta del Servidor)
      const productIds: string[] = Array.from(new Set(dto.items.map((i) => i.product_id)));

      interface LoadedProduct {
        id: string;
        category_id: string;
        name: string;
        description: string | null;
        price_cop: number;
        tax_type: string;
        tax_rate_bp: number;
        override_station_key: string | null;
        status: string;
        category: {
          id: string;
          name: string;
          default_station_key: string | null;
        };
        variants: Array<{
          id: string;
          name: string;
          price_cop: number;
          status: string;
        }>;
        modifier_groups: Array<{
          group: {
            id: string;
            name: string;
            is_required: boolean;
            min_selections: number;
            max_selections: number;
            options: Array<{
              id: string;
              name: string;
              extra_price_cop: number;
              status: string;
            }>;
          };
        }>;
      }

      const products = (await (tx as any).product.findMany({
        where: {
          id: { in: productIds },
          tenant_id: tenantId,
        },
        include: {
          category: true,
          variants: true,
          modifier_groups: {
            include: {
              group: {
                include: {
                  options: true,
                },
              },
            },
          },
        },
      })) as LoadedProduct[];

      const productMap = new Map<string, LoadedProduct>(products.map((p) => [p.id, p]));

      let subtotalProductsCop = 0;
      let taxTotalCop = 0;
      const orderItemsData: any[] = [];
      const lineTaxSnapshots: OrderItemTaxSnapshot[] = [];

      for (const itemDto of dto.items) {
        const product = productMap.get(itemDto.product_id);
        if (!product || product.status !== 'ACTIVE') {
          throw new BadRequestException({
            errorCode: 'PRODUCT_OR_MODIFIER_UNAVAILABLE',
            message: `El producto solicitado no está disponible.`,
          });
        }

        // Variantes
        let effectiveBasePriceCop = product.price_cop;
        let variantName: string | null = null;
        if (itemDto.variant_id) {
          const variant = product.variants.find((v) => v.id === itemDto.variant_id);
          if (!variant || variant.status !== 'ACTIVE') {
            throw new BadRequestException({
              errorCode: 'PRODUCT_OR_MODIFIER_UNAVAILABLE',
              message: `La variante solicitada para '${product.name}' no está disponible.`,
            });
          }
          effectiveBasePriceCop = variant.price_cop;
          variantName = variant.name;
        }

        // Modificadores
        const chosenModifiers: OrderItemModifierSnapshot[] = [];
        const modifierPricings: Array<{ extra_price_cop: number }> = [];

        // Normalizar modificadores deduciendo el group_id si viene ausente o con UUID nulo
        const effectiveModifiers = (itemDto.modifiers || []).map((m) => {
          if (m.group_id && m.group_id !== '00000000-0000-0000-0000-000000000000') {
            return m;
          }
          const matchedPmg = product.modifier_groups.find((g) =>
            g.group.options.some((opt) => opt.id === m.option_id),
          );
          return {
            group_id: matchedPmg ? matchedPmg.group.id : m.group_id,
            option_id: m.option_id,
          };
        });

        // Validar grupos de modificadores vinculados
        for (const pmg of product.modifier_groups) {
          const group = pmg.group;
          const selectionsForGroup = effectiveModifiers.filter(
            (m) => m.group_id === group.id,
          );

          if (group.is_required && selectionsForGroup.length < Math.max(1, group.min_selections)) {
            throw new BadRequestException({
              errorCode: 'PRODUCT_OR_MODIFIER_UNAVAILABLE',
              message: `El grupo de modificadores '${group.name}' es obligatorio.`,
            });
          }

          if (group.max_selections > 0 && selectionsForGroup.length > group.max_selections) {
            throw new BadRequestException({
              errorCode: 'PRODUCT_OR_MODIFIER_UNAVAILABLE',
              message: `Se excedió el límite máximo de selecciones para '${group.name}'.`,
            });
          }
        }

        // Validar cada modificador seleccionado
        for (const modSelection of effectiveModifiers) {
          const pmg = product.modifier_groups.find((g) => g.group.id === modSelection.group_id);
          if (!pmg) {
            throw new BadRequestException({
              errorCode: 'PRODUCT_OR_MODIFIER_UNAVAILABLE',
              message: `El grupo de modificadores no pertenece al producto.`,
            });
          }
          const option = pmg.group.options.find((o) => o.id === modSelection.option_id);
          if (!option || option.status !== 'ACTIVE') {
            throw new BadRequestException({
              errorCode: 'PRODUCT_OR_MODIFIER_UNAVAILABLE',
              message: `La opción de modificador no está disponible o está agotada.`,
            });
          }

          chosenModifiers.push({
            group_id: pmg.group.id,
            group_name: pmg.group.name,
            option_id: option.id,
            option_name: option.name,
            extra_price_cop: option.extra_price_cop,
          });
          modifierPricings.push({ extra_price_cop: option.extra_price_cop });
        }

        // Cálculo de línea con la función matemática determinista
        const linePricing = calculateLinePricing({
          basePriceCop: effectiveBasePriceCop,
          modifiers: modifierPricings,
          quantity: itemDto.quantity,
          discountCop: 0,
          taxProfileMode: tenant.tax_profile_mode as TaxProfileMode,
          taxType: product.tax_type as TaxType,
          taxRateBp: product.tax_rate_bp,
        });

        subtotalProductsCop += linePricing.net_subtotal_cop;
        taxTotalCop += linePricing.tax_amount_cop;

        const productSnapshot: OrderItemProductSnapshot = {
          product_id: product.id,
          category_id: product.category_id,
          category_name: product.category.name,
          product_name: product.name,
          product_description: product.description,
          base_product_price_cop: product.price_cop,
          variant_id: itemDto.variant_id || null,
          variant_name: variantName,
          effective_base_price_cop: effectiveBasePriceCop,
        };

        const taxSnapshot: OrderItemTaxSnapshot = {
          tax_profile_mode: tenant.tax_profile_mode as TaxProfileMode,
          tax_type: product.tax_type as TaxType,
          tax_rate_bp: product.tax_rate_bp,
          unit_base_plus_modifiers_cop: linePricing.effective_unit_price_cop,
          gross_line_subtotal_cop: linePricing.gross_subtotal_cop,
          discount_cop: 0,
          taxable_base_cop: linePricing.taxable_base_cop,
          tax_amount_cop: linePricing.tax_amount_cop,
          line_total_cop: linePricing.line_total_cop,
        };

        lineTaxSnapshots.push(taxSnapshot);

        orderItemsData.push({
          tenant_id: tenantId,
          product_id: product.id,
          product_snapshot_json: {
            ...productSnapshot,
            name: product.name,
          } as any,
          quantity: itemDto.quantity,
          unit_price_cop: linePricing.effective_unit_price_cop,
          discount_cop: 0,
          modifiers_snapshot_json: chosenModifiers as any,
          tax_snapshot_json: taxSnapshot as any,
          line_total_cop: linePricing.line_total_cop,
          station_key: product.override_station_key || product.category.default_station_key || null,
          status: 'PENDING',
          notes: itemDto.notes || null,
        });
      }

      // Validar pedido mínimo de la zona
      if (dto.fulfillment_type === 'DELIVERY' && subtotalProductsCop < minOrderRequiredCop) {
        throw new BadRequestException({
          errorCode: 'MIN_ORDER_AMOUNT_NOT_MET',
          message: `El pedido mínimo para la zona '${deliveryZoneName}' es de ${formatMoneyCop(minOrderRequiredCop)}. Subtotal actual: ${formatMoneyCop(subtotalProductsCop)}.`,
          min_order_cop: minOrderRequiredCop,
          current_subtotal_cop: subtotalProductsCop,
        });
      }

      // Cálculo del Total General (Grand Total)
      const taxAddition = tenant.tax_profile_mode === 'BASE_PLUS_TAX' ? taxTotalCop : 0;
      const grandTotalCop = subtotalProductsCop + deliveryFeeCop + taxAddition;

      // 9. Resumen Tributario (Tax Summary Snapshot)
      const taxSummarySnapshot: OrderTaxSummarySnapshot = {
        tax_profile_mode: tenant.tax_profile_mode as TaxProfileMode,
        breakdown_by_tax: [
          {
            tax_type: tenant.default_tax_type as TaxType,
            tax_rate_bp: tenant.default_tax_rate_bp,
            taxable_base_cop: lineTaxSnapshots.reduce((acc, t) => acc + t.taxable_base_cop, 0),
            tax_amount_cop: taxTotalCop,
            total_with_tax_cop: subtotalProductsCop + taxAddition,
          },
        ],
        fiscal_disclaimer: DIAN_FISCAL_DISCLAIMER_TEXT,
      };

      // 10. Snapshot de Cliente
      const customerSnapshot: CustomerSnapshot = {
        name: dto.customer.name,
        phone_e164: phoneE164,
        delivery_zone_id: deliveryZoneId,
        delivery_zone_name: deliveryZoneName,
        address_line: dto.delivery?.address_line || null,
        neighborhood: dto.delivery?.neighborhood || null,
        reference_notes: dto.delivery?.reference_notes || null,
        privacy_consent_at: customer.privacy_consent_at.toISOString(),
        payment_method: dto.payment_method || null,
        cash_amount_delivered_cop: dto.cash_amount_delivered_cop ?? null,
        change_to_give_cop: dto.change_to_give_cop ?? null,
        transfer_channel: dto.transfer_channel || null,
      };

      // 11. Estado inicial e invariantes financieras
      const initialStatus =
        dto.origin === 'WHATSAPP' || dto.origin === 'TABLE_QR'
          ? 'REQUESTED'
          : 'RECEIVED';
      const initialPaymentPolicy =
        dto.fulfillment_type === 'DINE_IN' || dto.origin === 'TABLE_QR'
          ? 'OFFLINE_ONLY'
          : paymentPolicy;
      const initialPaymentStatus =
        initialPaymentPolicy === 'NONE' ? 'NOT_TRACKED' : 'UNPAID';

      // 12. Generación de Order Code (#A101) y Public Token
      const orderCode = await this.orderCodeGenerator.generateDailyOrderCode(
        tx,
        tenantId,
        dto.branch_id,
        branch.timezone,
      );
      const publicToken = crypto.randomBytes(32).toString('base64url');

      // 13. Inserción de Orden, Ítems y Evento de Estado
      const createdOrder = await tx.order.create({
        data: {
          tenant_id: tenantId,
          branch_id: dto.branch_id,
          order_code: orderCode,
          origin: dto.origin,
          fulfillment_type: dto.fulfillment_type,
          status: initialStatus,
          payment_policy: initialPaymentPolicy,
          require_payment_before_preparation:
            dto.fulfillment_type === 'DINE_IN' || dto.origin === 'TABLE_QR'
              ? false
              : requirePaymentBeforePrep,
          payment_status: initialPaymentStatus,
          table_id: tableId,
          dining_account_id: diningAccountId,
          customer_id: customer.id,
          customer_snapshot_json: customerSnapshot as any,
          public_token: publicToken,
          idempotency_key: idempotencyKey,
          subtotal_products_cop: subtotalProductsCop,
          discount_total_cop: 0,
          delivery_fee_cop: deliveryFeeCop,
          tax_total_cop: taxTotalCop,
          tip_cop: 0,
          grand_total_cop: grandTotalCop,
          paid_total_cop: 0,
          tax_summary_snapshot_json: taxSummarySnapshot as any,
          notes: dto.notes || null,
          items: {
            create: orderItemsData,
          },
          status_events: {
            create: {
              tenant_id: tenantId,
              from_status: null,
              to_status: initialStatus,
              reason: 'Creación inicial de pedido',
              visible_to_customer: true,
            },
          },
        },
        include: {
          items: true,
        },
      });

      if (dto.origin === 'TABLE_QR') {
        this.sseStream.emitToBranch(tenantId, dto.branch_id, 'dining.qr_order_requested', {
          order_id: createdOrder.id,
          order_code: createdOrder.order_code,
          table_id: tableId,
          table_code: tableCode,
          dining_account_id: diningAccountId,
          message: `Nuevo pedido comensal en Mesa ${tableCode || ''}`,
        });
      }

      // 14. Generación de Enlace WhatsApp (wa.me)
      const whatsappRedirectUrl = buildCustomerToBranchWhatsappUrl({
        branchWhatsAppPhone: branch.phone_whatsapp_e164,
        orderCode: createdOrder.order_code,
        restaurantName: tenant.name,
        customerName: dto.customer.name,
        fulfillmentType: dto.fulfillment_type,
        items: createdOrder.items.map((it: any) => {
          const pSnap = it.product_snapshot_json as OrderItemProductSnapshot;
          const mSnap = (it.modifiers_snapshot_json as OrderItemModifierSnapshot[]) || [];
          return {
            quantity: it.quantity,
            productName: pSnap.product_name,
            variantName: pSnap.variant_name,
            modifiers: mSnap.map((m) => m.option_name),
            unitPriceCop: it.unit_price_cop,
            lineTotalCop: it.line_total_cop,
          };
        }),
        subtotalProductsCop: createdOrder.subtotal_products_cop,
        deliveryFeeCop: createdOrder.delivery_fee_cop,
        grandTotalCop: createdOrder.grand_total_cop,
        deliveryAddress: dto.delivery
          ? {
              addressLine: dto.delivery.address_line,
              neighborhood: dto.delivery.neighborhood,
              referenceNotes: dto.delivery.reference_notes || null,
            }
          : null,
        notes: dto.notes,
        paymentMethod: dto.payment_method || null,
        cashAmountDeliveredCop: dto.cash_amount_delivered_cop ?? null,
        changeToGiveCop: dto.change_to_give_cop ?? null,
      });

      const trackingUrl = `http://localhost:5173/t/${createdOrder.public_token}`;

      return {
        order_id: createdOrder.id,
        order_code: createdOrder.order_code,
        origin: createdOrder.origin,
        fulfillment_type: createdOrder.fulfillment_type,
        status: createdOrder.status,
        payment_policy: createdOrder.payment_policy,
        payment_status: createdOrder.payment_status,
        subtotal_products_cop: createdOrder.subtotal_products_cop,
        delivery_fee_cop: createdOrder.delivery_fee_cop,
        tax_total_cop: createdOrder.tax_total_cop,
        grand_total_cop: createdOrder.grand_total_cop,
        public_token: createdOrder.public_token,
        tracking_url: trackingUrl,
        whatsapp_redirect_url: whatsappRedirectUrl,
        payment_instructions: channelPolicy?.payment_instructions_json || null,
      };
    });
  }
}
