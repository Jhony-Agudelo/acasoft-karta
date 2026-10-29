/**
 * Formateador de Recibos Térmicos (58mm / 80mm) con Leyenda Fiscal DIAN
 * Alineado con DEFINICION_TECNICA.md (v2.4.0 — Sección 8.2) y FASE_05_REPORTES_SUSCRIPCION_MANUAL_Y_PWA.md
 */

import { formatMoneyCop } from './money-cop';

export const DIAN_THERMAL_RECEIPT_DISCLAIMER =
  'Documento informativo de control interno / pre-cuenta — No sustituye la factura electrónica de venta ni el documento equivalente POS exigido por la DIAN';

export interface ThermalReceiptItem {
  name: string;
  variant?: string | null;
  quantity: number;
  unitPriceCop: number;
  lineTotalCop: number;
  modifiers?: Array<{ name: string; priceCop?: number }>;
  notes?: string | null;
}

export interface ThermalReceiptPayment {
  method: string;
  amountCop: number;
  cashReceivedCop?: number | null;
  cashChangeCop?: number | null;
  reference?: string | null;
}

export interface ThermalReceiptData {
  restaurantName: string;
  branchName: string;
  branchAddress?: string | null;
  branchPhone?: string | null;
  orderCode: string;
  createdAt: string | Date;
  origin: string;
  fulfillmentType: string;
  tableName?: string | null;
  customerName?: string | null;
  customerPhoneMasked?: string | null;
  deliveryAddressMasked?: string | null;
  items: ThermalReceiptItem[];
  subtotalProductsCop: number;
  taxProfileMode: string;
  taxableBaseCop?: number;
  taxIncCop?: number;
  taxIvaCop?: number;
  discountTotalCop?: number;
  deliveryFeeCop?: number;
  tipCop?: number;
  grandTotalCop: number;
  payments: ThermalReceiptPayment[];
  paidTotalCop: number;
  pendingBalanceCop: number;
}

/**
 * Formatea un recibo de texto monospacio para impresoras térmicas de 58mm (32 columnas) u 80mm (42 columnas).
 */
