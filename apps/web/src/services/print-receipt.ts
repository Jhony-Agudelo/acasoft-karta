import {
  formatThermalReceiptText,
  ThermalReceiptData,
  DIAN_THERMAL_RECEIPT_DISCLAIMER,
  formatDiningPreCuentaText,
  DiningPreCuentaData,
  DiningPreCuentaItem,
  DiningPreCuentaDiner,
  formatDiningPaymentReceiptText,
  DiningPaymentReceiptData,
} from '@restaurante-saas/shared';

export {
  formatDiningPreCuentaText,
  type DiningPreCuentaData,
  type DiningPreCuentaItem,
  type DiningPreCuentaDiner,
  formatDiningPaymentReceiptText,
  type DiningPaymentReceiptData,
};


export type ThermalPaperWidth = '58mm' | '80mm';

export interface PrintReceiptOptions {
  content: string;
  width?: ThermalPaperWidth;
}

/**
 * Servicio de impresión térmica para navegadores web.
 * Inyecta un iframe invisible temporal o utiliza una ventana emergente de impresión
 * con reglas @media print optimizadas para impresoras de 58mm y 80mm.
 */
export function printThermalContent(options: PrintReceiptOptions): void {
  const { content, width = '80mm' } = options;
  const mmWidth = width === '58mm' ? '58mm' : '80mm';

  // Crear iframe invisible para impresión limpia sin alterar el DOM de la aplicación
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    window.print();
    return;
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Impresión Térmica Karta</title>
        <style>
          @page {
            margin: 0;
          }
          @media print {
            * {
              box-sizing: border-box;
            }
            html, body {
              width: ${mmWidth};
              margin: 0 !important;
              padding: 0 !important;
              background: #fff;
              color: #000;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          }
          * {
            box-sizing: border-box;
          }
          body {
            width: ${mmWidth};
            max-width: ${mmWidth};
            font-family: 'Consolas', 'Courier New', Courier, monospace;
            font-size: ${width === '58mm' ? '9.5px' : '10.5px'};
            line-height: 1.25;
            white-space: pre;
            overflow: visible;
            word-break: keep-all;
            overflow-wrap: normal;
            padding: 2mm 3mm;
            margin: 0;
          }
        </style>
      </head>
      <body>${escapeHtml(content)}</body>
    </html>
  `;

  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.error('Error al invocar impresión térmica:', e);
    } finally {
      setTimeout(() => {
        if (iframe.parentNode) {
          document.body.removeChild(iframe);
        }
      }, 1000);
    }
  }, 250);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function wrapText(text: string, cols: number): string[] {
  const words = text.split(' ');
  const result: string[] = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      if (word.length > cols) {
        // Cortar palabras extremadamente largas
        for (let i = 0; i < word.length; i += cols) {
          result.push(word.substring(i, i + cols));
        }
      } else {
        current = word;
      }
    } else if ((current + ' ' + word).length <= cols) {
      current += ' ' + word;
    } else {
      result.push(current);
      if (word.length > cols) {
        for (let i = 0; i < word.length; i += cols) {
          result.push(word.substring(i, i + cols));
        }
        current = '';
      } else {
        current = word;
      }
    }
  }

  if (current) result.push(current);
  return result;
}

/**
 * Genera el texto formateado de comanda de cocina para impresora térmica.
 */
export function formatKitchenTicketText(order: {
  order_code: string;
  fulfillment_type: string;
  created_at: string | Date;
  table_label?: string | null;
  delivery_address?: string | null;
  notes?: string | null;
  items: Array<{
    name: string;
    quantity: number;
    notes?: string | null;
    modifiers?: string[];
  }>;
}, width: ThermalPaperWidth = '80mm'): string {
  const cols = width === '58mm' ? 30 : 36;
  const sep = '='.repeat(cols);
  const thinSep = '-'.repeat(cols);

  const lines: string[] = [];
  lines.push(centerText('*** COMANDA DE COCINA ***', cols));
  lines.push(centerText(`ORDEN: ${order.order_code}`, cols));
  lines.push(sep);

  const timeStr = new Date(order.created_at).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  });
  lines.push(`MODALIDAD: ${order.fulfillment_type}`);
  lines.push(`HORA: ${timeStr}`);

  if (order.table_label) {
    wrapText(`MESA: ${order.table_label}`, cols).forEach((l) => lines.push(l));
  }
  if (order.delivery_address) {
    wrapText(`DIRECCIÓN: ${order.delivery_address}`, cols).forEach((l) => lines.push(l));
  }
  if (order.notes) {
    wrapText(`NOTA: ${order.notes}`, cols).forEach((l) => lines.push(l));
  }

  lines.push(thinSep);
  lines.push(centerText('ITEMS A PREPARAR', cols));
  lines.push(thinSep);

  for (const item of order.items) {
    wrapText(`[ ] ${item.quantity}x ${item.name}`, cols).forEach((l) => lines.push(l));
    if (item.modifiers && item.modifiers.length > 0) {
      for (const m of item.modifiers) {
        wrapText(`    + ${m}`, cols).forEach((l) => lines.push(l));
      }
    }
    if (item.notes) {
      wrapText(`    NOTA: ${item.notes}`, cols).forEach((l) => lines.push(l));
    }
  }

  lines.push(sep);
  lines.push('\n\n\n'); // Espacio para corte de papel
  return lines.join('\n');
}

function centerText(text: string, cols: number): string {
  if (text.length >= cols) return text.substring(0, cols);
  const padLeft = Math.floor((cols - text.length) / 2);
  return ' '.repeat(padLeft) + text;
}
