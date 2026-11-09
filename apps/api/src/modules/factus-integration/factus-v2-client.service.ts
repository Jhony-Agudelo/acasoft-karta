import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FactusAuthService } from './factus-auth.service';

export interface FactusApiResponse<T = any> {
  status: string;
  message?: string;
  data: T;
  errors?: Record<string, string[]>;
}

@Injectable()
export class FactusV2ClientService {
  private readonly logger = new Logger(FactusV2ClientService.name);

  constructor(private readonly authService: FactusAuthService) {}

  /**
   * Ejecuta una petición HTTP autenticada hacia Factus API v2
   * Maneja reintentos transparentes ante token expirado (401)
   */
  async request<T = any>(
    tenantId: string,
    path: string,
    init: RequestInit = {},
    isRetry = false,
  ): Promise<FactusApiResponse<T>> {
    const { accessToken, baseUrl } = await this.authService.getValidAccessToken(tenantId);
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${baseUrl}${cleanPath}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...((init.headers as Record<string, string>) || {}),
    };

    if (init.body && typeof init.body === 'string' && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers,
      });
    } catch (netErr) {
      this.logger.error(`Error de red contra Factus v2 (${url}): ${(netErr as Error).message}`);
      throw new HttpException(
        `Error de conexión con el proveedor tecnológico Factus: ${(netErr as Error).message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    // Si recibimos 401 Unauthorized y no es ya un reintento, invalidamos token y reintentamos una vez
    if (response.status === 401 && !isRetry) {
      this.logger.warn(`Token Factus expirado o revocado (401). Invalidando caché y reintentando...`);
      this.authService.invalidateTenantToken(tenantId);
      return this.request<T>(tenantId, path, init, true);
    }

    const json = (await response.json().catch(() => null)) as any;

    if (!response.ok) {
      const errorMsg =
        json?.message ||
        json?.error ||
        json?.error_description ||
        (json?.errors ? Object.values(json.errors).flat().join('; ') : `HTTP ${response.status}`);

      this.logger.error(`Factus API v2 respondió error ${response.status} en ${cleanPath}: ${errorMsg}`);

      throw new HttpException(
        {
          statusCode: response.status,
          message: `Factus API v2 error: ${errorMsg}`,
          factusErrors: json?.errors,
          factusResponse: json,
        },
        response.status >= 500 ? HttpStatus.BAD_GATEWAY : HttpStatus.BAD_REQUEST,
      );
    }

    return json as FactusApiResponse<T>;
  }

  // ---------------------------------------------------------------------------
  // 1. RANGOS DE NUMERACIÓN
  // ---------------------------------------------------------------------------

  /**
   * Consulta rangos de facturas, notas crédito/débito y documento soporte (GET /v2/numbering-ranges)
   */
  async getNumberingRanges(tenantId: string): Promise<any> {
    return this.request(tenantId, '/v2/numbering-ranges', { method: 'GET' });
  }

  /**
   * Consulta rangos de nómina electrónica (GET /v2/numbering-ranges/payrolls)
   */
  async getPayrollNumberingRanges(tenantId: string): Promise<any> {
    return this.request(tenantId, '/v2/numbering-ranges/payrolls', { method: 'GET' });
  }

  // ---------------------------------------------------------------------------
  // 2. CONSULTA EN VIVO DE ADQUIRENTES DIAN (AUTOCOMPLETADO POS)
  // ---------------------------------------------------------------------------

  /**
   * Consulta en tiempo real los datos tributarios registrados en la DIAN de un adquirente
   * GET /v2/dian/acquirer?identification_document_code=...&identification_number=...
   */
  async lookupAcquirer(tenantId: string, docCode: string, docNumber: string): Promise<any> {
    const query = new URLSearchParams({
      identification_document_code: docCode,
      identification_number: docNumber,
    }).toString();
    return this.request(tenantId, `/v2/dian/acquirer?${query}`, { method: 'GET' });
  }

  // ---------------------------------------------------------------------------
  // 3. FACTURACIÓN ELECTRÓNICA DE VENTA (BILLS)
  // ---------------------------------------------------------------------------

  /**
   * Valida y emite una Factura Electrónica de Venta (POST /v2/bills/validate)
   */
  async validateBill(tenantId: string, payload: any): Promise<any> {
    return this.request(tenantId, '/v2/bills/validate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Limpia un borrador no validado en Factus para liberar el reference_code
   * DELETE /v2/bills/destroy/reference/:reference_code
   */
  async destroyBillDraftByReference(tenantId: string, referenceCode: string): Promise<any> {
    try {
      return await this.request(tenantId, `/v2/bills/destroy/reference/${referenceCode}`, {
        method: 'DELETE',
      });
    } catch (err) {
      this.logger.warn(`No se pudo eliminar borrador de factura ${referenceCode} (o no existía): ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Descarga el PDF oficial de una factura (GET /v2/bills/:number/download-pdf)
   */
  async downloadBillPdf(tenantId: string, billNumber: string): Promise<any> {
    return this.request(tenantId, `/v2/bills/${billNumber}/download-pdf`, { method: 'GET' });
  }

  /**
   * Descarga el XML UBL 2.1 oficial de una factura (GET /v2/bills/:number/download-xml)
   */
  async downloadBillXml(tenantId: string, billNumber: string): Promise<any> {
    return this.request(tenantId, `/v2/bills/${billNumber}/download-xml`, { method: 'GET' });
  }

  /**
   * Reenvía la factura electrónica al correo del cliente (POST /v2/bills/:number/send-email)
   */
  async sendBillEmail(tenantId: string, billNumber: string): Promise<any> {
    return this.request(tenantId, `/v2/bills/${billNumber}/send-email`, { method: 'POST' });
  }

  // ---------------------------------------------------------------------------
  // 4. NOTAS CRÉDITO Y NOTAS DÉBITO
  // ---------------------------------------------------------------------------

  /**
   * Valida y emite una Nota Crédito (POST /v2/credit-notes/validate)
   */
  async validateCreditNote(tenantId: string, payload: any): Promise<any> {
    return this.request(tenantId, '/v2/credit-notes/validate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Limpia borrador no validado de nota crédito
   * DELETE /v2/credit-notes/reference/:reference_code
   */
  async destroyCreditNoteDraftByReference(tenantId: string, referenceCode: string): Promise<any> {
    try {
      return await this.request(tenantId, `/v2/credit-notes/reference/${referenceCode}`, {
        method: 'DELETE',
      });
    } catch {
      return null;
    }
  }

  /**
   * Descarga el PDF oficial de una nota crédito (GET /v2/credit-notes/:number/download-pdf)
   */
  async downloadCreditNotePdf(tenantId: string, number: string): Promise<any> {
    return this.request(tenantId, `/v2/credit-notes/${number}/download-pdf`, { method: 'GET' });
  }

  /**
   * Valida y emite una Nota Débito (POST /v2/debit-notes/validate)
   */
  async validateDebitNote(tenantId: string, payload: any): Promise<any> {
    return this.request(tenantId, '/v2/debit-notes/validate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // ---------------------------------------------------------------------------
  // 5. DOCUMENTO SOPORTE ELECTRÓNICO (COMPRAS A INFORMALES)
  // ---------------------------------------------------------------------------

  /**
   * Valida y emite un Documento Soporte Electrónico (POST /v2/support-documents/validate)
   */
  async validateSupportDocument(tenantId: string, payload: any): Promise<any> {
    return this.request(tenantId, '/v2/support-documents/validate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Limpia borrador no validado de documento soporte
   * DELETE /v2/support-documents/reference/:reference_code
   */
  async destroySupportDocumentDraftByReference(tenantId: string, referenceCode: string): Promise<any> {
    try {
      return await this.request(tenantId, `/v2/support-documents/reference/${referenceCode}`, {
        method: 'DELETE',
      });
    } catch {
      return null;
    }
  }

  /**
   * Valida y emite una Nota de Ajuste a Documento Soporte (POST /v2/adjustment-notes/validate)
   */
  async validateSupportAdjustmentNote(tenantId: string, payload: any): Promise<any> {
    return this.request(tenantId, '/v2/adjustment-notes/validate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Descarga el PDF oficial de un documento soporte (GET /v2/support-documents/:number/download-pdf)
   */
  async downloadSupportDocumentPdf(tenantId: string, number: string): Promise<any> {
    return this.request(tenantId, `/v2/support-documents/${number}/download-pdf`, { method: 'GET' });
  }

  // ---------------------------------------------------------------------------
  // 6. RECEPCIÓN DE FACTURAS Y EVENTOS RADIAN
  // ---------------------------------------------------------------------------

  /**
   * Carga una factura recibida para su procesamiento RADIAN (POST /v2/receptions/upload)
   */
  async uploadReceptionInvoice(tenantId: string, fileBuffer: Buffer, fileName: string): Promise<any> {
    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: 'application/octet-stream' });
    formData.append('file', blob, fileName);

    return this.request(tenantId, '/v2/receptions/upload', {
      method: 'POST',
      body: formData,
    });
  }

  /**
   * Consulta las facturas recibidas de proveedores (GET /v2/receptions/bills)
   */
  async getReceptionBills(tenantId: string): Promise<any> {
    return this.request(tenantId, '/v2/receptions/bills', { method: 'GET' });
  }

  /**
   * Emite un evento RADIAN sobre una factura recibida (030, 032, 033, 034)
   * PATCH /v2/receptions/bills/:billId/radian/events/:eventType
   */
  async emitRadianEvent(tenantId: string, receptionBillId: string, eventType: string): Promise<any> {
    return this.request(tenantId, `/v2/receptions/bills/${receptionBillId}/radian/events/${eventType}`, {
      method: 'PATCH',
    });
  }

  // ---------------------------------------------------------------------------
  // 7. NÓMINA ELECTRÓNICA
  // ---------------------------------------------------------------------------

  /**
   * Valida y emite Nómina Electrónica (POST /v2/payrolls)
   */
  async validatePayroll(tenantId: string, payload: any): Promise<any> {
    return this.request(tenantId, '/v2/payrolls', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Limpia borrador no validado de nómina electrónica
   * DELETE /v2/payrolls/reference/:reference_code
   */
  async destroyPayrollDraftByReference(tenantId: string, referenceCode: string): Promise<any> {
    try {
      return await this.request(tenantId, `/v2/payrolls/reference/${referenceCode}`, {
        method: 'DELETE',
      });
    } catch {
      return null;
    }
  }

  /**
   * Valida y emite Nota de Ajuste de Nómina Electrónica (POST /v2/adjustment-payrolls)
   */
  async validateAdjustmentPayroll(tenantId: string, payload: any): Promise<any> {
    return this.request(tenantId, '/v2/adjustment-payrolls', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Descarga PDF oficial de nómina electrónica (GET /v2/payrolls/:number/download-pdf)
   */
  async downloadPayrollPdf(tenantId: string, number: string): Promise<any> {
    return this.request(tenantId, `/v2/payrolls/${number}/download-pdf`, { method: 'GET' });
  }
}
