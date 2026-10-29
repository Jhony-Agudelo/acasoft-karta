import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  SalesReportQueryDto,
  SalesReportResponseDto,
  BillingSummaryDto,
  ReconciliationSummaryDto,
  CollectionsByMethodDto,
  NotTrackedOrdersSummaryDto,
  UncollectedResolutionItemDto,
  ExcludedOrdersSummaryDto,
  OperationalMetricsDto,
  allocateCollectedBreakdown,
  computeReceivableAndUncollected,
  verifyMasterReconciliationEquation,
} from '@restaurante-saas/shared';

export function parseBogotaDateRange(dateFrom: string, dateTo: string): { startUtc: Date; endUtc: Date } {
  // Colombia opera en UTC-5 todo el año sin horario de verano (DST)
  const startUtc = new Date(`${dateFrom}T00:00:00.000-05:00`);
  const endUtc = new Date(`${dateTo}T23:59:59.999-05:00`);

  if (isNaN(startUtc.getTime()) || isNaN(endUtc.getTime())) {
    throw new BadRequestException('Formato de fecha inválido. Utilice formato YYYY-MM-DD');
  }

  if (startUtc > endUtc) {
    throw new BadRequestException('date_from no puede ser posterior a date_to');
  }

  return { startUtc, endUtc };
}

