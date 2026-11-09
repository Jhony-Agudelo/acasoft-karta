import React, { useState, useMemo } from 'react';
import {
  Printer,
  X,
  FileText,
  Utensils,
  Receipt,
  Copy,
  Check,
} from 'lucide-react';
import {
  formatThermalReceiptText,
  ThermalReceiptData,
} from '@restaurante-saas/shared';
import {
  printThermalContent,
  formatKitchenTicketText,
  ThermalPaperWidth,
} from '../../services/print-receipt';

export interface PrintReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any;
  branchName?: string;
  restaurantName?: string;
  receiptFooterText?: string;
  taxProfileMode?: 'FINAL_PRICE_NO_BREAKDOWN' | 'TAX_INCLUDED_DISCRIMINATED' | 'BASE_PLUS_TAX';
}

export const PrintReceiptModal: React.FC<PrintReceiptModalProps> = ({
  isOpen,
  onClose,
  order,
  branchName = 'Sucursal Principal',
  restaurantName = 'Karta Bistro',
  receiptFooterText,
  taxProfileMode = 'FINAL_PRICE_NO_BREAKDOWN',
}) => {
  const [ticketType, setTicketType] = useState<'RECEIPT' | 'KITCHEN'>('RECEIPT');
  const [paperWidth, setPaperWidth] = useState<ThermalPaperWidth>(() => {
    try {
      const saved = localStorage.getItem('karta_pos_thermal_paper_width');
      return saved === '58mm' || saved === '80mm' ? saved : '80mm';
    } catch {
      return '80mm';
    }
  });
  const cols = paperWidth === '58mm' ? 30 : 38;
  const [copied, setCopied] = useState(false);

  // Generar texto térmico reactivo
  const thermalText = useMemo(() => {
    if (!order) return '';

    if (ticketType === 'KITCHEN') {
      const items = (order.items || []).map((it: any) => {
        const snap = it.product_snapshot_json || {};
        const pName = snap.product_name || snap.name || it.product_name || it.name || 'Producto';
        const variant = snap.variant_name ? ` (${snap.variant_name})` : '';
        const mods = (it.modifiers_snapshot_json || []).map((m: any) => m.option_name || m.name);
        return {
          name: `${pName}${variant}`,
          quantity: it.quantity || 1,
          notes: it.notes,
          modifiers: mods,
        };
      });

      const tableLabel =
        order.table?.code ? `Mesa ${order.table.code}` :
        order.table_code ? `Mesa ${order.table_code}` :
        order.table_label ||
        (order.table_id ? `Mesa #${order.table_id.slice(0, 4)}` : null);

      return formatKitchenTicketText(
        {
          order_code: order.order_code,
          fulfillment_type: order.fulfillment_type,
          created_at: order.created_at,
          table_label: tableLabel,
          delivery_address: order.customer_snapshot_json?.delivery_address,
          notes: order.notes,
          items,
        },
        paperWidth,
      );
    }

    // Ticket tipo RECEIPT (Pre-cuenta / Recibo informativo de caja)
    const taxSnapshot = order.tax_summary_snapshot_json || {};
    const paidTotal = order.paid_total_cop || 0;
    const grandTotal = order.grand_total_cop || 0;

    const tableName =
      order.table?.code ? `Mesa ${order.table.code}` :
      order.table_code ? `Mesa ${order.table_code}` :
      order.table_label ||
      (order.table_id ? `Mesa #${order.table_id.slice(0, 4)}` : undefined);

    const receiptData: ThermalReceiptData = {
      restaurantName,
      branchName,
      orderCode: order.order_code,
      createdAt: order.created_at,
      origin: order.origin || 'WHATSAPP',
      fulfillmentType: order.fulfillment_type,
      tableName,
      items: (order.items || []).map((it: any) => {
        const snap = it.product_snapshot_json || {};
        const pName = snap.product_name || snap.name || it.product_name || it.name || 'Producto';
        const variant = snap.variant_name ? ` (${snap.variant_name})` : '';
        return {
          name: `${pName}${variant}`,
          quantity: it.quantity || 1,
          lineTotalCop: it.line_total_cop || 0,
          unitPriceCop: it.unit_price_cop || 0,
        };
      }),
      subtotalProductsCop: order.subtotal_products_cop || 0,
      discountTotalCop: order.discount_total_cop || 0,
      deliveryFeeCop: order.delivery_fee_cop || 0,
      tipCop: order.tip_cop || 0,
      grandTotalCop: grandTotal,
      taxProfileMode,
      taxableBaseCop: taxSnapshot.taxable_base_cop,
      taxIncCop: taxSnapshot.tax_inc_cop,
      taxIvaCop: taxSnapshot.tax_iva_cop,
      payments: (order.payments || [])
        .filter((p: any) => p.status === 'APPROVED')
        .map((p: any) => ({
          method: p.method,
          amountCop: p.amount_cop,
          cashReceivedCop: p.cash_received_cop,
          cashChangeCop: p.change_given_cop,
        })),
      paidTotalCop: paidTotal,
      pendingBalanceCop: Math.max(0, grandTotal - paidTotal),
    };

    return formatThermalReceiptText(receiptData, { width: paperWidth, cols });
  }, [order, ticketType, paperWidth, cols, restaurantName, branchName, receiptFooterText, taxProfileMode]);

  if (!isOpen || !order) return null;

  const handlePrint = () => {
    printThermalContent({
      content: thermalText,
      width: paperWidth,
    });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(thermalText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-orange-100 text-orange-600">
              <Printer className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900">
                Impresión Térmica — {order.order_code}
              </h2>
              <p className="text-xs text-stone-500">
                Previsualización con corte automático y leyenda fiscal DIAN
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/50 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Toolbar de selección */}
        <div className="p-4 bg-stone-100/70 border-b border-stone-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Tipo de Documento */}
          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-stone-200 shadow-sm">
            <button
              onClick={() => setTicketType('RECEIPT')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all ${
                ticketType === 'RECEIPT'
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Receipt className="h-3.5 w-3.5" />
              Pre-cuenta / Recibo
            </button>
            <button
              onClick={() => setTicketType('KITCHEN')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all ${
                ticketType === 'KITCHEN'
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Utensils className="h-3.5 w-3.5" />
              Comanda Cocina
            </button>
          </div>

          {/* Ancho Térmico */}
          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-stone-200 shadow-sm">
            <button
              onClick={() => {
                setPaperWidth('80mm');
                try {
                  localStorage.setItem('karta_pos_thermal_paper_width', '80mm');
                } catch {}
              }}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                paperWidth === '80mm'
                  ? 'bg-orange-600 text-white shadow-sm'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
              title="80mm Estándar (38 columnas — Ajuste óptimo anti-recortes)"
            >
              80 mm (Estándar)
            </button>
            <button
              onClick={() => {
                setPaperWidth('58mm');
                try {
                  localStorage.setItem('karta_pos_thermal_paper_width', '58mm');
                } catch {}
              }}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                paperWidth === '58mm'
                  ? 'bg-orange-600 text-white shadow-sm'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
              title="58mm Mini (30 columnas)"
            >
              58 mm (Mini)
            </button>
          </div>

          {/* Copiar texto */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-200 bg-white font-medium text-stone-600 hover:text-stone-900 shadow-sm transition-colors"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copiado' : 'Copiar Texto'}
          </button>
        </div>

        {/* Banner de Ayuda de Márgenes */}
        <div className="bg-amber-50/80 px-4 py-2 border-b border-amber-200/60 text-[11px] text-amber-900 flex items-center justify-between">
          <span>
            💡 <strong>Ajuste de Impresora:</strong> En la ventana de impresión de tu navegador (Chrome / Edge), asegúrate de poner <strong>Márgenes: "Ninguno" (None)</strong> para evitar que se desplace a la derecha.
          </span>
        </div>

        {/* Vista previa térmica tipo papel */}
        <div className="flex-1 overflow-y-auto p-6 bg-stone-200 flex justify-center">
          <div
            className={`bg-[#fffefb] border border-stone-300 shadow-md p-4 transition-all duration-200 text-stone-900 select-text ${
              paperWidth === '58mm' ? 'w-[280px]' : 'w-[360px]'
            }`}
            style={{
              fontFamily: "'Courier New', Courier, monospace",
              fontSize: paperWidth === '58mm' ? '11px' : '12px',
              lineHeight: '1.25',
              whiteSpace: 'pre-wrap',
            }}
          >
            {thermalText}
          </div>
        </div>

        {/* Footer con botón de imprimir */}
        <div className="px-6 py-4 border-t border-stone-200 flex items-center justify-between bg-stone-50">
          <p className="text-[11px] text-stone-500">
            Formato: <strong>{paperWidth}</strong> • Tipo: <strong>{ticketType === 'RECEIPT' ? 'Pre-cuenta' : 'Comanda'}</strong>
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-stone-600 hover:bg-stone-200/60 font-medium text-xs transition-colors"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-md shadow-orange-500/25 transition-all active:scale-95"
            >
              <Printer className="h-4 w-4" />
              Imprimir Térmica ({paperWidth})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