export function formatThermalReceiptText(
  data: ThermalReceiptData,
  options: { width: '58mm' | '80mm' } = { width: '80mm' },
): string {
  const cols = options.width === '58mm' ? 32 : 42;
  const separator = '-'.repeat(cols);
  const doubleSeparator = '='.repeat(cols);

  const center = (text: string): string => {
    if (text.length >= cols) return text;
    const leftPad = Math.floor((cols - text.length) / 2);
    return ' '.repeat(leftPad) + text;
  };

  const wrapText = (text: string): string[] => {
    const words = text.split(' ');
    const wrapped: string[] = [];
    let current = '';

    for (const word of words) {
      if ((current + (current ? ' ' : '') + word).length <= cols) {
        current += (current ? ' ' : '') + word;
      } else {
        if (current) wrapped.push(center(current));
        current = word;
      }
    }
    if (current) wrapped.push(center(current));
    return wrapped;
  };

  const line2 = (left: string, right: string): string => {
    const space = cols - left.length - right.length;
    if (space <= 0) return `${left.slice(0, cols - right.length - 1)} ${right}`;
    return left + ' '.repeat(space) + right;
  };

  const lines: string[] = [];

  // Encabezado
  lines.push(center(data.restaurantName.toUpperCase()));
  lines.push(center(data.branchName));
  if (data.branchAddress) lines.push(center(data.branchAddress));
  if (data.branchPhone) lines.push(center(`Tel: ${data.branchPhone}`));
  lines.push(doubleSeparator);

  // Datos de la comanda
  lines.push(line2(`ORDEN: #${data.orderCode}`, data.fulfillmentType));
  const dateStr =
    typeof data.createdAt === 'string'
      ? new Date(data.createdAt).toLocaleString('es-CO')
      : data.createdAt.toLocaleString('es-CO');
  lines.push(line2('Fecha:', dateStr));
  if (data.tableName) lines.push(line2('Mesa / Salón:', data.tableName));
  if (data.customerName) lines.push(line2('Cliente:', data.customerName));
  if (data.customerPhoneMasked) lines.push(line2('Teléfono:', data.customerPhoneMasked));
  if (data.deliveryAddressMasked) lines.push(line2('Dirección:', data.deliveryAddressMasked));
  lines.push(separator);

  // Detalle de ítems
  lines.push(line2('DESCRIPCIÓN', 'TOTAL'));
  lines.push(separator);

  for (const item of data.items) {
    const itemHeader = `${item.quantity}x ${item.name}${item.variant ? ` (${item.variant})` : ''}`;
    lines.push(line2(itemHeader, formatMoneyCop(item.lineTotalCop)));

    if (item.modifiers && item.modifiers.length > 0) {
      for (const mod of item.modifiers) {
        lines.push(`  + ${mod.name}${mod.priceCop ? ` (${formatMoneyCop(mod.priceCop)})` : ''}`);
      }
    }
    if (item.notes) {
      lines.push(`  * Nota: ${item.notes}`);
    }
  }

  lines.push(separator);

  // Totales y Desglose de Impuestos
  lines.push(line2('Subtotal Productos:', formatMoneyCop(data.subtotalProductsCop)));

  if (data.discountTotalCop && data.discountTotalCop > 0) {
    lines.push(line2('Descuento:', `-${formatMoneyCop(data.discountTotalCop)}`));
  }

  // Discriminación fiscal solo si aplica según el modo del restaurante
  if (data.taxProfileMode !== 'FINAL_PRICE_NO_BREAKDOWN') {
    if (data.taxableBaseCop && data.taxableBaseCop > 0) {
      lines.push(line2('  Base Gravable:', formatMoneyCop(data.taxableBaseCop)));
    }
    if (data.taxIncCop && data.taxIncCop > 0) {
      lines.push(line2('  Impoconsumo (8%):', formatMoneyCop(data.taxIncCop)));
    }
    if (data.taxIvaCop && data.taxIvaCop > 0) {
      lines.push(line2('  IVA (19%):', formatMoneyCop(data.taxIvaCop)));
    }
  }

  if (data.deliveryFeeCop && data.deliveryFeeCop > 0) {
    lines.push(line2('Costo Domicilio:', formatMoneyCop(data.deliveryFeeCop)));
  }

  if (data.tipCop && data.tipCop > 0) {
    lines.push(line2('Propina Voluntaria:', formatMoneyCop(data.tipCop)));
  }

  lines.push(doubleSeparator);
  lines.push(line2('TOTAL A PAGAR:', formatMoneyCop(data.grandTotalCop)));
  lines.push(doubleSeparator);

  // Desglose de Pagos
  if (data.payments && data.payments.length > 0) {
    lines.push('PAGOS REGISTRADOS:');
    for (const p of data.payments) {
      lines.push(line2(`  ${p.method}:`, formatMoneyCop(p.amountCop)));
      if (p.method === 'CASH' && p.cashReceivedCop != null && p.cashReceivedCop > 0) {
        lines.push(line2('    Efectivo Recibido:', formatMoneyCop(p.cashReceivedCop)));
        lines.push(line2('    Cambio Entregado:', formatMoneyCop(p.cashChangeCop || 0)));
      }
      if (p.reference) {
        lines.push(`    Ref: ${p.reference}`);
      }
    }
    lines.push(separator);
    lines.push(line2('Total Recaudado:', formatMoneyCop(data.paidTotalCop)));
    if (data.pendingBalanceCop > 0) {
      lines.push(line2('SALDO PENDIENTE:', formatMoneyCop(data.pendingBalanceCop)));
    }
    lines.push(separator);
  }

  // Leyenda Fiscal Obligatoria de la DIAN
  lines.push('');
  lines.push(...wrapText(DIAN_THERMAL_RECEIPT_DISCLAIMER));
  lines.push('');
  lines.push(center('*** GRACIAS POR SU COMPRA ***'));

  return lines.join('\n');
}
