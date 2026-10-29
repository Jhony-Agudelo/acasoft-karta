import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';

export interface StandTableInfo {
  id: string;
  code: string;
  capacity?: number;
  areaName?: string;
  qrUrl: string;
  pinRequired?: boolean;
}

export interface PrintStandOptions {
  tables: StandTableInfo[];
  brandName?: string;
}

/**
 * Genera el HTML completo con estilos `@media print` para imprimir uno o varios portamesas físicos.
 * Utiliza SVG puro embebido sin dependencias externas para garantizar renderizado instantáneo.
 */
export function generateStandPrintHtml(options: PrintStandOptions): string {
  const { tables, brandName = 'KARTA BISTRO' } = options;

  const cardsHtml = tables
    .map((table) => {
      const qrSvgString = renderToStaticMarkup(
        React.createElement(QRCodeSVG, {
          value: table.qrUrl,
          size: 160,
          level: 'H',
          includeMargin: false,
          fgColor: '#1c1917',
          bgColor: '#ffffff',
        }),
      );

      return `
        <div class="stand-page">
          <div class="stand-card">
            <!-- Encabezado de Marca -->
            <div class="brand-block">
              <div class="brand-title">${brandName.toUpperCase()}</div>
              <div class="area-subtitle">${(table.areaName || 'Salón Principal').toUpperCase()}</div>
            </div>

            <!-- Identificador de Mesa -->
            <div class="table-block">
              <div class="table-heading">MESA ${table.code}</div>
              <div class="instructions">Escanea con tu celular para ver la carta y pedir</div>
            </div>

            <!-- Código QR de Alta Definición -->
            <div class="qr-box">
              ${qrSvgString}
            </div>

            <!-- Instrucción de PIN y Enlace Seguro -->
            <div class="pin-block">
              <div class="pin-badge">
                <span class="pin-icon">🔑</span>
                <span>Tu mesero te dará el PIN de 4 dígitos al sentarte</span>
              </div>
              <div class="url-backup">${table.qrUrl}</div>
            </div>

            <!-- Pie de Tarjeta -->
            <div class="powered-tag">POWERED BY KARTA RESTAURANT SAAS</div>
          </div>
        </div>
      `;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Portamesas QR - ${brandName}</title>
        <style>
          @page {
            size: A6 portrait;
            margin: 0;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: #ffffff;
            color: #1c1917;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .stand-page {
            width: 105mm;
            min-height: 148mm;
            height: 148mm;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 5mm;
            page-break-after: always;
            page-break-inside: avoid;
            background: #ffffff;
          }
          .stand-page:last-child {
            page-break-after: auto;
          }
          .stand-card {
            width: 95mm;
            height: 138mm;
            border: 2px dashed #78716c;
            border-radius: 16px;
            padding: 7mm 6mm;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: space-between;
            text-align: center;
            background: #ffffff;
          }
          .brand-block {
            width: 100%;
          }
          .brand-title {
            font-size: 13pt;
            font-weight: 900;
            color: #ea580c;
            letter-spacing: 2px;
            text-transform: uppercase;
          }
          .area-subtitle {
            font-size: 8.5pt;
            font-weight: 700;
            color: #78716c;
            margin-top: 2px;
          }
          .table-block {
            width: 100%;
          }
          .table-heading {
            font-size: 26pt;
            font-weight: 900;
            color: #1c1917;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            line-height: 1.1;
            margin-top: 2px;
          }
          .instructions {
            font-size: 8pt;
            font-weight: 600;
            color: #57534e;
            margin-top: 3px;
          }
          .qr-box {
            padding: 3mm;
            border: 1px solid #e7e5e4;
            border-radius: 14px;
            background: #ffffff;
            margin: 3px 0;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .qr-box svg {
            display: block;
            width: 150px;
            height: 150px;
          }
          .pin-block {
            width: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          .pin-badge {
            background: #fef3c7;
            border: 1px solid #fde68a;
            color: #78350f;
            font-size: 7.5pt;
            font-weight: 800;
            padding: 3px 10px;
            border-radius: 20px;
            display: inline-flex;
            align-items: center;
            gap: 4px;
          }
          .pin-icon {
            font-size: 9pt;
          }
          .url-backup {
            font-size: 6.5pt;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            color: #a8a29e;
            margin-top: 4px;
            max-width: 80mm;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .powered-tag {
            font-size: 6.5pt;
            color: #d6d3d1;
            font-weight: 700;
            letter-spacing: 1px;
          }
        </style>
      </head>
      <body>
        ${cardsHtml}
      </body>
    </html>
  `;
}

/**
 * Servicio de impresión de Portamesas QR que inyecta un iframe aislado.
 * Nunca es bloqueado por el bloqueador de ventanas emergentes de Chrome/Edge
 * y nunca imprime el fondo de la pantalla de la aplicación.
 */
export function printPortamesaStands(options: PrintStandOptions): void {
  const { tables } = options;
  if (!tables || tables.length === 0) return;

  const html = generateStandPrintHtml(options);

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.setAttribute('title', 'Karta Portamesa Print Container');
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    if (iframe.parentNode) document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  // Esperar a que el iframe procese el contenido y disparar diálogo nativo de impresión
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.error('Error al imprimir portamesas en iframe:', err);
    } finally {
      // Limpieza segura del DOM tras la impresión
      setTimeout(() => {
        if (iframe.parentNode) {
          document.body.removeChild(iframe);
        }
      }, 2000);
    }
  }, 400);
}

/**
 * Descarga una imagen PNG de alta resolución (1200x1600) para imprenta o corte en acrílico.
 * Renderiza el QR con renderToStaticMarkup y Canvas de forma 100% independiente del DOM.
 */
export function downloadPortamesaPng(table: StandTableInfo, brandName: string = 'KARTA BISTRO'): void {
  const qrSvgString = renderToStaticMarkup(
    React.createElement(QRCodeSVG, {
      value: table.qrUrl,
      size: 650,
      level: 'H',
      includeMargin: true,
      fgColor: '#1c1917',
      bgColor: '#ffffff',
    }),
  );

  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1600;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    // Fondo blanco nítido
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Marco punteado de corte para imprenta / acrílico
    ctx.strokeStyle = '#A8A29E';
    ctx.lineWidth = 4;
    ctx.setLineDash([16, 12]);
    ctx.strokeRect(50, 50, canvas.width - 100, canvas.height - 100);
    ctx.setLineDash([]); // Reset line dash

    // Nombre del restaurante
    ctx.fillStyle = '#EA580C'; // orange-600
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(brandName.toUpperCase(), 600, 180);

    // Zona o Ambiente
    if (table.areaName) {
      ctx.fillStyle = '#78716C'; // stone-500
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText(table.areaName.toUpperCase(), 600, 235);
    }

    // Número de mesa
    ctx.fillStyle = '#1C1917'; // stone-900
    ctx.font = '900 115px sans-serif';
    ctx.fillText(`MESA ${table.code}`, 600, 380);

    // Subtítulo
    ctx.fillStyle = '#57534E'; // stone-600
    ctx.font = '500 34px sans-serif';
    ctx.fillText('Escanea con tu celular para ver la carta y pedir', 600, 450);

    // Código QR centrado (650x650)
    ctx.drawImage(img, 275, 520, 650, 650);

    // Instrucción de PIN
    ctx.fillStyle = '#9A3412'; // amber-800
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText('Tu mesero te dará el PIN de 4 dígitos al sentarte', 600, 1270);

    // Enlace de respaldo
    ctx.fillStyle = '#A8A29E'; // stone-400
    ctx.font = '24px monospace';
    ctx.fillText(table.qrUrl, 600, 1340);

    // Footer Karta
    ctx.fillStyle = '#D6D3D1';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('POWERED BY KARTA RESTAURANT SAAS', 600, 1490);

    const pngUrl = canvas.toDataURL('image/png');
    const downloadLink = document.createElement('a');
    downloadLink.href = pngUrl;
    downloadLink.download = `Portamesa-${table.code}.png`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };

  img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(qrSvgString)));
}