function escapeCsvCell(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatBogotaDateTime(d: Date): string {
  // Desplazar 5 horas para obtener hora en Colombia (UTC-5)
  const bogotaOffsetMs = -5 * 60 * 60 * 1000;
  const bogotaTime = new Date(d.getTime() + bogotaOffsetMs);
  const iso = bogotaTime.toISOString(); // YYYY-MM-DDTHH:mm:ss.sssZ
  return iso.substring(0, 19).replace('T', ' ');
}

@Injectable()
export class ReportingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Genera el reporte de ventas y conciliación financiera del periodo solicitado.
   */
  async getSalesReport(
    tenantId: string,
    query: SalesReportQueryDto,
    userBranchScope?: string[],
  ): Promise<SalesReportResponseDto> {
    const { startUtc, endUtc } = parseBogotaDateRange(query.date_from, query.date_to);

    const where: any = {
      tenant_id: tenantId,
      dining_account_id: null,
      created_at: {
        gte: startUtc,
        lte: endUtc,
      },
    };

    if (query.branch_id) {
      where.branch_id = query.branch_id;
    } else if (userBranchScope && userBranchScope.length > 0) {
      where.branch_id = { in: userBranchScope };
    }

    if (query.origin) {
      where.origin = query.origin;
    }

    if (query.fulfillment_type) {
      where.fulfillment_type = query.fulfillment_type;
    }

    const orders = await this.prisma.order.findMany({
      where,
      include: {
        payments: {
          where: { status: 'APPROVED' },
        },
        items: {
          select: {
            product_snapshot_json: true,
            quantity: true,
            line_total_cop: true,
          },
        },
        status_events: {
          orderBy: { occurred_at: 'asc' },
        },
        branch: {
          select: { id: true, name: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    // Mapear nombres de usuarios que resolvieron saldos si existen
    const resolverIds = Array.from(
      new Set(
        orders
          .map((o) => o.resolved_by)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const resolverMap = new Map<string, string>();
    if (resolverIds.length > 0) {
      const resolvers = await this.prisma.user.findMany({
        where: { id: { in: resolverIds } },
        select: { id: true, name: true },
      });
      resolvers.forEach((r) => resolverMap.set(r.id, r.name));
    }

    // Inicializar acumuladores
    const billingSummary: BillingSummaryDto = {
      confirmed_orders_count: 0,
      net_products_sales_cop: 0,
      taxable_base_cop: 0,
      tax_inc_cop: 0,
      tax_iva_cop: 0,
      discount_total_cop: 0,
      delivery_fees_total_cop: 0,
      tips_total_cop: 0,
      gross_billed_total_cop: 0,
    };

    const reconciliationSummary: ReconciliationSummaryDto = {
      collected_total_cop: 0,
      collected_products_cop: 0,
      collected_delivery_cop: 0,
      collected_tips_cop: 0,
      pending_receivable_cop: 0,
      courtesy_total_cop: 0,
      written_off_total_cop: 0,
      is_balanced: true,
    };

    const collectionsByMethod: CollectionsByMethodDto = {
      CASH: 0,
      POS_TERMINAL: 0,
      MANUAL_TRANSFER: 0,
    };

    const notTrackedOrdersSummary: NotTrackedOrdersSummaryDto = {
      count: 0,
      nominal_total_cop: 0,
    };

    const uncollectedResolutionsDetail: UncollectedResolutionItemDto[] = [];

    const excludedOrdersSummary: ExcludedOrdersSummaryDto = {
      requested_unprocessed_count: 0,
      rejected_count: 0,
      cancelled_count: 0,
      expired_count: 0,
    };

    // Métricas operativas
    const productAggregationMap = new Map<string, { quantity: number; totalCop: number }>();
    const prepDurationsMinutes: number[] = [];
    const deliveryDurationsMinutes: number[] = [];

    const EXCLUDED_STATUSES = ['REQUESTED', 'REJECTED', 'CANCELLED', 'EXPIRED_UNPROCESSED'];

    for (const order of orders) {
      // 1. Clasificación de órdenes excluidas
      if (EXCLUDED_STATUSES.includes(order.status)) {
        if (order.status === 'REQUESTED') excludedOrdersSummary.requested_unprocessed_count++;
        else if (order.status === 'REJECTED') excludedOrdersSummary.rejected_count++;
        else if (order.status === 'CANCELLED') excludedOrdersSummary.cancelled_count++;
        else if (order.status === 'EXPIRED_UNPROCESSED') excludedOrdersSummary.expired_count++;
        continue; // No computa en métricas financieras ni conciliación
      }

      // 2. Órdenes con política NONE (NOT_TRACKED del Nivel 1)
      if (order.payment_policy === 'NONE') {
        notTrackedOrdersSummary.count++;
        notTrackedOrdersSummary.nominal_total_cop += order.grand_total_cop;

        // Registrar productos vendidos para métricas operativas
        this.accumulateOrderProducts(order.items, productAggregationMap);
        this.accumulateOrderDurations(order.status_events, prepDurationsMinutes, deliveryDurationsMinutes);
        continue;
      }

      // 3. Órdenes confirmadas monitoreadas (OFFLINE_ONLY)
      billingSummary.confirmed_orders_count++;

      const netProducts = order.subtotal_products_cop - order.discount_total_cop;
      billingSummary.net_products_sales_cop += netProducts;
      billingSummary.discount_total_cop += order.discount_total_cop;
      billingSummary.delivery_fees_total_cop += order.delivery_fee_cop;
      billingSummary.tips_total_cop += order.tip_cop;
      billingSummary.gross_billed_total_cop += order.grand_total_cop;

      // Desglose de impuestos desde el snapshot
      const taxSnapshot = order.tax_summary_snapshot_json as any;
      if (taxSnapshot) {
        billingSummary.taxable_base_cop += taxSnapshot.taxable_base_cop || 0;
        billingSummary.tax_inc_cop += taxSnapshot.tax_inc_cop || 0;
        billingSummary.tax_iva_cop += taxSnapshot.tax_iva_cop || 0;
      }

      // Procesar pagos aprobados
      let paidTotalForOrder = 0;
      for (const p of order.payments) {
        paidTotalForOrder += p.amount_cop;
        if (p.method === 'CASH') collectionsByMethod.CASH += p.amount_cop;
        else if (p.method === 'POS_TERMINAL') collectionsByMethod.POS_TERMINAL += p.amount_cop;
        else if (p.method === 'MANUAL_TRANSFER') collectionsByMethod.MANUAL_TRANSFER += p.amount_cop;
      }

      // Imputar recaudo por prelación (1º Productos, 2º Domicilio, 3º Propina)
      const allocated = allocateCollectedBreakdown({
        netProductsCop: netProducts,
        deliveryFeeCop: order.delivery_fee_cop,
        tipCop: order.tip_cop,
        paidTotalCop: paidTotalForOrder,
      });

      reconciliationSummary.collected_products_cop += allocated.collected_products_cop;
      reconciliationSummary.collected_delivery_cop += allocated.collected_delivery_cop;
      reconciliationSummary.collected_tips_cop += allocated.collected_tips_cop;
      reconciliationSummary.collected_total_cop += paidTotalForOrder;

      // Calcular cubos de saldo por cobrar y resoluciones
      const receivableBreakdown = computeReceivableAndUncollected({
        grandTotalCop: order.grand_total_cop,
        paidTotalCop: paidTotalForOrder,
        paymentStatus: order.payment_status as any,
        uncollectedAmountCop: order.uncollected_amount_cop,
      });

      reconciliationSummary.pending_receivable_cop += receivableBreakdown.pendingReceivableCop;
      reconciliationSummary.courtesy_total_cop += receivableBreakdown.courtesyCop;
      reconciliationSummary.written_off_total_cop += receivableBreakdown.writtenOffCop;

      // Detalle de resoluciones
      if (order.resolution_type && order.uncollected_amount_cop > 0) {
        uncollectedResolutionsDetail.push({
          order_id: order.id,
          order_code: order.order_code,
          occurred_at: order.resolved_at ? order.resolved_at.toISOString() : order.created_at.toISOString(),
          resolution_type: order.resolution_type as 'COURTESY' | 'WRITTEN_OFF',
          uncollected_amount_cop: order.uncollected_amount_cop,
          resolution_reason: order.resolution_reason || '',
          resolved_by_name: order.resolved_by ? resolverMap.get(order.resolved_by) || null : null,
        });
      }

      // Métricas operativas
      this.accumulateOrderProducts(order.items, productAggregationMap);
      this.accumulateOrderDurations(order.status_events, prepDurationsMinutes, deliveryDurationsMinutes);
    }

    // Verificar ecuación maestra
    const equationResult = verifyMasterReconciliationEquation({
      grossBilledTotalCop: billingSummary.gross_billed_total_cop,
      collectedTotalCop: reconciliationSummary.collected_total_cop,
      pendingReceivableCop: reconciliationSummary.pending_receivable_cop,
      courtesyTotalCop: reconciliationSummary.courtesy_total_cop,
      writtenOffTotalCop: reconciliationSummary.written_off_total_cop,
    });
    reconciliationSummary.is_balanced = equationResult.isBalanced;

    // Métricas operativas consolidadas
    const topProducts = Array.from(productAggregationMap.entries())
      .map(([product_name, data]) => ({
        product_name,
        quantity_sold: data.quantity,
        total_cop: data.totalCop,
      }))
      .sort((a, b) => b.quantity_sold - a.quantity_sold)
      .slice(0, 10);

    const avgPrepMinutes =
      prepDurationsMinutes.length > 0
        ? Math.round((prepDurationsMinutes.reduce((a, b) => a + b, 0) / prepDurationsMinutes.length) * 10) / 10
        : null;

    const avgDeliveryMinutes =
      deliveryDurationsMinutes.length > 0
        ? Math.round((deliveryDurationsMinutes.reduce((a, b) => a + b, 0) / deliveryDurationsMinutes.length) * 10) / 10
        : null;

    const operationalMetrics: OperationalMetricsDto = {
      top_products: topProducts,
      avg_prep_minutes: avgPrepMinutes,
      avg_delivery_minutes: avgDeliveryMinutes,
    };

    return {
      period: {
        date_from: query.date_from,
        date_to: query.date_to,
        timezone: 'America/Bogota',
      },
      billing_summary: billingSummary,
      reconciliation_summary: reconciliationSummary,
      collections_by_method: collectionsByMethod,
      not_tracked_orders_summary: notTrackedOrdersSummary,
      uncollected_resolutions_detail: uncollectedResolutionsDetail,
      excluded_orders_summary: excludedOrdersSummary,
      operational_metrics: operationalMetrics,
    };
  }

  /**
   * Exporta a CSV con BOM UTF-8, garantizando estricta exclusión de PII.
   */
  async exportSalesCsv(
    tenantId: string,
    query: SalesReportQueryDto,
    actorId: string,
    userBranchScope?: string[],
  ): Promise<{ csvString: string; filename: string }> {
    const { startUtc, endUtc } = parseBogotaDateRange(query.date_from, query.date_to);

    const where: any = {
      tenant_id: tenantId,
      dining_account_id: null,
      created_at: {
        gte: startUtc,
        lte: endUtc,
      },
    };

    if (query.branch_id) {
      where.branch_id = query.branch_id;
    } else if (userBranchScope && userBranchScope.length > 0) {
      where.branch_id = { in: userBranchScope };
    }

    if (query.origin) {
      where.origin = query.origin;
    }

    if (query.fulfillment_type) {
      where.fulfillment_type = query.fulfillment_type;
    }

    const orders = await this.prisma.order.findMany({
      where,
      include: {
        payments: {
          where: { status: 'APPROVED' },
        },
        branch: {
          select: { id: true, name: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const headers = [
      'codigo',
      'tipo_registro',
      'fecha_hora_bogota',
      'sucursal',
      'origen',
      'modalidad',
      'estado_operativo',
      'politica_cobro',
      'estado_pago',
      'venta_neta_productos_cop',
      'base_gravable_cop',
      'impuesto_inc_cop',
      'impuesto_iva_cop',
      'descuento_cop',
      'domicilio_cop',
      'propina_cop',
      'total_facturado_cop',
      'recaudado_efectivo_cop',
      'recaudado_datafono_cop',
      'recaudado_transferencia_cop',
      'total_recaudado_cop',
      'saldo_por_cobrar_cop',
      'monto_no_recaudado_cop',
      'tipo_resolucion',
      'motivo_resolucion',
    ];

    const EXCLUDED_STATUSES = ['REQUESTED', 'REJECTED', 'CANCELLED', 'EXPIRED_UNPROCESSED'];
    const rows: string[] = [];

    for (const order of orders) {
      const isExcluded = EXCLUDED_STATUSES.includes(order.status);
      const isNotTracked = !isExcluded && order.payment_policy === 'NONE';

      let tipoRegistro = 'ORDEN_CONFIRMADA';
      if (isExcluded) tipoRegistro = 'ORDEN_EXCLUIDA';
      else if (isNotTracked) tipoRegistro = 'ORDEN_NIVEL1_NO_MONITOREADA';

      const netProducts = order.subtotal_products_cop - order.discount_total_cop;
      const taxSnapshot = (order.tax_summary_snapshot_json as any) || {};

      let cashCop = 0;
      let posCop = 0;
      let transferCop = 0;

      for (const p of order.payments) {
        if (p.method === 'CASH') cashCop += p.amount_cop;
        else if (p.method === 'POS_TERMINAL') posCop += p.amount_cop;
        else if (p.method === 'MANUAL_TRANSFER') transferCop += p.amount_cop;
      }

      const totalPaid = cashCop + posCop + transferCop;

      let pendingReceivable = 0;
      if (!isExcluded && !isNotTracked) {
        const receivableBreakdown = computeReceivableAndUncollected({
          grandTotalCop: order.grand_total_cop,
          paidTotalCop: totalPaid,
          paymentStatus: order.payment_status as any,
          uncollectedAmountCop: order.uncollected_amount_cop,
        });
        pendingReceivable = receivableBreakdown.pendingReceivableCop;
      }

      const rowValues = [
        escapeCsvCell(order.order_code),
        escapeCsvCell(tipoRegistro),
        escapeCsvCell(formatBogotaDateTime(order.created_at)),
        escapeCsvCell(order.branch?.name || ''),
        escapeCsvCell(order.origin),
        escapeCsvCell(order.fulfillment_type),
        escapeCsvCell(order.status),
        escapeCsvCell(order.payment_policy),
        escapeCsvCell(order.payment_status),
        escapeCsvCell(netProducts),
        escapeCsvCell(taxSnapshot.taxable_base_cop || 0),
        escapeCsvCell(taxSnapshot.tax_inc_cop || 0),
        escapeCsvCell(taxSnapshot.tax_iva_cop || 0),
        escapeCsvCell(order.discount_total_cop),
        escapeCsvCell(order.delivery_fee_cop),
        escapeCsvCell(order.tip_cop),
        escapeCsvCell(order.grand_total_cop),
        escapeCsvCell(cashCop),
        escapeCsvCell(posCop),
        escapeCsvCell(transferCop),
        escapeCsvCell(totalPaid),
        escapeCsvCell(pendingReceivable),
        escapeCsvCell(order.uncollected_amount_cop),
        escapeCsvCell(order.resolution_type || ''),
        escapeCsvCell(order.resolution_reason || ''),
      ];

      rows.push(rowValues.join(','));
    }

    // Prefijar con UTF-8 BOM (\uFEFF) para apertura correcta en Excel
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');

    // Registrar en auditoría Cero PII
    await this.auditService.record({
      tenantId,
      branchId: query.branch_id || null,
      actorId,
      action: 'SALES_REPORT_CSV_EXPORTED',
      entityType: 'REPORT',
      entityId: tenantId,
      metadata: {
        date_from: query.date_from,
        date_to: query.date_to,
        branch_id: query.branch_id || 'ALL',
        exported_orders_count: orders.length,
      },
    });

    const filename = `reporte_ventas_${query.date_from}_${query.date_to}.csv`;
    return { csvString: csvContent, filename };
  }

  private accumulateOrderProducts(
    items: Array<{ product_snapshot_json: any; quantity: number; line_total_cop: number }>,
    map: Map<string, { quantity: number; totalCop: number }>,
  ) {
    for (const item of items) {
      const snap = item.product_snapshot_json as any;
      const name = snap?.name || 'Producto Desconocido';
      const existing = map.get(name) || { quantity: 0, totalCop: 0 };
      existing.quantity += item.quantity;
      existing.totalCop += item.line_total_cop;
      map.set(name, existing);
    }
  }

  private accumulateOrderDurations(
    events: Array<{ to_status: string; occurred_at: Date }>,
    prepDurations: number[],
    deliveryDurations: number[],
  ) {
    let acceptedAt: Date | null = null;
    let readyAt: Date | null = null;
    let deliveredAt: Date | null = null;

    for (const ev of events) {
      if (ev.to_status === 'ACCEPTED' || ev.to_status === 'RECEIVED') {
        if (!acceptedAt) acceptedAt = ev.occurred_at;
      } else if (ev.to_status === 'READY') {
        if (!readyAt) readyAt = ev.occurred_at;
      } else if (ev.to_status === 'DELIVERED' || ev.to_status === 'PICKED_UP') {
        if (!deliveredAt) deliveredAt = ev.occurred_at;
      }
    }

    if (acceptedAt && readyAt && readyAt.getTime() >= acceptedAt.getTime()) {
      prepDurations.push((readyAt.getTime() - acceptedAt.getTime()) / 60000);
    }

    if (readyAt && deliveredAt && deliveredAt.getTime() >= readyAt.getTime()) {
      deliveryDurations.push((deliveredAt.getTime() - readyAt.getTime()) / 60000);
    }
  }
}
